const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const createCrudRouter = require('./utils/crudFactory');
const auth = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 
const axios = require('axios');
const fs = require('fs');
const multer = require('multer');

const { scanLibrary, refreshCovers, importFiles, scanSingleFile } = require('./utils/libraryScanner');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const os = require('os');
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use('/covers', express.static(path.join(__dirname, 'covers')));
const BOOKS_DIR = path.join(__dirname, 'books');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

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
            console.error("DB Error during login:", err);
            return res.status(500).send("Server error");
        }
        if (user) {
            const passwordHash = user.user_password.toString();
            console.log(`Debug: User found: ${username}, stored hash prefix: ${passwordHash.substring(0, 10)}...`);
            const validPass = await bcrypt.compare(password, passwordHash);
            console.log(`Login attempt for ${username}: ${validPass ? 'SUCCESS' : 'FAILED'}`);
            if (!validPass) return res.status(400).send("Invalid Credentials");

            console.log('User permissions:', {
                manageusers: user.userrole_manageusers,
                managebooks: user.userrole_managebooks,
                readbooks: user.userrole_readbooks,
                viewbooks: user.userrole_viewbooks
            });

            const token = jwt.sign(
                { 
                    user_id: user.ID, 
                    username: user.user_username,
                    userrole_manageusers: user.userrole_manageusers,
                    userrole_managebooks: user.userrole_managebooks,
                    userrole_readbooks: user.userrole_readbooks,
                    userrole_viewbooks: user.userrole_viewbooks
                },
                process.env.TOKEN_KEY || 'default_secret_key',
                { expiresIn: "2h" }
            );
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
                token: token
            };
            
            return res.status(200).json(userInfo);
        }
        return res.status(400).send("Invalid Credentials");
    });
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
                    userrole_manageusers: 0,
                    userrole_managebooks: 0,
                    userrole_readbooks: 0,
                    userrole_viewbooks: 1
                },
                process.env.TOKEN_KEY || 'default_secret_key',
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

    // Get author details
    authorsRouter.get('/:id', (req, res) => {
        db.get("SELECT * FROM Authors WHERE ID = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Author not found' });
            res.json({ data: row });
        });
    });

    // Fallback to CRUD for other author methods
    const crud = createCrudRouter('Authors', db);
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
        SELECT u.ID, u.user_username, u.user_email, u.user_name, u.user_lastname, u.user_avatar, u.user_create_date, u.user_update_date, u.userrole_id, 
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
        SELECT u.ID, u.user_username, u.user_email, u.user_name, u.user_lastname, u.user_avatar, u.user_create_date, u.user_update_date, u.userrole_id, 
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
    const { user_username, user_email, user_password, userrole_id, user_name, user_lastname, user_avatar } = req.body;
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
    const targetRoleId = isAdmin ? (userrole_id || 3) : req.user.userrole_id; // Default to old role if not admin

    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user_username}`;
    let sql = "UPDATE Users SET user_username = ?, user_email = ?, user_name = ?, user_lastname = ?, user_avatar = ?, userrole_id = ?, user_update_date = ?";
    let params = [user_username, user_email, user_name || null, user_lastname || null, user_avatar || defaultAvatar, targetRoleId, now];

    if (user_password && user_password.trim() !== "") {
        try {
            const hashedPassword = await bcrypt.hash(user_password, 10);
            sql = "UPDATE Users SET user_username = ?, user_email = ?, user_password = ?, user_name = ?, user_lastname = ?, user_avatar = ?, userrole_id = ?, user_update_date = ?";
            params = [user_username, user_email, hashedPassword, user_name || null, user_lastname || null, user_avatar || defaultAvatar, targetRoleId, now];
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

// Multer setup for book uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, BOOKS_DIR);
    },
    filename: function (req, file, cb) {
        // Keep original filename or sanitize
        cb(null, file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === 'application/epub+zip' || 
            file.mimetype === 'application/pdf' || 
            file.originalname.toLowerCase().endsWith('.epub') || 
            file.originalname.toLowerCase().endsWith('.pdf')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only EPUB and PDF are allowed.'));
        }
    }
});

// Upload Book Route
booksRouter.post('/upload', checkManageBooks, upload.single('book'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid format' });
    
    try {
        console.log(`Uploaded file: ${req.file.filename}`);
        const result = await scanSingleFile(db, req.file.filename);
        
        if (result && result.isNew) {
            res.status(201).json({ message: 'Book uploaded and processed successfully', filename: req.file.filename, bookId: result.bookId });
        } else {
            const bookId = result ? result.bookId : null;
            res.status(200).json({ message: 'Book updated (duplicate found)', filename: req.file.filename, bookId });
        }
    } catch (err) {
        console.error('Upload processing error:', err);
        res.status(500).json({ error: 'Processing failed: ' + err.message });
    }
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

// Download cover from URL and set it for a book
booksRouter.post('/:id/cover-from-url', async (req, res) => {
    const bookId = req.params.id;
    const { coverUrl } = req.body;

    if (!coverUrl) {
        return res.status(400).json({ error: 'Cover URL is required' });
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
booksRouter.get('/', (req, res) => {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; 
    const offset = (page - 1) * limit;

    const countSql = `SELECT COUNT(*) as total FROM Books`;
    const sql = `
        SELECT b.*, bu.book_progress_percentage 
        FROM Books b
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
        ORDER BY b.ID DESC
        LIMIT ? OFFSET ?
    `;

    db.get(countSql, [], (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(sql, [userId, limit, offset], (err, rows) => {
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
booksRouter.get('/:id/progress', (req, res) => {
    const userId = req.user.user_id;
    const bookId = req.params.id;
    
    db.get("SELECT * FROM BooksUsers WHERE book_id = ? AND user_id = ?", [bookId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: row || { book_current_index: 0, book_progress_percentage: 0 } });
    });
});

// Update progress
booksRouter.post('/:id/progress', (req, res) => {
    const userId = req.user.user_id;
    const bookId = req.params.id;
    const { current_index, progress_percentage } = req.body;
    const now = Date.now();

    db.get("SELECT ID FROM BooksUsers WHERE book_id = ? AND user_id = ?", [bookId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            // Update
            db.run(
                "UPDATE BooksUsers SET book_current_index = ?, book_progress_percentage = ?, booksusers_update_date = ? WHERE ID = ?",
                [current_index, progress_percentage, now, row.ID],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Progress updated' });
                }
            );
        } else {
            // Insert
            db.run(
                "INSERT INTO BooksUsers (book_id, user_id, book_current_index, book_progress_percentage, book_started_date, booksusers_create_date, booksusers_update_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [bookId, userId, current_index, progress_percentage, now, now, now],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.status(201).json({ message: 'Progress started' });
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

        const filePath = path.join(BOOKS_DIR, book.book_filename);
        if (fs.existsSync(filePath)) {
            // Increment counter on real download
            db.run("UPDATE Books SET book_downloads = COALESCE(book_downloads, 0) + 1 WHERE ID = ?", [bookId]);
            // Send file
            res.download(filePath, book.book_filename);
        } else {
            res.status(404).json({ error: 'Source file not found' });
        }
    });
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

app.get('/api/library/scan', (req, res) => {
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

app.get('/api/library/refresh-covers', (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
