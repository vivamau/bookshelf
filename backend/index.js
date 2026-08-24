const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const {
    applicationLogger,
    createDailyLogExport,
    createRequestErrorLogger,
    getApplicationLogEntries,
    getRequestContext,
    initializeApplicationLogging
} = require('./utils/applicationLogger');
initializeApplicationLogging();

const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const createCrudRouter = require('./utils/crudFactory');
const createSearchRouter = require('./routes/search');
const createAudiobookshelfRouters = require('./routes/audiobookshelf');
const auth = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 
const axios = require('axios');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const { spawn } = require('child_process');

const { scanLibrary, refreshCovers, importFiles, scanSingleFile, getComicPage } = require('./utils/libraryScanner');
const { filterBooksWithAvailableFiles, resolveBookFilePath } = require('./utils/bookFileResolver');
const { sendEmail } = require('./utils/mailer');
const { OpenAIConfigError, OpenAIRequestError, synthesizeSpeech } = require('./utils/openaiAudio');
const {
    AudiobookUploadError,
    findAudiobookUploadConflicts,
    resolveAudiobookUploadPath
} = require('./utils/audiobookUpload');
const {
    AudiobookProgressError,
    buildAudiobookProgress
} = require('./utils/audiobookProgress');
const {
    AudiobookCatalogError,
    COVER_EXTENSIONS,
    MANAGED_COVER_PREFIX,
    enrichAudiobookDurations,
    createStaleWhileRevalidateLoader,
    findAudiobookByFolder,
    getAudiobookContentType,
    resolveAudiobookAudioPath,
    resolveAudiobookCoverPath,
    resolveAudiobookDirectoryPath,
    scanAudiobookCatalog,
    writeAudiobookMetadata
} = require('./utils/audiobookCatalog');
const {
    AudiobookAuthorError,
    deleteAudiobookRecord,
    enrichAudiobookCatalog,
    findOrCreateAuthorByName,
    replaceAudiobookAuthors
} = require('./utils/audiobookAuthors');
const { RemoteImageError, downloadRemoteImage } = require('./utils/remoteImage');
const {
    AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
    buildAuthorizationResponse,
    buildAudiobookSeriesCatalog,
    buildAudiobookshelfUser,
    buildMediaProgress
} = require('./utils/audiobookshelfAdapter');
const { getRequestToken } = require('./routes/audiobookshelf');
const serverVersion = require('./package.json').version;

// Security: Ensure TOKEN_KEY is set or generate one
let TOKEN_KEY = process.env.TOKEN_KEY;
if (!TOKEN_KEY) {
    console.warn("WARNING: TOKEN_KEY not set in environment. Using a random secret for this session. Tokens will be invalidated on restart.");
    const crypto = require('crypto');
    TOKEN_KEY = crypto.randomBytes(64).toString('hex');
    process.env.TOKEN_KEY = TOKEN_KEY;
}

const app = express();
const os = require('os');
const PORT = process.env.PORT || 3005;
const configuredUploadLimitMb = Number.parseInt(process.env.MAX_UPLOAD_FILE_SIZE_MB || '4096', 10);
const MAX_UPLOAD_FILE_SIZE_MB = Number.isFinite(configuredUploadLimitMb) && configuredUploadLimitMb > 0
    ? configuredUploadLimitMb
    : 4096;

