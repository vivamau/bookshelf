const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../index');
const { setupTestDb, db } = require('../setup');

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

describe('shared book and audiobook authors', () => {
    const folder = `author-endpoint-${process.pid}`;
    const audiobookDirectory = path.resolve(__dirname, '../../audiobooks', folder);
    let adminCookie;
    let originalAuthorId;
    let replacementAuthorId;

    beforeAll(async () => {
        await setupTestDb();
        const originalAuthor = await run(
            'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)',
            ['N. K.', 'Jemisin']
        );
        const replacementAuthor = await run(
            'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)',
            ['Octavia E.', 'Butler']
        );
        originalAuthorId = originalAuthor.lastID;
        replacementAuthorId = replacementAuthor.lastID;

        await fs.promises.mkdir(audiobookDirectory, { recursive: true });
        await fs.promises.writeFile(path.join(audiobookDirectory, 'Chapter 01.mp3'), 'test audio');
        await fs.promises.writeFile(
            path.join(audiobookDirectory, '.bookshelf-metadata.json'),
            JSON.stringify({ title: 'The Fifth Season', author: 'N. K. Jemisin' })
        );

        const loginResponse = await request(app)
            .post('/login')
            .send({ username: 'admin', password: 'adminpassword' });
        adminCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
    });

    afterAll(async () => {
        await fs.promises.rm(audiobookDirectory, { recursive: true, force: true });
        await new Promise((resolve, reject) => {
            db.close((error) => (error ? reject(error) : resolve()));
        });
    });

    test('returns an audiobook on the matching author page using the existing Authors row', async () => {
        const response = await request(app)
            .get(`/api/authors/${originalAuthorId}/audiobooks`)
            .set('Cookie', adminCookie);

        expect(response.statusCode).toBe(200);
        expect(response.body.data).toEqual([
            expect.objectContaining({
                folder,
                title: 'The Fifth Season',
                author: 'N. K. Jemisin',
                authors: [expect.objectContaining({ ID: originalAuthorId })]
            })
        ]);
    });

    test('metadata updates reassign the audiobook through author IDs', async () => {
        const updateResponse = await request(app)
            .put('/api/audiobooks/metadata')
            .set('Cookie', adminCookie)
            .send({
                folder,
                metadata: {
                    title: 'The Fifth Season',
                    narrator: 'Robin Miles',
                    authorIds: [replacementAuthorId]
                }
            });

        expect(updateResponse.statusCode).toBe(200);
        expect(updateResponse.body.data.authors).toEqual([
            expect.objectContaining({ ID: replacementAuthorId, author_lastname: 'Butler' })
        ]);

        const previousAuthorResponse = await request(app)
            .get(`/api/authors/${originalAuthorId}/audiobooks`)
            .set('Cookie', adminCookie);
        const replacementAuthorResponse = await request(app)
            .get(`/api/authors/${replacementAuthorId}/audiobooks`)
            .set('Cookie', adminCookie);

        expect(previousAuthorResponse.body.data).toEqual([]);
        expect(replacementAuthorResponse.body.data.map((item) => item.folder)).toContain(folder);
    });
});
