const express = require('express');
const router = express.Router();
const xml2js = require('xml2js');
const db = require('../config/db');
const path = require('path');
const fs = require('fs');

// Constants
const PAGE_SIZE = 50;
const BASE_URL_PLACEHOLDER = 'BASE_URL_PLACEHOLDER'; // Will be replaced by req.protocol + '://' + req.get('host')

// XML Builder
const builder = new xml2js.Builder({
    headless: false,
    renderOpts: { pretty: true }
});

// Helper to get base URL
const getBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;

// Helper to generate Feed Object
const createFeed = (req, title, id, entries = []) => {
    const baseUrl = getBaseUrl(req);
    return {
        feed: {
            $: {
                xmlns: 'http://www.w3.org/2005/Atom',
                'xmlns:dc': 'http://purl.org/dc/terms/',
                'xmlns:opds': 'http://opds-spec.org/2010/catalog'
            },
            id: id,
            title: title,
            updated: new Date().toISOString(),
            author: {
                name: 'Bookshelf Library',
                uri: baseUrl
            },
            link: [
                { $: { rel: 'self', href: req.originalUrl, type: 'application/atom+xml;profile=opds-catalog;kind=navigation' } },
                { $: { rel: 'start', href: '/opds', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' } },
                { $: { rel: 'search', href: '/opds/search', type: 'application/opensearchdescription+xml', title: 'Search Bookshelf' } }
            ],
            entry: entries
        }
    };
};

// Helper: Convert Book to Entry
const bookToEntry = (req, book) => {
    const baseUrl = getBaseUrl(req);
    const bookId = book.ID;
    const downloadUrl = `/opds/download/${bookId}`;
    const coverUrl = book.book_cover_img ? (book.book_cover_img.startsWith('http') ? book.book_cover_img : `${baseUrl}/covers/${path.basename(book.book_cover_img)}`) : '';
    
    // Determine mime type from filename
    let mimeType = 'application/epub+zip';
    if (book.book_filename && book.book_filename.endsWith('.pdf')) {
        mimeType = 'application/pdf';
    }

    return {
        title: book.book_title,
        id: `urn:book:${bookId}`,
        updated: new Date(book.book_create_date || Date.now()).toISOString(),
        author: {
            name: `${book.author_name || 'Unknown'} ${book.author_lastname || ''}`.trim()
        },
        'dc:language': 'en', // Default, should ideally come from DB
        'dc:format': mimeType,
        'dc:identifier': `urn:book:${bookId}`,
        category: book.genere_title ? { $: { term: book.genere_title, label: book.genere_title } } : undefined,
        link: [
            { $: { rel: 'http://opds-spec.org/image', href: coverUrl, type: 'image/jpeg' } },
            { $: { rel: 'http://opds-spec.org/image/thumbnail', href: coverUrl, type: 'image/jpeg' } },
            { $: { rel: 'http://opds-spec.org/acquisition', href: downloadUrl, type: mimeType } }
        ],
        content: {
            $: { type: 'text' },
            _: book.book_description || 'No description available.'
        }
    };
};

// 1. Root Catalog
router.get('/', (req, res) => {
    const baseUrl = getBaseUrl(req);
    
    const entries = [
        {
            title: 'New Arrivals',
            id: 'urn:opds:new',
            updated: new Date().toISOString(),
            content: { $: { type: 'text' }, _: 'Recently added books' },
            link: { $: { rel: 'subsection', href: '/opds/new', type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' } }
        },
        {
            title: 'All Books',
            id: 'urn:opds:all',
            updated: new Date().toISOString(),
            content: { $: { type: 'text' }, _: 'Browse all books' },
            link: { $: { rel: 'subsection', href: '/opds/all', type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' } }
        },
        {
            title: 'Authors',
            id: 'urn:opds:authors',
            updated: new Date().toISOString(),
            content: { $: { type: 'text' }, _: 'Browse by author' },
            link: { $: { rel: 'subsection', href: '/opds/authors', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' } }
        },
        {
            title: 'Genres',
            id: 'urn:opds:genres',
            updated: new Date().toISOString(),
            content: { $: { type: 'text' }, _: 'Browse by genre' },
            link: { $: { rel: 'subsection', href: '/opds/genres', type: 'application/atom+xml;profile=opds-catalog;kind=navigation' } }
        }
    ];

    const feed = createFeed(req, 'Bookshelf Catalog', 'urn:opds:root', entries);
    res.type('application/atom+xml');
    res.send(builder.buildObject(feed));
});

// 2. New Arrivals
router.get('/new', (req, res) => {
    const sql = `
        SELECT b.*, a.author_name, a.author_lastname, g.genere_title
        FROM Books b
        LEFT JOIN BooksAuthors ba ON b.ID = ba.book_id
        LEFT JOIN Authors a ON ba.author_id = a.ID
        LEFT JOIN BooksGeneres bg ON b.ID = bg.book_id
        LEFT JOIN Generes g ON bg.genere_id = g.ID
        ORDER BY b.book_create_date DESC
        LIMIT 50
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        const entries = rows.map(book => bookToEntry(req, book));
        const feed = createFeed(req, 'New Arrivals', 'urn:opds:new', entries);
        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 3. All Books (Paginated)
router.get('/all', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * PAGE_SIZE;

    const sql = `
        SELECT b.*, a.author_name, a.author_lastname, g.genere_title
        FROM Books b
        LEFT JOIN BooksAuthors ba ON b.ID = ba.book_id
        LEFT JOIN Authors a ON ba.author_id = a.ID
        LEFT JOIN BooksGeneres bg ON b.ID = bg.book_id
        LEFT JOIN Generes g ON bg.genere_id = g.ID
        ORDER BY b.book_title ASC
        LIMIT ? OFFSET ?
    `;

    db.all(sql, [PAGE_SIZE, offset], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        const entries = rows.map(book => bookToEntry(req, book));
        const feed = createFeed(req, `All Books (Page ${page})`, 'urn:opds:all', entries);
        
        // Add next page link if likely more
        if (rows.length === PAGE_SIZE) {
            feed.feed.link.push({ 
                $: { rel: 'next', href: `/opds/all?page=${page + 1}`, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' } 
            });
        }
         // Add prev page link
         if (page > 1) {
            feed.feed.link.push({ 
                $: { rel: 'previous', href: `/opds/all?page=${page - 1}`, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' } 
            });
        }

        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 4. Authors List
router.get('/authors', (req, res) => {
    db.all("SELECT * FROM Authors ORDER BY author_name ASC", [], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        
        const entries = rows.map(author => ({
            title: `${author.author_name} ${author.author_lastname}`.trim(),
            id: `urn:author:${author.ID}`,
            updated: new Date().toISOString(),
            content: { $: { type: 'text' }, _: 'Author' },
            link: { $: { rel: 'subsection', href: `/opds/authors/${author.ID}`, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' } }
        }));

        const feed = createFeed(req, 'Authors', 'urn:opds:authors', entries);
        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 5. Books by Author
router.get('/authors/:id', (req, res) => {
    const authorId = req.params.id;
    const sql = `
        SELECT b.*, a.author_name, a.author_lastname, g.genere_title
        FROM Books b
        JOIN BooksAuthors ba ON b.ID = ba.book_id
        JOIN Authors a ON ba.author_id = a.ID
        LEFT JOIN BooksGeneres bg ON b.ID = bg.book_id
        LEFT JOIN Generes g ON bg.genere_id = g.ID
        WHERE a.ID = ?
        ORDER BY b.book_create_date DESC
    `;

    db.all(sql, [authorId], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        if (rows.length === 0) return res.status(404).send('Author not found or no books');

        const authorName = `${rows[0].author_name} ${rows[0].author_lastname}`.trim();
        const entries = rows.map(book => bookToEntry(req, book));
        const feed = createFeed(req, `Books by ${authorName}`, `urn:author:${authorId}`, entries);
        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 6. Genres List
router.get('/genres', (req, res) => {
    db.all("SELECT * FROM Generes ORDER BY genere_title ASC", [], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        
        const entries = rows.map(genre => ({
            title: genre.genere_title,
            id: `urn:genre:${genre.ID}`,
            updated: new Date().toISOString(),
            content: { $: { type: 'text' }, _: 'Genre' },
            link: { $: { rel: 'subsection', href: `/opds/genres/${genre.ID}`, type: 'application/atom+xml;profile=opds-catalog;kind=acquisition' } }
        }));

        const feed = createFeed(req, 'Genres', 'urn:opds:genres', entries);
        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 7. Books by Genre
router.get('/genres/:id', (req, res) => {
    const genreId = req.params.id;
    const sql = `
        SELECT b.*, a.author_name, a.author_lastname, g.genere_title
        FROM Books b
        JOIN BooksGeneres bg ON b.ID = bg.book_id
        JOIN Generes g ON bg.genere_id = g.ID
        LEFT JOIN BooksAuthors ba ON b.ID = ba.book_id
        LEFT JOIN Authors a ON ba.author_id = a.ID
        WHERE g.ID = ?
        ORDER BY b.book_create_date DESC
    `;

    db.all(sql, [genreId], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        if (rows.length === 0) return res.status(404).send('Genre not found or no books');

        const genreTitle = rows[0].genere_title;
        const entries = rows.map(book => bookToEntry(req, book));
        const feed = createFeed(req, `Books in ${genreTitle}`, `urn:genre:${genreId}`, entries);
        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 8. OpenSearch XML
router.get('/search', (req, res) => {
    const baseUrl = getBaseUrl(req);
    const opensearch = {
        OpenSearchDescription: {
            $: { xmlns: 'http://a9.com/-/spec/opensearch/1.1/' },
            ShortName: 'Bookshelf',
            Description: 'Search for books by title, author, or ISBN',
            InputEncoding: 'UTF-8',
            OutputEncoding: 'UTF-8',
            Url: {
                $: {
                    type: 'application/atom+xml',
                    template: `${baseUrl}/opds/search-results?q={searchTerms}`
                }
            }
        }
    };
    res.type('application/opensearchdescription+xml');
    res.send(builder.buildObject(opensearch));
});

// 9. Search Results
router.get('/search-results', (req, res) => {
    const query = req.query.q;
    const sql = `
        SELECT b.*, a.author_name, a.author_lastname, g.genere_title
        FROM Books b
        LEFT JOIN BooksAuthors ba ON b.ID = ba.book_id
        LEFT JOIN Authors a ON ba.author_id = a.ID
        LEFT JOIN BooksGeneres bg ON b.ID = bg.book_id
        LEFT JOIN Generes g ON bg.genere_id = g.ID
        WHERE b.book_title LIKE ? OR a.author_name LIKE ? OR a.author_lastname LIKE ?
        ORDER BY b.book_create_date DESC
        LIMIT 50
    `;
    const searchParam = `%${query}%`;

    db.all(sql, [searchParam, searchParam, searchParam], (err, rows) => {
        if (err) return res.status(500).send(err.message);
        const entries = rows.map(book => bookToEntry(req, book));
        const feed = createFeed(req, `Search results for "${query}"`, 'urn:opds:search', entries);
        res.type('application/atom+xml');
        res.send(builder.buildObject(feed));
    });
});

// 10. Download (Stream File) - Handles OPDS authentication for the file
router.get('/download/:id', (req, res) => {
    const bookId = req.params.id;
    
    // Check permission logic here if stricter access is needed, 
    // relying on opdsAuth middleware which strictly requires authentication
    // Note: opdsAuth is applied in index.js to the whole /opds router

    db.get("SELECT book_filename FROM Books WHERE ID = ?", [bookId], (err, book) => {
        if (err) return res.status(500).send(err.message);
        if (!book || !book.book_filename) return res.status(404).send('Book or file not found');
        
        const booksDir = path.join(__dirname, '../books'); // Adjust path as needed
        const filePath = path.join(booksDir, book.book_filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File missing from disk');
        }

        res.download(filePath, book.book_filename);
    });
});

module.exports = router;
