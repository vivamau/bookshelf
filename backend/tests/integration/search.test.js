const request = require('supertest');
const app = require('../../index');
const { setupTestDb, db } = require('../setup');

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

describe('Search endpoints', () => {
    let authCookie;
    let languageId;
    let bookId;

    beforeAll(async () => {
        await setupTestDb();

        const format = await run('INSERT INTO Formats (format_name) VALUES (?)', ['PDF']);
        const epubFormat = await run('INSERT INTO Formats (format_name) VALUES (?)', ['EPUB']);
        const language = await run('INSERT INTO Languages (language_name) VALUES (?)', ['EN']);
        languageId = language.lastID;
        const publisher = await run('INSERT INTO Publishers (publisher_name) VALUES (?)', ['Open Shelf Press']);
        const author = await run(
            'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)',
            ['Ethan', 'Lang']
        );
        const genre = await run('INSERT INTO Generes (genere_title) VALUES (?)', ['Artificial Intelligence']);
        const book = await run(`
            INSERT INTO Books (
                book_title, book_summary, book_filename, book_date, book_create_date,
                book_format_id, language_id, book_publisher_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            'Build_Your_Own_AI_Assistant',
            'A practical guide to local models and open source tools.',
            'opaque-upload-001.pdf',
            '2025-01-01',
            Date.now(),
            format.lastID,
            language.lastID,
            publisher.lastID
        ]);
        bookId = book.lastID;
        await run(`
            INSERT INTO Books (book_title, book_filename, book_date, book_create_date, book_format_id, language_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            'Open Source Tools Handbook',
            'open-source-tools.epub',
            '2024-01-01',
            Date.now() - 1000,
            epubFormat.lastID,
            language.lastID
        ]);
        await run('INSERT INTO BooksAuthors (book_id, author_id) VALUES (?, ?)', [bookId, author.lastID]);
        await run('INSERT INTO BooksGeneres (book_id, genere_id) VALUES (?, ?)', [bookId, genre.lastID]);

        const loginResponse = await request(app)
            .post('/login')
            .send({ username: 'reader1', password: 'readerpassword' });
        authCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
    });

    afterAll((done) => {
        db.close(done);
    });

    test('autocomplete finds a newly inserted underscored title using normal spaces', async () => {
        const response = await request(app)
            .get('/api/search')
            .query({ q: 'Build Your Own' })
            .set('Cookie', authCookie);

        expect(response.statusCode).toBe(200);
        expect(response.body.data.books.map((book) => book.ID)).toContain(bookId);
    });

    test('full search combines FTS relevance with deterministic filters and facets', async () => {
        const response = await request(app)
            .get('/api/search/books')
            .query({ q: 'open source tools', format: 'PDF', language: languageId, yearFrom: 2020 })
            .set('Cookie', authCookie);

        expect(response.statusCode).toBe(200);
        expect(response.body.total).toBe(1);
        expect(response.body.data[0]).toEqual(expect.objectContaining({
            ID: bookId,
            authors: 'Ethan Lang',
            format_name: 'PDF',
            publication_year: 2025
        }));
        expect(response.body.facets.formats).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'PDF', count: 1 }),
            expect.objectContaining({ label: 'EPUB', count: 1 })
        ]));
    });

    test('database triggers refresh the index after metadata updates', async () => {
        await run('UPDATE Books SET book_title = ? WHERE ID = ?', ['A Completely Revised Title', bookId]);

        const oldResponse = await request(app)
            .get('/api/search/books')
            .query({ q: 'Build Your Own' })
            .set('Cookie', authCookie);
        const newResponse = await request(app)
            .get('/api/search/books')
            .query({ q: 'Completely Revised' })
            .set('Cookie', authCookie);

        expect(oldResponse.body.total).toBe(0);
        expect(newResponse.body.data.map((book) => book.ID)).toContain(bookId);
    });
});