app.use(createRequestErrorLogger());
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Check against environment variable allowed origins
        const envAllowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
        if (envAllowedOrigins.includes(origin)) return callback(null, true);

        // Allow localhost, 127.0.0.1, and local network IPs (192.168.x.x, 10.x.x.x)
        const allowed = /^(http:\/\/localhost:\d+|http:\/\/127\.0\.0\.1:\d+|http:\/\/192\.168\.\d+\.\d+:\d+|http:\/\/10\.\d+\.\d+\.\d+:\d+)$/.test(origin);
        
        if (allowed) {
            callback(null, true);
        } else {
            // For now, in dev mode, we might want to log this but potentially block it
            console.log("Blocked by CORS:", origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Access-Token',
        'X-Return-Tokens',
        'X-Requested-With',
        'Accept',
        'Origin'
    ],
    exposedHeaders: [
        'Content-Disposition',
        'Content-Length',
        'Content-Range',
        'Accept-Ranges',
        'ETag',
        'Last-Modified',
        'X-Log-Entry-Count',
        'X-Request-ID'
    ]
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(fileUpload({
    createParentPath: true,
    useTempFiles: true,
    tempFileDir: os.tmpdir(),
    limits: { 
        fileSize: MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024
    },
    abortOnLimit: true,
    responseOnLimit: `File size limit has been reached (max ${MAX_UPLOAD_FILE_SIZE_MB}MB)`,
}));
app.use('/covers', express.static(path.join(__dirname, 'covers')));
const BOOKS_DIR = path.join(__dirname, 'books');
const AUDIOBOOKS_DIR = path.join(__dirname, 'audiobooks');
const loadFreshAudiobookCatalog = async () => {
    const catalog = await scanAudiobookCatalog(AUDIOBOOKS_DIR);
    const catalogWithDurations = await enrichAudiobookDurations(AUDIOBOOKS_DIR, catalog);
    return enrichAudiobookCatalog(db, catalogWithDurations);
};
const loadAudiobookCatalog = createStaleWhileRevalidateLoader(loadFreshAudiobookCatalog, {
    maxAgeMs: 30000,
    onRefreshError: (error) => console.error('Background audiobook catalog refresh failed:', error)
});
const loadAudiobookshelfProgress = async (userId) => {
    try {
        const [catalog, rows] = await Promise.all([
            loadAudiobookCatalog(),
            new Promise((resolve, reject) => {
                db.all(
                    'SELECT * FROM AudiobooksUsers WHERE user_id = ?',
                    [userId],
                    (error, progressRows) => error ? reject(error) : resolve(progressRows)
                );
            })
        ]);
        const catalogByFolder = new Map(catalog.map((audiobook) => [audiobook.folder, audiobook]));
        return rows.map((row) => (
            catalogByFolder.has(row.audiobook_folder)
                ? buildMediaProgress(catalogByFolder.get(row.audiobook_folder), row)
                : null
        )).filter(Boolean);
    } catch (error) {
        console.error('Could not add Audiobookshelf progress to the user response:', error);
        return [];
    }
};

const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8'));

const sendFreshCompatibilityResponse = (req, res, next) => {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    res.setHeader('Cache-Control', 'no-store');
    next();
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Audiobookshelf-compatible discovery endpoints used by native clients such as SoundLeaf.
app.get('/status', sendFreshCompatibilityResponse, (req, res) => {
    res.json({
        app: 'audiobookshelf',
        serverVersion: AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
        isInit: true,
        language: 'en-us',
        authMethods: ['local'],
        authFormData: null
    });
});

app.get('/ping', sendFreshCompatibilityResponse, (req, res) => res.json({ success: true }));
app.get('/healthcheck', sendFreshCompatibilityResponse, (req, res) => res.sendStatus(200));

// Auth Routes (Public)
// Auth Routes (Public)
app.post('/login', (req, res) => {
    // Simplified login logic
    const { username, password } = req.body;
    
    if (!(username && password)) {
        return res.status(400).send("All input is required");
    }

    const sql = `
        SELECT u.*, r.userrole_name, r.userrole_manageusers, r.userrole_managebooks, r.userrole_readbooks, r.userrole_viewbooks 
        FROM Users u
        LEFT JOIN UserRoles r ON u.userrole_id = r.ID
        WHERE u.user_username = ?
    `;
    db.get(sql, [username], async (err, user) => {
        if (err) {
            applicationLogger.error('auth.login.database_error', err, {
                ...getRequestContext(req),
                username
            });
            return res.status(500).send(`Server error. Reference: ${req.requestId}`);
        }
        try {
            if (user) {
                if (!user.user_password) throw new Error('User password hash is missing');
                const validPass = await bcrypt.compare(password, user.user_password.toString());
                if (!validPass) {
                    applicationLogger.warn('auth.login.invalid_credentials', 'Invalid login credentials', {
                        ...getRequestContext(req),
                        username
                    });
                    return res.status(400).send("Invalid Credentials");
                }

                const tokenClaims = {
                    user_id: user.ID,
                    username: user.user_username,
                    userrole_id: user.userrole_id,
                    userrole_manageusers: user.userrole_manageusers,
                    userrole_managebooks: user.userrole_managebooks,
                    userrole_readbooks: user.userrole_readbooks,
                    userrole_viewbooks: user.userrole_viewbooks
                };
                const token = jwt.sign(
                    tokenClaims,
                    TOKEN_KEY,
                    { expiresIn: "2h" }
                );
                const audiobookshelfToken = jwt.sign(
                    { ...tokenClaims, client: 'audiobookshelf' },
                    TOKEN_KEY,
                    { expiresIn: '30d' }
                );

                // Set cookie for secure authentication
                // Note: SameSite=None; Secure required for cross-site (if frontend/backend on different ports/domains)
                // But for localhost dev usually Lax works. If HTTPS is used, Secure is needed.
                res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`);

                const userInfo = {
                    id: user.ID,
                    username: user.user_username,
                    email: user.user_email,
                    user_avatar: user.user_avatar,
                    userrole_name: user.userrole_name,
                    userrole_manageusers: user.userrole_manageusers,
                    userrole_managebooks: user.userrole_managebooks,
                    userrole_readbooks: user.userrole_readbooks,
                    userrole_viewbooks: user.userrole_viewbooks,
                    user_font_family: user.user_font_family,
                    user_font_size: user.user_font_size,
                    user_theme: user.user_theme
                };

                const mediaProgress = await loadAudiobookshelfProgress(user.ID);
                const audiobookshelfResponse = buildAuthorizationResponse(
                    user,
                    audiobookshelfToken,
                    mediaProgress,
                    serverVersion
                );
                return res.status(200).json({
                    ...userInfo,
                    ...audiobookshelfResponse,
                    accessToken: audiobookshelfToken
                });
            }
            return res.status(400).send("Invalid Credentials");
        } catch (error) {
            applicationLogger.error('auth.login.processing_error', error, {
                ...getRequestContext(req),
                username
            });
            return res.status(500).send(`Server error. Reference: ${req.requestId}`);
        }
    });
});

app.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', `token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.status(200).send("Logged out");
});

app.post('/register', async (req, res) => {
    // Register logic
    const { username, email, password } = req.body;
    if (!(email && password && username)) {
        return res.status(400).send("All input is required");
    }
    
    // Check if user exists
    const checkSql = "SELECT * FROM Users WHERE user_email = ?";
    db.get(checkSql, [email], async (err, existingUser) => {
        if (existingUser) {
            return res.status(409).send("User Already Exist. Please Login");
        }
        
        // Encrypt password
        const encryptedPassword = await bcrypt.hash(password, 10);
        
        const insertSql = "INSERT INTO Users (user_username, user_email, user_password, userrole_id, user_create_date) VALUES (?, ?, ?, ?, ?)";
        const now = Date.now();
        const defaultRoleId = 3; // Guest
        
        db.run(insertSql, [username, email, encryptedPassword, defaultRoleId, now], function(err) {
            if (err) return res.status(500).send(err.message);
            
             const token = jwt.sign(
                { 
                    user_id: this.lastID, 
                    email,
                    userrole_id: defaultRoleId,
                    userrole_manageusers: 0,
                    userrole_managebooks: 0,
                    userrole_readbooks: 0,
                    userrole_viewbooks: 1
                },
                TOKEN_KEY,
                { expiresIn: "2h" }
            );
            
            // Set cookie for automatic sub-resource authentication
            res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`);
            
            const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
            res.status(201).json({ 
                id: this.lastID, 
                username, 
                email, 
                user_avatar: defaultAvatar,
                token,
                userrole_name: 'guest',
                userrole_manageusers: 0,
                userrole_managebooks: 0,
                userrole_readbooks: 0,
                userrole_viewbooks: 1
            });
        });
    });
});


app.use('/api', auth);

// Get current user (session check)
app.get('/api/me', auth, sendFreshCompatibilityResponse, (req, res) => {
    // req.user is set by auth middleware
    const sql = `
        SELECT u.ID, u.user_username, u.user_email, u.user_name, u.user_lastname, u.user_avatar, u.userrole_id, u.user_font_family, u.user_font_size, u.user_theme, 
               r.userrole_name, r.userrole_manageusers, r.userrole_managebooks, r.userrole_readbooks, r.userrole_viewbooks
        FROM Users u
        LEFT JOIN UserRoles r ON u.userrole_id = r.ID
        WHERE u.ID = ?
    `;
    db.get(sql, [req.user.user_id], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Map to match login response structure
        const userInfo = {
            id: user.ID,
            username: user.user_username,
            email: user.user_email,
            user_avatar: user.user_avatar,
            userrole_name: user.userrole_name,
            userrole_manageusers: user.userrole_manageusers,
            userrole_managebooks: user.userrole_managebooks,
            userrole_readbooks: user.userrole_readbooks,
            userrole_viewbooks: user.userrole_viewbooks,
            user_font_family: user.user_font_family,
            user_font_size: user.user_font_size,
            user_theme: user.user_theme
        };
        const mediaProgress = await loadAudiobookshelfProgress(user.ID);
        const audiobookshelfUser = buildAudiobookshelfUser(user, getRequestToken(req), mediaProgress);
        res.json({
            ...userInfo,
            ...audiobookshelfUser,
            mediaProgress: audiobookshelfUser.mediaProgress
        });
    });
});

// Secure static routes
const checkReadPermission = (req, res, next) => {
    if (!req.user || !req.user.userrole_readbooks) {
        return res.status(403).send('Forbidden: Reader access required');
    }
    next();
};

const checkManageBooks = (req, res, next) => {
    if (!req.user || !req.user.userrole_managebooks) {
        return res.status(403).send('Forbidden: Manage Books access required');
    }
    next();
};

// Help seed the session cookie from query param for reader assets
const seedCookie = (req, res, next) => {
    if (req.query.token) {
        res.setHeader('Set-Cookie', `token=${req.query.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`);
    }
    next();
};

// REMOVED /books_files static serving to prevent direct links. 
// Uses seedCookie to ensure reader assets (images/css) have access via the cookie.
app.use('/extracted', seedCookie, auth, checkReadPermission, express.static(path.join(__dirname, 'extracted')));

// API Routes
// Custom Generes Routes (Handle timestamps)
const generesRouter = express.Router();
// Get all genres with a sample of books for each
generesRouter.get('/with-books', (req, res) => {
    const userId = req.user.user_id;
    // Get all genres first
    db.all("SELECT * FROM Generes ORDER BY genere_title ASC", [], (err, genres) => {
        if (err) return res.status(500).json({ error: err.message });
        
        
        // For each genre, get its books
        // We use a complex query or just map them. Since genres are usually few, 
        // a simple Promise.all with db.all works well.
        const genrePromises = genres.map(genre => {
            return new Promise((resolve, reject) => {
                const sql = `
                    SELECT b.*, bu.book_progress_percentage 
                    FROM Books b
                    JOIN BooksGeneres bg ON b.ID = bg.book_id
                    LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
                    WHERE bg.genere_id = ?
                    LIMIT 8
                `;
                db.all(sql, [userId, genre.ID], (err, books) => {
                    if (err) reject(err);
                    else resolve({ ...genre, books });
                });
            });
        });

        Promise.all(genrePromises)
            .then(results => {
                // Filter out genres with no books
                res.json({ data: results.filter(g => g.books.length > 0) });
            })
            .catch(error => {
                res.status(500).json({ error: error.message });
            });
    });
});

generesRouter.post('/', (req, res) => {
    let { genere_title } = req.body;
    if (!genere_title) return res.status(400).json({ error: 'Title required' });
    
    // Force uppercase
    genere_title = genere_title.toUpperCase().trim();
    const now = Date.now();

    // Check for duplicate
    db.get("SELECT ID, genere_title FROM Generes WHERE UPPER(genere_title) = ?", [genere_title], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            // Already exists, return existing
            return res.status(200).json({ data: { ID: row.ID, genere_title: row.genere_title } });
        } else {
            // Create new
            db.run("INSERT INTO Generes (genere_title, genere_create_date, genere_update_date) VALUES (?, ?, ?)", 
                [genere_title, now, now], 
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.status(201).json({ data: { ID: this.lastID, genere_title, genere_create_date: now } });
                }
            );
        }
    });
});
// Custom Generes Routes
// const generesRouter = express.Router(); // Already declared above
generesRouter.get('/:id/books', (req, res) => {
    const genreId = req.params.id;
    const sql = `
        SELECT b.*, bu.book_progress_percentage 
        FROM Books b
        JOIN BooksGeneres bg ON b.ID = bg.book_id
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
        WHERE bg.genere_id = ?
    `;
    db.all(sql, [req.user.user_id, genreId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

generesRouter.get('/:id', (req, res) => {
    db.get("SELECT * FROM Generes WHERE ID = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Genre not found' });
        res.json({ data: row });
    });
});

generesRouter.use('/', createCrudRouter('Generes', db));
app.use('/api/search', createSearchRouter(db));

app.use('/api/generes', generesRouter);

app.use('/api/formats', createCrudRouter('Formats', db));

// Custom BooksGeneres Routes (Handle timestamps)
const booksGeneresRouter = express.Router();
booksGeneresRouter.post('/', (req, res) => {
    const { book_id, genere_id } = req.body;
    const now = Date.now();
    db.run("INSERT INTO BooksGeneres (book_id, genere_id, booksgeneres_create_date) VALUES (?, ?, ?)", 
        [book_id, genere_id, now],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ data: { ID: this.lastID, book_id, genere_id, booksgeneres_create_date: now } });
        }
    );
});
booksGeneresRouter.use('/', createCrudRouter('BooksGeneres', db));
app.use('/api/books-generes', booksGeneresRouter);
app.use('/api/authors', (req, res, next) => {
    // Audiobookshelf author IDs are stable hashed strings. Let the compatibility
    // router mounted below handle those while preserving Bookshelf's numeric
    // author CRUD routes.
    if (req.method === 'GET' && /^\/aut_[a-f0-9]+$/.test(req.path)) return next();

    // Custom Authors Routes
    const authorsRouter = express.Router();
    
    // Get books by author
    authorsRouter.get('/:id/books', (req, res) => {
        const sql = `
            SELECT b.*, bu.book_progress_percentage 
            FROM Books b
            JOIN BooksAuthors ba ON b.ID = ba.book_id
            LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
            WHERE ba.author_id = ?
        `;
        db.all(sql, [req.user.user_id, req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        });
    });

    // Get audiobooks linked through the same Authors table used by books
    authorsRouter.get('/:id/audiobooks', async (req, res) => {
        try {
            const authorId = Number(req.params.id);
            const audiobooks = await loadAudiobookCatalog();
            res.json({
                data: audiobooks.filter((audiobook) => (
                    audiobook.authors.some((author) => author.ID === authorId)
                ))
            });
        } catch (err) {
            console.error('Author audiobook lookup failed:', err);
            res.status(500).json({ error: 'Could not load audiobooks for this author' });
        }
    });

    authorsRouter.delete('/:id', checkManageBooks, (req, res) => {
        db.get(
            `SELECT
                (SELECT COUNT(*) FROM BooksAuthors WHERE author_id = ?) AS book_count,
                (SELECT COUNT(*) FROM AudiobooksAuthors WHERE author_id = ?) AS audiobook_count`,
            [req.params.id, req.params.id],
            (countError, counts) => {
                if (countError) return res.status(500).json({ error: countError.message });
                if (counts.book_count > 0 || counts.audiobook_count > 0) {
                    return res.status(409).json({
                        error: 'Reassign this author\'s books and audiobooks before deleting the author'
                    });
                }
                db.run('DELETE FROM Authors WHERE ID = ?', [req.params.id], function onDelete(deleteError) {
                    if (deleteError) return res.status(500).json({ error: deleteError.message });
                    if (this.changes === 0) return res.status(404).json({ error: 'Author not found' });
                    res.json({ message: 'Author deleted', changes: this.changes });
                });
            }
        );
    });

    // Get author details
    authorsRouter.get('/:id', (req, res) => {
        db.get("SELECT * FROM Authors WHERE ID = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Author not found' });
            res.json({ data: row });
        });
    });

    // List authors (Pagination, Search, Sort)
    authorsRouter.get('/', (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; 
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let countSql = `SELECT COUNT(*) as total FROM Authors`;
        let sql = `SELECT * FROM Authors`;
        
        const params = [];
        const countParams = [];

        const sort = req.query.sort || 'name';
        if (search) {
             const searchClause = " WHERE author_name LIKE ? OR author_lastname LIKE ?";
             countSql += searchClause;
             sql += searchClause;
             params.push(`%${search}%`, `%${search}%`);
             countParams.push(`%${search}%`, `%${search}%`);
        }

        let orderBy = 'author_name ASC, author_lastname ASC';
        if (sort === 'latest') {
             orderBy = 'author_create_date DESC';
        } else if (sort === 'name') {
             orderBy = 'author_name ASC, author_lastname ASC';
        }

        sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        db.get(countSql, countParams, (err, countRow) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(sql, params, (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ 
                    data: rows,
                    total: countRow.total,
                    page: page,
                    limit: limit
                });
            });
        });
    });

    // Fallback to CRUD for other author methods
    const crud = createCrudRouter('Authors', db, 'ID', ['GET', 'POST', 'PUT', 'DELETE'], ['author_name', 'author_lastname']);
    authorsRouter.use('/', crud);
    
    authorsRouter(req, res, next);
});
app.use('/api/books-authors', createCrudRouter('BooksAuthors', db));
const publishersRouter = express.Router();
publishersRouter.get('/:id/books', (req, res) => {
    const publisherId = req.params.id;
    const sql = `
        SELECT b.*, bu.book_progress_percentage 
        FROM Books b
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
        WHERE b.book_publisher_id = ?
    `;
    db.all(sql, [req.user.user_id, publisherId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Fallback to CRUD for publishers
app.use('/api/publishers', (req, res, next) => {
    // List publishers (Pagination, Search, Sort)
    publishersRouter.get('/', (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; 
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        const sort = req.query.sort || 'name';
        
        let countSql = `SELECT COUNT(*) as total FROM Publishers`;
        let sql = `SELECT * FROM Publishers`;
        
        const params = [];
        const countParams = [];

        if (search) {
            const searchClause = " WHERE publisher_name LIKE ?";
            countSql += searchClause;
            sql += searchClause;
            params.push(`%${search}%`);
            countParams.push(`%${search}%`);
        }

        let orderBy = 'publisher_name ASC';
        if (sort === 'latest') {
             orderBy = 'publisher_create_date DESC';
        } else if (sort === 'name') {
             orderBy = 'publisher_name ASC';
        }

        sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        db.get(countSql, countParams, (err, countRow) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(sql, params, (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ 
                    data: rows,
                    total: countRow.total,
                    page: page,
                    limit: limit
                });
            });
        });
    });

    const crud = createCrudRouter('Publishers', db);
    publishersRouter.use('/', crud);
    publishersRouter(req, res, next);
});
const usersRouter = express.Router();

// Middleware to check if user can manage users
const checkManageUsers = (req, res, next) => {
    if (!req.user.userrole_manageusers) {
        return res.status(403).json({ error: 'Forbidden: Requires manageusers permission' });
    }
    next();
};

usersRouter.get('/', checkManageUsers, (req, res) => {
    const sql = `
        SELECT u.ID, u.user_username, u.user_email, u.user_name, u.user_lastname, u.user_avatar, u.user_create_date, u.user_update_date, u.userrole_id, u.user_font_family, u.user_font_size, u.user_theme,
               r.userrole_name, r.userrole_manageusers, r.userrole_managebooks, r.userrole_readbooks, r.userrole_viewbooks
        FROM Users u
        LEFT JOIN UserRoles r ON u.userrole_id = r.ID
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

usersRouter.get('/:id', (req, res) => {
    const sql = `

        SELECT u.ID, u.user_username, u.user_email, u.user_name, u.user_lastname, u.user_avatar, u.user_create_date, u.user_update_date, u.userrole_id, u.user_font_family, u.user_font_size, u.user_theme,
               r.userrole_name, r.userrole_manageusers, r.userrole_managebooks, r.userrole_readbooks, r.userrole_viewbooks
        FROM Users u
        LEFT JOIN UserRoles r ON u.userrole_id = r.ID
        WHERE u.ID = ?
    `;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'User not found' });
        res.json({ data: row });
    });
});

usersRouter.post('/', checkManageUsers, async (req, res) => {
    const { user_username, user_email, user_password, userrole_id, user_name, user_lastname, user_avatar } = req.body;
    
    if (!user_username || !user_email || !user_password) {
        return res.status(400).json({ error: 'Username, email and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(user_password, 10);
        const now = Date.now();
        const sql = `
            INSERT INTO Users (user_username, user_email, user_password, user_name, user_lastname, user_avatar, userrole_id, user_create_date, user_update_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user_username}`;
        const params = [user_username, user_email, hashedPassword, user_name || null, user_lastname || null, user_avatar || defaultAvatar, userrole_id || 3, now, now];
        
        db.run(sql, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ data: { ID: this.lastID, user_username, user_email, userrole_id } });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

usersRouter.put('/:id', async (req, res) => {
    const { user_username, user_email, user_password, userrole_id, user_name, user_lastname, user_avatar, user_font_family, user_font_size, user_theme } = req.body;
    const userId = parseInt(req.params.id);
    const now = Date.now();

    // Permission check: admin OR self-edit
    console.log('PUT /api/users/:id debug:', {
        paramId: userId,
        tokenUser: req.user ? { id: req.user.user_id, isAdmin: !!req.user.userrole_manageusers } : 'no user'
    });
    const isSelfEdit = req.user && req.user.user_id === userId;
    const isAdmin = req.user && req.user.userrole_manageusers;

    if (!isSelfEdit && !isAdmin) {
        console.log('Permission denied:', { isSelfEdit, isAdmin });
        return res.status(403).json({ error: 'Forbidden: You can only edit your own profile' });
    }

    // Security: only admin can change roles
    // Security: only admin can change roles
    let targetRoleId;
    try {
        const currentUser = await new Promise((resolve, reject) => {
            db.get("SELECT userrole_id FROM Users WHERE ID = ?", [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        if (!currentUser) return res.status(404).json({ error: 'User not found' });
        
        // If admin AND role provided, use it. Otherwise keep existing.
        if (isAdmin && userrole_id !== undefined) {
             targetRoleId = userrole_id;
        } else {
             targetRoleId = currentUser.userrole_id;
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }

    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user_username}`;
    let sql = "UPDATE Users SET user_username = ?, user_email = ?, user_name = ?, user_lastname = ?, user_avatar = ?, userrole_id = ?, user_update_date = ?, user_font_family = ?, user_font_size = ?, user_theme = ?";
    let params = [user_username, user_email, user_name || null, user_lastname || null, user_avatar || defaultAvatar, targetRoleId, now, user_font_family || 'sans', user_font_size || 18, user_theme || 'light'];

    if (user_password && user_password.trim() !== "") {
        try {
            const hashedPassword = await bcrypt.hash(user_password, 10);
            sql = "UPDATE Users SET user_username = ?, user_email = ?, user_password = ?, user_name = ?, user_lastname = ?, user_avatar = ?, userrole_id = ?, user_update_date = ?, user_font_family = ?, user_font_size = ?, user_theme = ?";
            params = [user_username, user_email, hashedPassword, user_name || null, user_lastname || null, user_avatar || defaultAvatar, targetRoleId, now, user_font_family || 'sans', user_font_size || 18, user_theme || 'light'];
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    sql += " WHERE ID = ?";
    params.push(userId);

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User updated' });
    });
});

usersRouter.delete('/:id', checkManageUsers, (req, res) => {
    db.run("DELETE FROM Users WHERE ID = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted' });
    });
});

app.use('/api/users', usersRouter);
app.use('/api/books-users', createCrudRouter('BooksUsers', db));
app.use('/api/languages', createCrudRouter('Languages', db));
// Custom Books Routes (Override default GET to include joins and progress)
const booksRouter = createCrudRouter('Books', db, 'ID', ['POST', 'PUT']);

// Upload Book Route
booksRouter.post('/upload', checkManageBooks, async (req, res) => {
    if (!req.files || !req.files.book) {
        return res.status(400).json({ error: 'No book file uploaded' });
    }

    const bookFile = req.files.book;
    const safeName = path.basename(bookFile.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // File Filter Logic
    const lowerName = safeName.toLowerCase();
    const isEpub = bookFile.mimetype === 'application/epub+zip' || lowerName.endsWith('.epub');
    const isPdf = bookFile.mimetype === 'application/pdf' || lowerName.endsWith('.pdf');
    const isComic = lowerName.endsWith('.cbr') || lowerName.endsWith('.cbz') || lowerName.endsWith('.zip') || lowerName.endsWith('.rar');

    if (!isEpub && !isPdf && !isComic) {
         return res.status(400).json({ error: 'Invalid file type. Only EPUB, PDF, CBR, CBZ, RAR, and ZIP are allowed.' });
    }

    const uploadPath = path.join(BOOKS_DIR, safeName);

    bookFile.mv(uploadPath, async (err) => {
        if (err) return res.status(500).json({ error: err.message });

        console.log(`Uploaded file: ${safeName}`);
        
        try {
            const result = await scanSingleFile(db, safeName, { originalFilename: path.basename(bookFile.name) });
            
            if (result && result.error) {
                return res.status(400).json({ error: result.error, filename: safeName });
            }

            if (result && result.isNew) {
                res.status(201).json({ message: 'Book uploaded and processed successfully', filename: safeName, bookId: result.bookId });
            } else {
                const bookId = result ? result.bookId : null;
                res.status(200).json({ message: 'Book updated (duplicate found)', filename: safeName, bookId });
            }
        } catch (scanError) {
             console.error('Upload processing error:', scanError);
             res.status(500).json({ error: 'Processing failed: ' + scanError.message });
        }
    });
});

// -----------------------------------------------------------------
// SPECIFIC ROUTES (MUST BE BEFORE PARAMETRIZED ROUTES)
// -----------------------------------------------------------------

// Get a random book ID
booksRouter.get('/random', (req, res) => {
    db.get("SELECT ID FROM Books ORDER BY RANDOM() LIMIT 1", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'No books found' });
        res.json({ data: row });
    });
});

// Get books with progress for Continue Reading section
booksRouter.get('/continue-reading', (req, res) => {
    const userId = req.user.user_id;
    const sql = `
        SELECT b.*, bu.book_progress_percentage 
        FROM Books b
        INNER JOIN BooksUsers bu ON b.ID = bu.book_id
        WHERE bu.user_id = ? AND bu.book_progress_percentage > 0 AND bu.book_progress_percentage < 100
        ORDER BY bu.booksusers_update_date DESC
        LIMIT 10
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Most Read Books (ranked by unique readers)
booksRouter.get('/most-read', (req, res) => {
    const sql = `
        SELECT b.*, COUNT(DISTINCT bu.user_id) as reader_count
        FROM Books b
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id
        GROUP BY b.ID
        HAVING reader_count > 0
        ORDER BY reader_count DESC
        LIMIT 16
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Most Downloaded Books
booksRouter.get('/most-downloaded', (req, res) => {
    const sql = `
        SELECT * FROM Books 
        WHERE book_downloads > 0
        ORDER BY book_downloads DESC 
        LIMIT 16
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});


// Serve Comic Page
booksRouter.get('/:id/pages', async (req, res) => {
    const bookId = req.params.id;
    const file = req.query.file;

    if (!file) return res.status(400).json({ error: 'File parameter required' });

    db.get("SELECT book_filename FROM Books WHERE ID = ?", [bookId], async (err, book) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!book) return res.status(404).json({ error: 'Book not found' });

        try {
            const buffer = await getComicPage(book.book_filename, file);
            if (!buffer) return res.status(404).json({ error: 'Page not found' });

            const ext = path.extname(file).toLowerCase();
            let mimeType = 'image/jpeg';
            if (ext === '.png') mimeType = 'image/png';
            if (ext === '.webp') mimeType = 'image/webp';
            if (ext === '.gif') mimeType = 'image/gif';

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(buffer);
        } catch (e) {
            console.error('Error serving page:', e);
            res.status(500).json({ error: 'Failed to retrieve page' });
        }
    });
});

// OPDS Router
const opdsRouter = require('./routes/opds');
const opdsAuth = require('./middleware/opdsAuth');
app.use('/opds', opdsAuth, opdsRouter);

// Custom DELETE for books - removes metadata AND files
booksRouter.delete('/:id', checkManageBooks, (req, res) => {
    const bookId = req.params.id;
    
    // First, get book details to know which files to delete
    db.get("SELECT book_filename, book_cover_img FROM Books WHERE ID = ?", [bookId], (err, book) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        
        // Delete related records first (foreign key constraints)
        db.serialize(() => {
            // 1. Delete reviews associated with any user's progress on this book
            db.run("DELETE FROM Reviews WHERE bookuser_ID IN (SELECT ID FROM BooksUsers WHERE book_id = ?)", [bookId]);
            
            // 2. Delete progress and book-specific metadata relationships
            db.run("DELETE FROM BooksGeneres WHERE book_id = ?", [bookId]);
            db.run("DELETE FROM BooksAuthors WHERE book_id = ?", [bookId]);
            db.run("DELETE FROM BooksUsers WHERE book_id = ?", [bookId]);
            
            // 3. Delete the book record itself
            db.run("DELETE FROM Books WHERE ID = ?", [bookId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                // Delete physical files
                try {
                    // Delete EPUB file
                    if (book.book_filename) {
                        const epubPath = path.join(__dirname, 'books', book.book_filename);
                        if (fs.existsSync(epubPath)) {
                            fs.unlinkSync(epubPath);
                            console.log(`Deleted EPUB: ${epubPath}`);
                        }
                    }
                    
                    // Delete cover image
                    if (book.book_cover_img) {
                        const coverPath = path.join(__dirname, 'covers', book.book_cover_img);
                        if (fs.existsSync(coverPath)) {
                            fs.unlinkSync(coverPath);
                            console.log(`Deleted cover: ${coverPath}`);
                        }
                    }
                    
                    // Delete extracted content folder
                    if (book.book_filename) {
                        // Match the flat naming convention from libraryScanner.js
                        const folderName = book.book_filename.replace(/[/\\]/g, '_').replace(/\.[^/.]+$/, "");
                        const extractedPath = path.join(__dirname, 'extracted', folderName);
                        
                        if (fs.existsSync(extractedPath)) {
                            fs.rmSync(extractedPath, { recursive: true, force: true });
                            console.log(`Deleted extracted content: ${extractedPath}`);
                        } else {
                            // Try normalization check for macOS
                            const normalizedFolderName = book.book_filename.normalize('NFD').replace(/[/\\]/g, '_').replace(/\.[^/.]+$/, "");
                            const normalizedPath = path.join(__dirname, 'extracted', normalizedFolderName);
                            if (fs.existsSync(normalizedPath)) {
                                fs.rmSync(normalizedPath, { recursive: true, force: true });
                                console.log(`Deleted extracted content (normalized): ${normalizedPath}`);
                            }
                        }
                    }
                } catch (fileErr) {
                    console.error('Error deleting files:', fileErr);
                    // Continue anyway - metadata is deleted
                }
                
                res.json({ message: 'Book and associated files deleted successfully' });
            });
        });
    });
});

const isSafeUrl = (urlString) => {
    try {
        const parsed = new URL(urlString);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;

        const hostname = parsed.hostname;

        // Localhost checks
        if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;

        // IP Checks (IPv4)
        // 127.0.0.0/8
        if (hostname.match(/^127\./)) return false;
        // 10.0.0.0/8
        if (hostname.match(/^10\./)) return false;
        // 192.168.0.0/16
        if (hostname.match(/^192\.168\./)) return false;
        // 172.16.0.0/12 -> 172.16. - 172.31.
        if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return false;
        // 0.0.0.0/8
        if (hostname.match(/^0\./)) return false;

        // IPv6 (simplified)
        if (hostname === '[::1]' || hostname === '::1') return false;

        return true;
    } catch (e) {
        return false;
    }
};

// Download cover from URL and set it for a book
booksRouter.post('/:id/cover-from-url', async (req, res) => {
    const bookId = req.params.id;
    const { coverUrl } = req.body;

    if (!coverUrl) {
        return res.status(400).json({ error: 'Cover URL is required' });
    }

    if (!isSafeUrl(coverUrl)) {
        return res.status(400).json({ error: 'Invalid or unsafe URL' });
    }

    try {
        const response = await axios({
            method: 'get',
            url: coverUrl,
            responseType: 'stream'
        });

        // Determine file extension from Content-Type or URL
        let ext = 'jpg';
        const contentType = response.headers['content-type'];
        if (contentType) {
            if (contentType.includes('png')) ext = 'png';
            if (contentType.includes('webp')) ext = 'webp';
            if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
        }

        const fileName = `book_${bookId}_${Date.now()}.${ext}`;
        const filePath = path.join(__dirname, 'covers', fileName);

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Update DB
        db.run("UPDATE Books SET book_cover_img = ? WHERE ID = ?", [fileName, bookId], function(err) {
            if (err) {
                console.error("DB error updating cover:", err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, fileName: fileName });
        });

    } catch (err) {
        console.error("Error downloading cover:", err);
        res.status(500).json({ error: 'Failed to download cover' });
    }
});

// Update getAll to include progress and pagination
    // Update getAll to include progress and pagination
booksRouter.get('/', (req, res) => {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; 
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const format = req.query.format || 'all';

    let baseJoin = ` LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ? LEFT JOIN Formats f ON b.book_format_id = f.ID`;
    let whereClauses = ["1=1"];
    let params = [userId];
    let countParams = [];

    if (search) {
        whereClauses.push("b.book_title LIKE ?");
        params.push(`%${search}%`);
        countParams.push(`%${search}%`);
    }

    if (format && format.toLowerCase() !== 'all') {
        if (format.toUpperCase() === 'COMICS') {
             // Group filter for comics
             whereClauses.push("f.format_name IN ('CBR', 'CBZ', 'RAR', 'ZIP')");
             // No params push needed for literals
        } else {
             whereClauses.push("f.format_name = ?");
             params.push(format.toUpperCase());
        }
    }

    const whereSql = " WHERE " + whereClauses.join(" AND ");

    // Count Query Logic
    let countWhere = [];
    let finalCountParams = [];

    if (search) {
        countWhere.push("b.book_title LIKE ?");
        finalCountParams.push(`%${search}%`);
    }

    if (format && format.toLowerCase() !== 'all') {
         if (format.toUpperCase() === 'COMICS') {
             countWhere.push("f.format_name IN ('CBR', 'CBZ', 'RAR', 'ZIP')");
         } else {
             countWhere.push("f.format_name = ?");
             finalCountParams.push(format.toUpperCase());
         }
    }

    let countWhereStr = countWhere.length > 0 ? " WHERE " + countWhere.join(" AND ") : "";
    let countSql = `SELECT COUNT(*) as total FROM Books b LEFT JOIN Formats f ON b.book_format_id = f.ID` + countWhereStr;


    let sql = `
        SELECT b.*, bu.book_progress_percentage, f.format_name
        FROM Books b
        ${baseJoin}
        ${whereSql}
    `;
    
    const sort = req.query.sort || 'title';
    
    let orderBy = 'b.book_title ASC'; // Default to alphabetical
    if (sort === 'latest' || sort === 'added') orderBy = 'b.book_create_date DESC, b.ID DESC';
    else if (sort === 'year') orderBy = 'b.book_date DESC';
    else if (sort === 'progress') orderBy = 'bu.book_progress_percentage DESC';
    
    sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.get(countSql, finalCountParams, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ 
                data: rows,
                total: countRow.total,
                page: page,
                limit: limit
            });
        });
    });
});

// Get progress for a specific book for current user
booksRouter.get('/offline-catalog', (req, res) => {
    if (!req.user.userrole_readbooks) {
        return res.status(403).json({ error: 'Permission denied: Reader access required' });
    }

    const userId = req.user.user_id;
    const sql = `
        SELECT b.ID, b.book_title, b.book_summary, b.book_cover_img, b.book_date,
               b.book_filename, b.book_entry_point, b.book_spine, b.language_id,
               b.book_format_id, l.language_name, f.format_name,
               bu.book_current_index, bu.book_current_page, bu.book_progress_percentage
        FROM Books b
        LEFT JOIN Languages l ON b.language_id = l.ID
        LEFT JOIN Formats f ON b.book_format_id = f.ID
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
        WHERE lower(b.book_filename) LIKE '%.epub'
        ORDER BY b.book_title COLLATE NOCASE ASC
    `;

    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: filterBooksWithAvailableFiles(rows, BOOKS_DIR) });
    });
});

booksRouter.get('/:id/progress', (req, res) => {
    const userId = req.user.user_id;
    const bookId = req.params.id;
    
    db.get("SELECT * FROM BooksUsers WHERE book_id = ? AND user_id = ?", [bookId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: row || { book_current_index: 0, book_current_page: 0, book_progress_percentage: 0 } });
    });
});

// Update progress
booksRouter.post('/:id/progress', (req, res) => {
    const userId = req.user.user_id;
    const bookId = req.params.id;
    const { current_index, current_page, progress_percentage } = req.body;
    const now = Date.now();

    db.get("SELECT ID FROM BooksUsers WHERE book_id = ? AND user_id = ?", [bookId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            // Update
            db.run(
                "UPDATE BooksUsers SET book_current_index = ?, book_current_page = ?, book_progress_percentage = ?, booksusers_update_date = ? WHERE ID = ?",
                [current_index, current_page || 0, progress_percentage, now, row.ID],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Progress updated' });
                }
            );
        } else {
            // Insert
            db.run(
                "INSERT INTO BooksUsers (book_id, user_id, book_current_index, book_current_page, book_progress_percentage, booksusers_create_date, booksusers_update_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [bookId, userId, current_index, current_page || 0, progress_percentage, now, now],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Progress saved', id: this.lastID });
                }
            );
        }
    });
});

// Stream the actual book file (Secure replacement for /books_files static)
booksRouter.get('/:id/download-file', (req, res) => {
    const bookId = req.params.id;
    
    // Check if user has read permission
    if (!req.user.userrole_readbooks) {
        return res.status(403).json({ error: 'Permission denied: Reader access required' });
    }

    db.get("SELECT book_filename, book_title FROM Books WHERE ID = ?", [bookId], (err, book) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const filePath = resolveBookFilePath(BOOKS_DIR, book.book_filename);
        if (filePath) {
            // Increment counter on real download
            db.run("UPDATE Books SET book_downloads = COALESCE(book_downloads, 0) + 1 WHERE ID = ?", [bookId]);
            // Send file
            res.download(filePath, path.basename(book.book_filename));
        } else {
            res.status(404).json({ error: 'Source file not found' });
        }
    });
});

// On-demand EPUB extraction for reader
const AdmZip = require('adm-zip');
const EXTRACTED_DIR = path.join(__dirname, 'extracted');

booksRouter.post('/:id/send-to-kindle', async (req, res) => {
    const bookId = req.params.id;
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email address is required' });
    }

    if (!req.user.userrole_readbooks) {
        return res.status(403).json({ error: 'Permission denied: Reader access required' });
    }

    db.get("SELECT book_filename, book_title FROM Books WHERE ID = ?", [bookId], async (err, book) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        
        const filePath = path.join(BOOKS_DIR, book.book_filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Book file not found on server' });
        }

        try {
            await sendEmail(
                email,
                `Send to Kindle: ${book.book_title}`,
                `Here is the book file for "${book.book_title}".`,
                [{
                    filename: book.book_filename,
                    path: filePath
                }]
            );
            
            // Increment download count as this counts as a form of download/consumption
            db.run("UPDATE Books SET book_downloads = COALESCE(book_downloads, 0) + 1 WHERE ID = ?", [bookId]);

            res.json({ success: true, message: 'Email sent successfully' });
        } catch (mailError) {
            console.error("Failed to send email:", mailError);
            res.status(500).json({ error: 'Failed to send email. Check server logs.' });
        }
    });
});

