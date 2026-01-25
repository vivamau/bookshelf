const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const createCrudRouter = require('./utils/crudFactory');
const auth = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // For password hashing handling if we implement register/login

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');

app.use(cors());
app.use(express.json());
app.use('/covers', express.static(path.join(__dirname, 'covers')));
app.use('/books_files', express.static(path.join(__dirname, 'books')));
app.use('/extracted', express.static(path.join(__dirname, 'extracted')));

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
        if (err) return res.status(500).send("Server error");
        if (user) {
            const validPass = await bcrypt.compare(password, user.user_password.toString());
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
            user.token = token;
            delete user.user_password; // Don't send password back
            return res.status(200).json(user);
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
        
        const insertSql = "INSERT INTO Users (user_username, user_email, user_password, user_create_date) VALUES (?, ?, ?, ?)";
        const now = Date.now();
        
        db.run(insertSql, [username, email, encryptedPassword, now], function(err) {
            if (err) return res.status(500).send(err.message);
            
             const token = jwt.sign(
                { user_id: this.lastID, email },
                process.env.TOKEN_KEY || 'default_secret_key',
                { expiresIn: "2h" }
            );
            
            res.status(201).json({ id: this.lastID, username, email, token });
        });
    });
});


// Secure all API routes
app.use('/api', auth);

// API Routes
// Custom Generes Routes (Handle timestamps)
const generesRouter = express.Router();
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
app.use('/api/publishers', createCrudRouter('Publishers', db));
app.use('/api/users', createCrudRouter('Users', db));
app.use('/api/books-users', createCrudRouter('BooksUsers', db));
app.use('/api/languages', createCrudRouter('Languages', db));
// Custom Books Routes (Override default GET to include joins and progress)
const booksRouter = createCrudRouter('Books', db, 'ID', ['POST', 'PUT', 'DELETE']);

// Update getAll to include progress
booksRouter.get('/', (req, res) => {
    const userId = req.user.user_id;
    const sql = `
        SELECT b.*, bu.book_progress_percentage 
        FROM Books b
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
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

booksRouter.get('/:id', (req, res) => {
    const userId = req.user.user_id;
    const bookId = req.params.id;
    console.log(`Fetching details for book ID: ${bookId} for user: ${userId}`);

    const sql = `
        SELECT b.ID, b.book_title, b.book_isbn, b.book_summary, b.book_cover_img, 
               b.book_date, b.book_create_date, b.book_filename, b.book_entry_point, b.book_spine,
               l.language_name, 
               f.format_name, 
               p.publisher_name,
               bu.book_current_index,
               bu.book_progress_percentage,
               (SELECT COUNT(*) FROM BooksUsers WHERE book_id = b.ID) as readers_count,
               (SELECT GROUP_CONCAT(a.ID || '::' || a.author_name || ' ' || a.author_lastname, '||') 
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
        res.json({ data: row });
    });
});

app.use('/api/books', booksRouter);
app.use('/api/userroles', createCrudRouter('UserRoles', db, 'ID', ['GET']));

// Library scan endpoint
const { scanLibrary } = require('./utils/libraryScanner');
app.post('/api/library/scan', async (req, res) => {
    try {
        console.log('Library scan requested by user:', req.user.username);
        const result = await scanLibrary(db);
        res.json({ success: true, message: `Scan complete. Added ${result.newBooks} new books out of ${result.totalFiles} total files.`, ...result });
    } catch (err) {
        console.error('Library scan error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
