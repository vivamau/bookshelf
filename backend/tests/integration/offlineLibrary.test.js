const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../index');
const { setupTestDb, db } = require('../setup');

const BOOKS_DIRECTORY = path.join(__dirname, '..', '..', 'books');
const AVAILABLE_FILENAME = '__offline_catalog_available__.epub';
const MISSING_FILENAME = '__offline_catalog_missing__.epub';
const AVAILABLE_PATH = path.join(BOOKS_DIRECTORY, AVAILABLE_FILENAME);

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

describe('Offline library endpoints', () => {
    let authCookie;

    beforeAll(async () => {
        await setupTestDb();
        fs.writeFileSync(AVAILABLE_PATH, 'reusable epub data');

        const format = await run(
            'INSERT INTO Formats (format_name, format_create_date) VALUES (?, ?)',
            ['EPUB', Date.now()]
        );
        await run(
            'INSERT INTO Books (book_title, book_filename, book_format_id) VALUES (?, ?, ?)',
            ['Available offline', AVAILABLE_FILENAME, format.lastID]
        );
        await run(
            'INSERT INTO Books (book_title, book_filename, book_format_id) VALUES (?, ?, ?)',
            ['Missing source', MISSING_FILENAME, format.lastID]
        );

        const loginResponse = await request(app)
            .post('/login')
            .send({ username: 'reader1', password: 'readerpassword' });
        authCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
    });

    afterAll((done) => {
        if (fs.existsSync(AVAILABLE_PATH)) fs.unlinkSync(AVAILABLE_PATH);
        db.close(done);
    });

    test('GET /api/books/offline-catalog excludes records whose EPUB file is missing', async () => {
        const response = await request(app)
            .get('/api/books/offline-catalog')
            .set('Cookie', authCookie);

        expect(response.statusCode).toBe(200);
        expect(response.body.data.map((book) => book.book_filename)).toEqual([AVAILABLE_FILENAME]);
    });

    test('GET /api/books/:id/download-file returns a reusable EPUB attachment', async () => {
        const catalogResponse = await request(app)
            .get('/api/books/offline-catalog')
            .set('Cookie', authCookie);
        const bookId = catalogResponse.body.data[0].ID;

        const response = await request(app)
            .get(`/api/books/${bookId}/download-file`)
            .set('Cookie', authCookie);

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-disposition']).toContain(`filename="${AVAILABLE_FILENAME}"`);
    });
});