booksRouter.post('/:id/read-aloud', async (req, res) => {
    const bookId = req.params.id;
    const { text, voice, speed } = req.body || {};

    if (!req.user.userrole_readbooks) {
        return res.status(403).json({ error: 'Permission denied: Reader access required' });
    }

    if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const book = await new Promise((resolve, reject) => {
            db.get("SELECT ID FROM Books WHERE ID = ?", [bookId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const audioBuffer = await synthesizeSpeech({ text, voice, speed });
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(audioBuffer);
    } catch (error) {
        console.error('Read aloud failed:', error);
        if (error instanceof OpenAIConfigError) {
            return res.status(503).json({ error: error.message });
        }
        if (error instanceof OpenAIRequestError) {
            const errorText = `${error.code || ''} ${error.message || ''}`.toLowerCase();
            if (error.code === 'insufficient_quota' || /quota|credit|billing/.test(errorText)) {
                return res.status(402).json({
                    code: 'OPENAI_QUOTA_EXCEEDED',
                    error: 'OpenAI API credits are unavailable. Check your OpenAI billing, credits, and project limits.'
                });
            }
            if (error.status === 401) {
                return res.status(502).json({
                    code: 'OPENAI_AUTH_FAILED',
                    error: 'The OpenAI API key was rejected. Check that the key is active and belongs to the correct project.'
                });
            }
            if (error.status === 429) {
                return res.status(429).json({
                    code: 'OPENAI_RATE_LIMITED',
                    error: 'OpenAI temporarily rate-limited narration. Please wait a moment and try again.'
                });
            }
        }
        return res.status(500).json({ error: 'Failed to generate speech audio' });
    }
});

// Ensure extracted directory exists
if (!fs.existsSync(EXTRACTED_DIR)) {
    fs.mkdirSync(EXTRACTED_DIR, { recursive: true });
}

booksRouter.post('/:id/prepare-reader', async (req, res) => {
    const bookId = req.params.id;
    
    // Check read permission
    if (!req.user.userrole_readbooks) {
        return res.status(403).json({ error: 'Permission denied: Reader access required' });
    }

    try {
        // Get book details
        const book = await new Promise((resolve, reject) => {
            db.get("SELECT book_filename, book_title FROM Books WHERE ID = ?", [bookId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        if (!book.book_filename) {
            return res.status(400).json({ error: 'Book file not available' });
        }

        // Check if it's an EPUB
        if (!book.book_filename.toLowerCase().endsWith('.epub')) {
            return res.status(400).json({ error: 'Only EPUB files can be read in browser' });
        }

        // Compute folder name (same logic as frontend)
        const folderName = book.book_filename.replace(/[/\\]/g, '_').replace(/\.epub$/i, '');
        const extractPath = path.join(EXTRACTED_DIR, folderName);
        const epubPath = path.join(BOOKS_DIR, book.book_filename);

        // Check if already extracted
        if (fs.existsSync(extractPath)) {
            // Check if folder has content
            const files = fs.readdirSync(extractPath);
            if (files.length > 0) {
                console.log(`Book ${bookId} already extracted at ${extractPath}`);
                return res.json({ 
                    success: true, 
                    message: 'Book already prepared',
                    folderName: folderName
                });
            }
        }

        // Check if source EPUB exists
        if (!fs.existsSync(epubPath)) {
            return res.status(404).json({ error: 'Source EPUB file not found on server' });
        }

        console.log(`Extracting book ${bookId}: ${book.book_filename}`);

        // Extract the EPUB
        const zip = new AdmZip(epubPath);
        
        // Create extraction directory
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath, { recursive: true });
        }

        // Extract all contents
        zip.extractAllTo(extractPath, true);

        console.log(`Book ${bookId} extracted successfully to ${extractPath}`);

        res.json({ 
            success: true, 
            message: 'Book extracted successfully',
            folderName: folderName
        });

    } catch (err) {
        console.error(`Error preparing book ${bookId} for reader:`, err);
        res.status(500).json({ error: 'Failed to prepare book: ' + err.message });
    }
});

// Increment download counter (Optional)
booksRouter.post('/:id/download', (req, res) => {
    const bookId = req.params.id;
    db.run(
        "UPDATE Books SET book_downloads = COALESCE(book_downloads, 0) + 1 WHERE ID = ?",
        [bookId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Download counter incremented' });
        }
    );
});

// Get reviews for a specific book
booksRouter.get('/:id/reviews', (req, res) => {
    const bookId = req.params.id;
    const sql = `
        SELECT r.*, u.user_username
        FROM Reviews r
        JOIN BooksUsers bu ON r.bookuser_ID = bu.ID
        JOIN Users u ON bu.user_id = u.ID
        WHERE bu.book_id = ?
    `;
    db.all(sql, [bookId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

booksRouter.get('/:id', (req, res) => {
    const userId = req.user.user_id;
    const bookId = req.params.id;
    console.log(`Fetching details for book ID: ${bookId} for user: ${userId}`);

    const sql = `
        SELECT b.ID, b.book_title, b.book_isbn, b.book_isbn_13, b.book_summary, b.book_cover_img, 
               b.book_date, b.book_create_date, b.book_filename, b.book_entry_point, b.book_spine, 
               b.book_publisher_id, b.language_id, b.book_format_id, b.book_downloads,
               l.language_name, 
               f.format_name, 
               p.publisher_name,
               bu.ID as bookuser_id,
               bu.book_current_index,
               bu.book_current_page,
               bu.book_progress_percentage,
               (SELECT review_score FROM Reviews WHERE bookuser_ID = bu.ID LIMIT 1) as user_rating,
               (SELECT AVG(review_score) FROM Reviews r JOIN BooksUsers bu2 ON r.bookuser_ID = bu2.ID WHERE bu2.book_id = b.ID AND r.review_score > 0) as avg_rating,
               (SELECT COUNT(*) FROM Reviews r JOIN BooksUsers bu2 ON r.bookuser_ID = bu2.ID WHERE bu2.book_id = b.ID AND r.review_score > 0) as total_ratings_count,
               (SELECT COUNT(*) FROM BooksUsers WHERE book_id = b.ID) as readers_count,
               (SELECT GROUP_CONCAT(a.ID || '::' || a.author_name || ' ' || a.author_lastname || '::' || ba.ID, '||') 
                FROM Authors a 
                JOIN BooksAuthors ba ON ba.author_id = a.ID 
                WHERE ba.book_id = b.ID) AS authors_data,
               (SELECT GROUP_CONCAT(bg.ID || '::' || g.ID || '::' || g.genere_title, '||') 
                FROM Generes g 
                JOIN BooksGeneres bg ON bg.genere_id = g.ID 
                WHERE bg.book_id = b.ID) AS genres_data
        FROM Books b
        LEFT JOIN Languages l ON b.language_id = l.ID
        LEFT JOIN Formats f ON b.book_format_id = f.ID
        LEFT JOIN Publishers p ON b.book_publisher_id = p.ID
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
        WHERE b.ID = ?
        GROUP BY b.ID
    `;
    db.get(sql, [userId, bookId], (err, row) => {
        if (err) {
            console.error("Database error in getById:", err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            console.warn(`Book with ID ${bookId} not found in DB`);
            return res.status(404).json({ error: 'Book not found' });
        }
        
        // Physical file check
        let exists = false;
        if (row.book_filename) {
            const filePath = path.join(BOOKS_DIR, row.book_filename);
            exists = fs.existsSync(filePath);
            
            // If direct check fails, try normalized checks (common on macOS)
            if (!exists) {
                const normalizedFilename = row.book_filename.normalize('NFD');
                exists = fs.existsSync(path.join(BOOKS_DIR, normalizedFilename));
            }
            if (!exists) {
                const normalizedFilename = row.book_filename.normalize('NFC');
                exists = fs.existsSync(path.join(BOOKS_DIR, normalizedFilename));
            }
            // Final failsafe: case-insensitive/listing check
            if (!exists) {
                try {
                    const files = fs.readdirSync(BOOKS_DIR);
                    exists = files.includes(row.book_filename);
                } catch (e) {}
            }
        }
        
        row.file_exists = exists;
        res.json({ data: row });
    });
});

app.use('/api/books', booksRouter);
app.use('/api/userroles', createCrudRouter('UserRoles', db, 'ID', ['GET']));
app.use('/api/reviews', createCrudRouter('Reviews', db));

// Library scan endpoint
// Library scan endpoint
// const { scanLibrary, refreshCovers, importFiles } = require('./utils/libraryScanner'); // Moved to top
app.get('/api/debug/files', (req, res) => {
    try {
        const files = fs.readdirSync(BOOKS_DIR);
        res.json({
            dirname: __dirname,
            booksDir: BOOKS_DIR,
            files: files
        });
    } catch (err) {
        res.status(500).json({ error: err.message, dirname: __dirname, booksDir: BOOKS_DIR });
    }
});

// Settings / Scan Directories Routes
const settingsRouter = express.Router();

settingsRouter.get('/browse', (req, res) => {
    let dirPath = req.query.path || os.homedir();
    
    try {
        if (!fs.existsSync(dirPath)) {
             return res.status(404).json({ error: 'Directory not found' });
        }
        
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const folders = entries
            .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
            .map(dirent => dirent.name)
            .sort();
            
        res.json({
            path: dirPath,
            parent: path.dirname(dirPath),
            folders: folders,
            separator: path.sep
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

settingsRouter.get('/directories', (req, res) => {
    db.all("SELECT * FROM ScanDirectories ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

settingsRouter.get('/logs', async (req, res) => {
    try {
        const result = await getApplicationLogEntries({
            logFile: applicationLogger.logFile,
            startTimestamp: req.query.startTimestamp,
            endTimestamp: req.query.endTimestamp,
            archiveCount: applicationLogger.archiveCount,
            limit: req.query.limit || 500
        });
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({ data: result });
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Application log viewer failed:', error);
        return res.status(500).json({ error: 'Could not load the application log' });
    }
});

settingsRouter.get('/logs/export', async (req, res) => {
    const date = String(req.query.date || '');
    const timezoneOffsetMinutes = Number(req.query.timezoneOffsetMinutes || 0);
    const endTimezoneOffsetMinutes = req.query.endTimezoneOffsetMinutes === undefined
        ? timezoneOffsetMinutes
        : Number(req.query.endTimezoneOffsetMinutes);

    try {
        const dailyExport = await createDailyLogExport({
            logFile: applicationLogger.logFile,
            date,
            timezoneOffsetMinutes,
            endTimezoneOffsetMinutes,
            archiveCount: applicationLogger.archiveCount
        });
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bookshelf-errors-${date}.jsonl"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Log-Entry-Count', String(dailyExport.entryCount));
        return res.send(dailyExport.content);
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Daily application log export failed:', error);
        return res.status(500).json({ error: 'Could not export the application log' });
    }
});

settingsRouter.post('/directories', (req, res) => {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'Path is required' });
    
    const now = Date.now();
    db.run("INSERT INTO ScanDirectories (path, created_at) VALUES (?, ?)", [dirPath, now], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
               return res.status(400).json({ error: 'Directory already added' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, path: dirPath });
    });
});

settingsRouter.delete('/directories/:id', (req, res) => {
    db.run("DELETE FROM ScanDirectories WHERE ID = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted' });
    });
});

app.use('/api/settings', auth, checkManageBooks, settingsRouter);

const audiobooksRouter = express.Router();

const loadAudiobooksForUser = async (userId, { reload = false } = {}) => {
    await fs.promises.mkdir(AUDIOBOOKS_DIR, { recursive: true });
    const [audiobooks, progressRows] = await Promise.all([
        reload ? loadAudiobookCatalog.reload() : loadAudiobookCatalog(),
        new Promise((resolve, reject) => {
            db.all(
                'SELECT audiobook_folder, progress_percentage FROM AudiobooksUsers WHERE user_id = ?',
                [userId],
                (error, rows) => error ? reject(error) : resolve(rows)
            );
        })
    ]);
    const progressByFolder = new Map(progressRows.map((row) => [
        row.audiobook_folder,
        Math.min(100, Math.max(0, Number(row.progress_percentage) || 0))
    ]));
    return audiobooks.map((audiobook) => ({
        ...audiobook,
        progress_percentage: progressByFolder.get(audiobook.folder) || 0
    }));
};

audiobooksRouter.get('/', async (req, res) => {
    try {
        res.json({ data: await loadAudiobooksForUser(req.user.user_id, { reload: true }) });
    } catch (err) {
        console.error('Audiobook catalog scan failed:', err);
        res.status(500).json({ error: 'Could not load the audiobook catalog' });
    }
});

audiobooksRouter.get('/series', async (req, res) => {
    try {
        const audiobooks = await loadAudiobooksForUser(req.user.user_id);
        res.json({ data: buildAudiobookSeriesCatalog(audiobooks) });
    } catch (err) {
        console.error('Audiobook series scan failed:', err);
        res.status(500).json({ error: 'Could not load audiobook series' });
    }
});

audiobooksRouter.get('/details', async (req, res) => {
    try {
        const audiobooks = await loadAudiobookCatalog();
        const audiobook = findAudiobookByFolder(audiobooks, req.query.folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }
        res.json({ data: audiobook });
    } catch (err) {
        console.error('Audiobook details scan failed:', err);
        res.status(500).json({ error: 'Could not load the audiobook' });
    }
});

audiobooksRouter.get('/progress', async (req, res) => {
    try {
        const audiobooks = await loadAudiobookCatalog();
        const audiobook = findAudiobookByFolder(audiobooks, req.query.folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }

        db.get(
            'SELECT * FROM AudiobooksUsers WHERE audiobook_folder = ? AND user_id = ?',
            [audiobook.folder, req.user.user_id],
            (err, row) => {
                if (err) return res.status(500).json({ error: err.message });

                if (!row) {
                    return res.json({
                        data: {
                            audiobook_folder: audiobook.folder,
                            track_path: audiobook.tracks[0].path,
                            track_index: 0,
                            position_seconds: 0,
                            duration_seconds: 0,
                            progress_percentage: 0
                        }
                    });
                }

                const matchingTrackIndex = audiobook.tracks.findIndex((track) => track.path === row.track_path);
                if (matchingTrackIndex === -1) {
                    return res.json({
                        data: {
                            audiobook_folder: audiobook.folder,
                            track_path: audiobook.tracks[0].path,
                            track_index: 0,
                            position_seconds: 0,
                            duration_seconds: 0,
                            progress_percentage: 0
                        }
                    });
                }

                res.json({
                    data: {
                        ...row,
                        track_index: matchingTrackIndex
                    }
                });
            }
        );
    } catch (err) {
        console.error('Audiobook progress lookup failed:', err);
        res.status(500).json({ error: 'Could not load audiobook progress' });
    }
});

audiobooksRouter.post('/progress', async (req, res) => {
    try {
        const audiobooks = await loadAudiobookCatalog();
        const audiobook = findAudiobookByFolder(audiobooks, req.body?.folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }

        const progress = buildAudiobookProgress(audiobook, req.body);
        const now = Date.now();
        const endedAt = progress.completed ? now : null;
        const values = [
            audiobook.folder,
            req.user.user_id,
            progress.trackPath,
            progress.trackIndex,
            progress.positionSeconds,
            progress.durationSeconds,
            progress.progressPercentage,
            now,
            endedAt,
            now,
            now
        ];

        db.run(
            `INSERT INTO AudiobooksUsers (
                audiobook_folder, user_id, track_path, track_index, position_seconds,
                duration_seconds, progress_percentage, audiobook_started_date,
                audiobook_ended_date, audiobooksusers_create_date, audiobooksusers_update_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, audiobook_folder) DO UPDATE SET
                track_path = excluded.track_path,
                track_index = excluded.track_index,
                position_seconds = excluded.position_seconds,
                duration_seconds = excluded.duration_seconds,
                progress_percentage = excluded.progress_percentage,
                audiobook_ended_date = excluded.audiobook_ended_date,
                audiobooksusers_update_date = excluded.audiobooksusers_update_date`,
            values,
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({
                    message: 'Audiobook progress saved',
                    data: {
                        audiobook_folder: audiobook.folder,
                        track_path: progress.trackPath,
                        track_index: progress.trackIndex,
                        position_seconds: progress.positionSeconds,
                        duration_seconds: progress.durationSeconds,
                        progress_percentage: progress.progressPercentage
                    }
                });
            }
        );
    } catch (err) {
        if (err instanceof AudiobookProgressError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Audiobook progress update failed:', err);
        res.status(500).json({ error: 'Could not save audiobook progress' });
    }
});

audiobooksRouter.put('/metadata', checkManageBooks, async (req, res) => {
    try {
        const audiobooks = await loadAudiobookCatalog();
        const audiobook = findAudiobookByFolder(audiobooks, req.body.folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }

        const requestedMetadata = req.body.metadata || {};
        const { authorIds, author: legacyAuthorName, ...fileMetadata } = requestedMetadata;
        await writeAudiobookMetadata(AUDIOBOOKS_DIR, audiobook.folder, {
            ...fileMetadata,
            author: ''
        });

        if (authorIds !== undefined) {
            await replaceAudiobookAuthors(db, audiobook.folder, authorIds);
        } else if (legacyAuthorName !== undefined) {
            const legacyAuthor = await findOrCreateAuthorByName(db, legacyAuthorName);
            await replaceAudiobookAuthors(db, audiobook.folder, legacyAuthor ? [legacyAuthor.ID] : []);
        }

        const updatedAudiobooks = await loadAudiobookCatalog.reload();
        const updatedAudiobook = updatedAudiobooks.find((item) => item.folder === audiobook.folder);
        res.json({ data: updatedAudiobook });
    } catch (err) {
        if (err instanceof AudiobookAuthorError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        if (err instanceof AudiobookCatalogError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Audiobook metadata update failed:', err);
        res.status(500).json({ error: 'Could not update audiobook metadata' });
    }
});

audiobooksRouter.post('/cover-from-url', checkManageBooks, async (req, res) => {
    const folder = req.body.folder;
    try {
        const audiobooks = await loadAudiobookCatalog();
        const audiobook = findAudiobookByFolder(audiobooks, folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }

        const cover = await downloadRemoteImage(req.body.coverUrl);
        const directoryPath = resolveAudiobookDirectoryPath(AUDIOBOOKS_DIR, audiobook.folder);
        const fileName = `${MANAGED_COVER_PREFIX}${cover.extension}`;
        const filePath = path.join(directoryPath, fileName);
        const temporaryPath = path.join(
            directoryPath,
            `${MANAGED_COVER_PREFIX}${process.pid}-${Date.now()}.tmp`
        );

        try {
            await fs.promises.writeFile(temporaryPath, cover.data, { mode: 0o600 });
            await fs.promises.rename(temporaryPath, filePath);
            await Promise.all([...COVER_EXTENSIONS]
                .map((extension) => path.join(directoryPath, `${MANAGED_COVER_PREFIX}${extension.slice(1)}`))
                .filter((managedPath) => managedPath !== filePath)
                .map((managedPath) => fs.promises.rm(managedPath, { force: true })));
        } finally {
            await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
        }

        const updatedAudiobooks = await loadAudiobookCatalog.reload();
        const updatedAudiobook = updatedAudiobooks.find((item) => item.folder === audiobook.folder);
        res.json({ data: updatedAudiobook });
    } catch (err) {
        if (err instanceof RemoteImageError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        if (err instanceof AudiobookCatalogError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Audiobook cover update failed:', err);
        res.status(500).json({ error: 'Could not update the audiobook cover' });
    }
});

audiobooksRouter.get('/cover', (req, res) => {
    let cover;
    try {
        cover = resolveAudiobookCoverPath(AUDIOBOOKS_DIR, req.query.path);
    } catch (err) {
        if (err instanceof AudiobookCatalogError) {
            return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Could not prepare the audiobook cover' });
    }

    fs.stat(cover.coverPath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).json({ error: 'Audiobook cover not found' });
        }

        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.sendFile(cover.coverPath);
    });
});

audiobooksRouter.get('/audio', (req, res) => {
    let audio;
    try {
        audio = resolveAudiobookAudioPath(AUDIOBOOKS_DIR, req.query.path);
    } catch (err) {
        if (err instanceof AudiobookCatalogError) {
            return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Could not prepare the audiobook track' });
    }

    fs.stat(audio.audioPath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).json({ error: 'Audiobook track not found' });
        }

        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Vary', 'User-Agent');
        res.type(getAudiobookContentType(audio.relativePath, req.get('user-agent')));
        res.sendFile(audio.audioPath);
    });
});

const safeDownloadName = (title, fallback = 'audiobook') => {
    const sanitized = String(title || fallback)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return sanitized || fallback;
};

audiobooksRouter.get('/download', async (req, res) => {
    try {
        const audiobooks = await loadAudiobookCatalog();
        const audiobook = findAudiobookByFolder(audiobooks, req.query.folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }

        const downloadName = safeDownloadName(audiobook.title);
        if (audiobook.tracks.length === 1) {
            const track = resolveAudiobookAudioPath(AUDIOBOOKS_DIR, audiobook.tracks[0].path);
            const extension = path.extname(track.audioPath).toLowerCase();
            return res.download(track.audioPath, `${downloadName}${extension}`);
        }

        const directoryPath = resolveAudiobookDirectoryPath(AUDIOBOOKS_DIR, audiobook.folder);
        res.attachment(`${downloadName}.tar`);
        res.type('application/x-tar');

        const archiveProcess = spawn('tar', ['-cf', '-', '-C', directoryPath, '.'], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let archiveError = '';
        archiveProcess.stderr.on('data', (chunk) => {
            if (archiveError.length < 2000) archiveError += chunk.toString();
        });
        archiveProcess.on('error', (err) => {
            console.error('Could not start audiobook archive:', err);
            if (!res.headersSent) res.status(500).json({ error: 'Could not prepare audiobook download' });
            else res.destroy(err);
        });
        archiveProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('Audiobook archive failed:', archiveError || `tar exited with code ${code}`);
            }
        });
        res.on('close', () => {
            if (!archiveProcess.killed) archiveProcess.kill('SIGTERM');
        });
        archiveProcess.stdout.pipe(res);
    } catch (err) {
        if (err instanceof AudiobookCatalogError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Audiobook download failed:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Could not prepare audiobook download' });
    }
});

audiobooksRouter.delete('/', checkManageUsers, async (req, res) => {
    try {
        const audiobooks = await loadAudiobookCatalog.reload();
        const audiobook = findAudiobookByFolder(audiobooks, req.query.folder);
        if (!audiobook) {
            return res.status(404).json({ error: 'Audiobook not found' });
        }
        if (audiobook.folder === '.') {
            if (audiobook.tracks.length !== 1) {
                return res.status(400).json({
                    error: 'Root-level audiobook files must be placed in separate folders before deletion'
                });
            }

            const rootTrack = resolveAudiobookAudioPath(AUDIOBOOKS_DIR, audiobook.tracks[0].path);
            await fs.promises.unlink(rootTrack.audioPath);
            await deleteAudiobookRecord(db, audiobook.folder);
            await loadAudiobookCatalog.reload();
            return res.json({ message: 'Audiobook deleted' });
        }

        const directoryPath = resolveAudiobookDirectoryPath(AUDIOBOOKS_DIR, audiobook.folder);
        await fs.promises.rm(directoryPath, { recursive: true, force: false });
        await deleteAudiobookRecord(db, audiobook.folder);
        await loadAudiobookCatalog.reload();
        res.json({ message: 'Audiobook deleted' });
    } catch (err) {
        if (err instanceof AudiobookCatalogError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Audiobook deletion failed:', err);
        res.status(500).json({ error: 'Could not delete audiobook' });
    }
});

audiobooksRouter.post('/upload/check-duplicates', checkManageBooks, async (req, res) => {
    try {
        const conflicts = await findAudiobookUploadConflicts(AUDIOBOOKS_DIR, req.body?.files);
        res.json({ data: conflicts });
    } catch (err) {
        if (err instanceof AudiobookUploadError) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Audiobook duplicate check failed:', err);
        res.status(500).json({ error: 'Could not check audiobook files' });
    }
});

audiobooksRouter.post('/upload', checkManageBooks, async (req, res) => {
    if (!req.files || !req.files.audiobook || Array.isArray(req.files.audiobook)) {
        return res.status(400).json({ error: 'One audiobook file is required' });
    }

    const audiobookFile = req.files.audiobook;
    let destination;
    try {
        destination = resolveAudiobookUploadPath(
            AUDIOBOOKS_DIR,
            req.body.relativePath,
            audiobookFile.name
        );
    } catch (err) {
        if (err instanceof AudiobookUploadError) {
            return res.status(400).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Could not prepare audiobook upload' });
    }

    let uploadReserved = false;
    try {
        fs.mkdirSync(path.dirname(destination.uploadPath), { recursive: true });

        let reservation;
        try {
            reservation = await fs.promises.open(destination.uploadPath, 'wx', 0o600);
            uploadReserved = true;
            await reservation.close();
        } catch (err) {
            if (err?.code === 'EEXIST') {
                return res.status(409).json({
                    error: 'Audiobook file already exists on the server',
                    duplicate: true,
                    path: destination.relativePath
                });
            }
            throw err;
        }

        await audiobookFile.mv(destination.uploadPath);
        uploadReserved = false;
        await loadAudiobookCatalog.reload();
        res.status(201).json({
            message: 'Audiobook file uploaded',
            path: destination.relativePath,
            size: audiobookFile.size
        });
    } catch (err) {
        if (uploadReserved) {
            await fs.promises.unlink(destination.uploadPath).catch(() => undefined);
        }
        console.error('Audiobook upload failed:', err);
        res.status(500).json({ error: 'Could not store audiobook file' });
    }
});

app.use('/api/audiobooks', auth, audiobooksRouter);

const audiobookshelfRouters = createAudiobookshelfRouters({
    db,
    loadAudiobookCatalog,
    audiobooksDirectory: AUDIOBOOKS_DIR,
    resolveAudiobookAudioPath,
    resolveAudiobookCoverPath,
    getAudiobookContentType,
    serverVersion
});
app.use('/api', audiobookshelfRouters.apiRouter);
app.use('/public/session', audiobookshelfRouters.publicSessionRouter);

// Serve comic pages
booksRouter.get('/:id/pages', async (req, res) => {
    const bookId = req.params.id;
    const file = req.query.file;

    if (!file) {
        return res.status(400).send('File parameter required');
    }

    try {
        const row = await new Promise((resolve, reject) => {
             db.get("SELECT book_filename FROM Books WHERE ID = ?", [bookId], (err, row) => {
                 if (err) reject(err);
                 else resolve(row);
             });
        });

        if (!row || !row.book_filename) return res.status(404).send('Book not found');

        const result = await getComicPage(db, row.book_filename, file);
        if (result) {
            // Determine mime type
            const ext = path.extname(file).toLowerCase();
            let mime = 'image/jpeg';
            if (ext === '.png') mime = 'image/png';
            if (ext === '.webp') mime = 'image/webp';
            if (ext === '.gif') mime = 'image/gif';
            
            res.setHeader('Content-Type', mime);
            res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
            res.send(result);
        } else {
            res.status(404).send('Page not found');
        }
    } catch (e) {
        console.error('Error serving comic page:', e);
        res.status(500).send(e.message);
    }
});

// -----------------------------------------------------------------
// READLISTS ROUTES
// -----------------------------------------------------------------
const readlistsRouter = express.Router();

// Get user's readlists
readlistsRouter.get('/', (req, res) => {
    const userId = req.user.user_id;
    const sql = `
        SELECT r.*, COUNT(br.book_id) as book_count 
        FROM Readlists r 
        LEFT JOIN BooksReadlists br ON r.ID = br.readlist_id 
        WHERE r.user_id = ? 
        GROUP BY r.ID 
        ORDER BY r.readlist_update_date DESC
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Get specific readlist
readlistsRouter.get('/:id', (req, res) => {
    const userId = req.user.user_id;
    const readlistId = req.params.id;
    db.get("SELECT * FROM Readlists WHERE ID = ? AND user_id = ?", [readlistId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Readlist not found' });
        res.json({ data: row });
    });
});

// Create readlist
// Create readlist
// Create readlist
readlistsRouter.post('/', (req, res) => {
    const userId = req.user.user_id;
    const { readlist_title, readlist_visible, readlist_background } = req.body;
    
    if (!readlist_title) return res.status(400).json({ error: 'Title is required' });
    
    const now = Date.now();
    const visible = readlist_visible !== undefined ? readlist_visible : 1;
    
    db.run(
        "INSERT INTO Readlists (user_id, readlist_title, readlist_visible, readlist_background, readlist_create_date, readlist_update_date) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, readlist_title, visible, readlist_background || null, now, now],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ 
                data: { 
                    ID: this.lastID, 
                    user_id: userId, 
                    readlist_title, 
                    readlist_visible: visible,
                    readlist_background,
                    readlist_create_date: now, 
                    readlist_update_date: now 
                } 
            });
        }
    );
});

// Update readlist
readlistsRouter.put('/:id', (req, res) => {
    const userId = req.user.user_id;
    const readlistId = req.params.id;
    const { readlist_title, readlist_visible, readlist_background } = req.body;
    
    const now = Date.now();
    
    db.run(
        `UPDATE Readlists SET 
            readlist_title = COALESCE(?, readlist_title), 
            readlist_visible = COALESCE(?, readlist_visible), 
            readlist_background = COALESCE(?, readlist_background), 
            readlist_update_date = ? 
        WHERE ID = ? AND user_id = ?`,
        [readlist_title, readlist_visible, readlist_background, now, readlistId, userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Readlist not found' });
            res.json({ message: 'Readlist updated' });
        }
    );
});

// Delete readlist
readlistsRouter.delete('/:id', (req, res) => {
    const userId = req.user.user_id;
    const readlistId = req.params.id;
    
    // First delete relations
    db.run("DELETE FROM BooksReadlists WHERE readlist_id = ?", [readlistId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Then delete list
        db.run("DELETE FROM Readlists WHERE ID = ? AND user_id = ?", [readlistId, userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Readlist not found' });
            res.json({ message: 'Readlist deleted' });
        });
    });
});

// Get books in readlist
readlistsRouter.get('/:id/books', (req, res) => {
    const userId = req.user.user_id;
    const readlistId = req.params.id;
    
    // Verify ownership first
    db.get("SELECT ID FROM Readlists WHERE ID = ? AND user_id = ?", [readlistId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Readlist not found' });
        
        const sql = `
            SELECT b.*, bu.book_progress_percentage 
            FROM Books b
            JOIN BooksReadlists br ON b.ID = br.book_id
            LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
            WHERE br.readlist_id = ?
        `;
        db.all(sql, [userId, readlistId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        });
    });
});

// Add book to readlist
readlistsRouter.post('/:id/books', (req, res) => {
    const userId = req.user.user_id;
    const readlistId = req.params.id;
    const { book_id } = req.body;
    
    if (!book_id) return res.status(400).json({ error: 'Book ID is required' });
    
    // Verify ownership
    db.get("SELECT ID FROM Readlists WHERE ID = ? AND user_id = ?", [readlistId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Readlist not found' });
        
        const now = Date.now();
        db.run(
            "INSERT INTO BooksReadlists (book_id, readlist_id, booksreadlists_create_date) VALUES (?, ?, ?)",
            [book_id, readlistId, now],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Book already in readlist' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ message: 'Book added to readlist', id: this.lastID });
            }
        );
    });
});

// Remove book from readlist
readlistsRouter.delete('/:id/books/:bookId', (req, res) => {
    const userId = req.user.user_id;
    const readlistId = req.params.id;
    const bookId = req.params.bookId;
    
    // Verify ownership
    db.get("SELECT ID FROM Readlists WHERE ID = ? AND user_id = ?", [readlistId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Readlist not found' });
        
        db.run(
            "DELETE FROM BooksReadlists WHERE readlist_id = ? AND book_id = ?",
            [readlistId, bookId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Book removed from readlist' });
            }
        );
    });
});

app.use('/api/readlists', auth, readlistsRouter);
app.use('/api/books-readlists', createCrudRouter('BooksReadlists', db));

app.get('/api/library/scan', auth, (req, res) => {
    // Check for librarian/managebooks permission
    if (!req.user.userrole_managebooks) {
        // Since this is SSE, we can't just return 403 easily if the header is not written, 
        // but typically express middleware handles it before we get here.
        // However, if we do get here, we must verify.
        return res.status(403).json({ error: 'Permission denied: Librarian access required' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    console.log('Library scan requested by user (SSE):', req.user?.user_username);
    
    // First, run import from directories
    importFiles(db, (message) => {
        sendEvent({ type: 'progress', message, count: 0, total: 100 }); // Indeterminate progress for import
    })
    .then(() => {
        // Then run scan
        return scanLibrary(db, (message, count, total) => {
            sendEvent({ type: 'progress', message, count, total });
        });
    })
    .then(result => {
        sendEvent({ type: 'complete', ...result, message: `Scan complete: ${result.totalFiles} files processed. ${result.newBooks} new books added.` });
        res.end();
    })
    .catch(err => {
        console.error('Library scan error:', err);
        sendEvent({ type: 'error', error: err.message });
        res.end();
    });
});

app.get('/api/library/refresh-covers', auth, (req, res) => {
    // Check for librarian/managebooks permission
    if (!req.user.userrole_managebooks) {
        return res.status(403).json({ error: 'Permission denied: Librarian access required' });
    }
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    console.log('Cover refresh requested by user (SSE):', req.user?.user_username);

    refreshCovers(db, (message, count, total) => {
        sendEvent({ type: 'progress', message, count, total });
    })
    .then(result => {
        sendEvent({ type: 'complete', ...result, message: `Cover refresh complete: ${result.totalProcessed} covers processed.` });
        res.end();
    })
    .catch(err => {
        console.error('Cover refresh error:', err);
        sendEvent({ type: 'error', error: err.message });
        res.end();
    });
});

app.use((err, req, res, next) => {
    applicationLogger.error('http.unhandled_error', err, getRequestContext(req));
    if (res.headersSent) return next(err);
    return res.status(500).send(`Server error. Reference: ${req.requestId}`);
});

if (require.main === module) {
    const runMigrations = require('./run_migrations');
    const seedUserRoles = require('./seed_userroles');
    const seedUsers = require('./seed_users');

    const startServer = async () => {
        try {
            console.log("Initializing database...");
            await runMigrations(db);
            await seedUserRoles(db);
            await seedUsers(db);
            await fs.promises.mkdir(AUDIOBOOKS_DIR, { recursive: true });
            await loadAudiobookCatalog();
            
            // Manual schema patch for book_current_page if migrations missed it
            db.serialize(() => {
                db.all("PRAGMA table_info(BooksUsers)", (err, rows) => {
                    if (err) return console.error("Could not check BooksUsers schema:", err);
                    const hasPage = rows.some(r => r.name === 'book_current_page');
                    if (!hasPage) {
                        console.log("Adding missing column 'book_current_page' to BooksUsers...");
                        db.run("ALTER TABLE BooksUsers ADD COLUMN book_current_page INTEGER DEFAULT 0", (err) => {
                            if (err) console.error("Error adding column:", err);
                            else console.log("Column added successfully.");
                        });
                    }
                });
            });

            console.log("Database initialized.");

            app.listen(PORT, () => {
                console.log(`Server is running on port ${PORT}`);
            });
        } catch (err) {
            console.error("Failed to start server:", err);
            process.exit(1);
        }
    };

    startServer();
}

module.exports = app;
