const request = require('supertest');
const jwt = require('jsonwebtoken');
const { setupTestDb, db } = require('../setup');
const path = require('path');
const fs = require('fs');

// Mock specific utility BEFORE requiring app to ensure it's replaced
jest.mock('../../utils/libraryScanner', () => ({
    scanSingleFile: jest.fn().mockResolvedValue({ isNew: true, bookId: 999 }),
    scanLibrary: jest.fn(),
    refreshCovers: jest.fn(),
    importFiles: jest.fn()
}));

const app = require('../../index');

jest.setTimeout(30000);

const binaryParser = (response, callback) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Upload Endpoint Integration', () => {
    let authCookie;
    let guestCookie;
    let manageBooksOnlyCookie;
    const dummyFilePath = path.join(__dirname, 'test_upload.epub');
    const uploadedFilePath = path.join(__dirname, '..', '..', 'books', 'test_upload.epub');
    const dummyAudiobookPath = path.join(__dirname, 'sample-track.mp3');
    const dummyM4bPath = path.join(__dirname, 'complete-book.m4b');
    const dummyLargeM4bPath = path.join(__dirname, 'large-complete-book.m4b');
    const uploadedAudiobookPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'Disc 1', 'sample-track.mp3');
    const uploadedM4bPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'complete-book.m4b');
    const uploadedLargeM4bPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'large-complete-book.m4b');
    const uploadedAudiobookCoverPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'Disc 1', 'cover.jpg');
    const uploadedAudiobookMetadataPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'Disc 1', '.bookshelf-metadata.json');
    const archiveCollectionPath = path.join(__dirname, '..', '..', 'audiobooks', 'Archive Collection');

    beforeAll(async () => {
        await setupTestDb();
        
        // Create dummy file
        fs.writeFileSync(dummyFilePath, 'dummy content');
        fs.writeFileSync(dummyAudiobookPath, 'dummy audio content');
        fs.writeFileSync(dummyM4bPath, 'dummy m4b content');
        fs.mkdirSync(archiveCollectionPath, { recursive: true });
        fs.writeFileSync(path.join(archiveCollectionPath, '01.mp3'), 'first track');
        fs.writeFileSync(path.join(archiveCollectionPath, '02.mp3'), 'second track');
        
        // Login to get token
        const res = await request(app)
            .post('/login')
            .send({
                username: 'admin',
                password: 'adminpassword' 
            });
        authCookie = res.headers['set-cookie'][0].split(';')[0];

        const guestResponse = await request(app)
            .post('/login')
            .send({
                username: 'guest1',
                password: 'guestpassword'
            });
        guestCookie = guestResponse.headers['set-cookie'][0].split(';')[0];

        const manageBooksOnlyToken = jwt.sign(
            {
                user_id: 999,
                username: 'book-manager',
                userrole_manageusers: 0,
                userrole_managebooks: 1,
                userrole_readbooks: 1,
                userrole_viewbooks: 1
            },
            process.env.TOKEN_KEY || 'default_secret_key',
            { expiresIn: '2h' }
        );
        manageBooksOnlyCookie = `token=${manageBooksOnlyToken}`;
    });

    afterAll((done) => {
        if (fs.existsSync(dummyFilePath)) {
            fs.unlinkSync(dummyFilePath);
        }
        if (fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath);
        }
        if (fs.existsSync(dummyAudiobookPath)) {
            fs.unlinkSync(dummyAudiobookPath);
        }
        if (fs.existsSync(dummyM4bPath)) {
            fs.unlinkSync(dummyM4bPath);
        }
        if (fs.existsSync(dummyLargeM4bPath)) {
            fs.unlinkSync(dummyLargeM4bPath);
        }
        if (fs.existsSync(uploadedAudiobookPath)) {
            fs.rmSync(path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection'), { recursive: true, force: true });
        }
        if (fs.existsSync(archiveCollectionPath)) {
            fs.rmSync(archiveCollectionPath, { recursive: true, force: true });
        }
        db.close(done);
    });

    test('POST /api/books/upload should upload file using express-fileupload', async () => {
        const res = await request(app)
            .post('/api/books/upload')
            .set('Cookie', authCookie)
            .attach('book', dummyFilePath); // This uses multipart/form-data

        if (res.statusCode !== 201) {
            console.error('Upload test failed:', res.body);
        }
        
        expect(res.statusCode).toEqual(201);
        expect(res.body.message).toMatch(/Book uploaded/);
        expect(res.body.filename).toBe('test_upload.epub');
    });

    test('POST /api/books/upload should fail with invalid file type', async () => {
        const dummyTxtPath = path.join(__dirname, 'test.txt');
        fs.writeFileSync(dummyTxtPath, 'dummy content');

        const res = await request(app)
            .post('/api/books/upload')
            .set('Cookie', authCookie)
            .attach('book', dummyTxtPath);

        fs.unlinkSync(dummyTxtPath);

        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toContain('Invalid file type');
    });

    test('POST /api/audiobooks/upload stores a file under the audiobooks directory', async () => {
        const res = await request(app)
            .post('/api/audiobooks/upload')
            .set('Cookie', authCookie)
            .field('relativePath', 'Test Collection/Disc 1/sample-track.mp3')
            .attach('audiobook', dummyAudiobookPath);

        expect(res.statusCode).toBe(201);
        expect(res.body.path).toBe('Test Collection/Disc 1/sample-track.mp3');
        expect(fs.readFileSync(uploadedAudiobookPath, 'utf8')).toBe('dummy audio content');
    });

    test('POST /api/audiobooks/upload rejects traversal paths', async () => {
        const res = await request(app)
            .post('/api/audiobooks/upload')
            .set('Cookie', authCookie)
            .field('relativePath', '../outside.mp3')
            .attach('audiobook', dummyAudiobookPath);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Invalid audiobook file path');
    });

    test('POST /api/audiobooks/upload stores M4B audiobook files', async () => {
        const res = await request(app)
            .post('/api/audiobooks/upload')
            .set('Cookie', authCookie)
            .field('relativePath', 'Test Collection/complete-book.m4b')
            .attach('audiobook', dummyM4bPath);

        expect(res.statusCode).toBe(201);
        expect(res.body.path).toBe('Test Collection/complete-book.m4b');
        expect(fs.readFileSync(uploadedM4bPath, 'utf8')).toBe('dummy m4b content');
    });

    test('POST /api/audiobooks/upload accepts M4B files larger than the previous 100 MB limit', async () => {
        const fileSize = 101 * 1024 * 1024;
        fs.writeFileSync(dummyLargeM4bPath, 'm4b');
        fs.truncateSync(dummyLargeM4bPath, fileSize);

        const res = await request(app)
            .post('/api/audiobooks/upload')
            .set('Cookie', authCookie)
            .field('relativePath', 'Test Collection/large-complete-book.m4b')
            .attach('audiobook', dummyLargeM4bPath);

        expect(res.statusCode).toBe(201);
        expect(fs.statSync(uploadedLargeM4bPath).size).toBe(fileSize);
    });

    test('GET /api/audiobooks lists server collections for guest accounts', async () => {
        fs.writeFileSync(uploadedAudiobookCoverPath, 'fake cover');

        const res = await request(app)
            .get('/api/audiobooks')
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        const collection = res.body.data.find((audiobook) => audiobook.folder === 'Test Collection/Disc 1');
        expect(collection).toMatchObject({
            title: 'Disc 1',
            trackCount: 1,
            formats: ['MP3'],
            coverPath: 'Test Collection/Disc 1/cover.jpg'
        });
        expect(collection.tracks[0].title).toBe('sample-track');
    });

    test('GET /api/audiobooks/details returns one collection for guest accounts', async () => {
        const res = await request(app)
            .get('/api/audiobooks/details')
            .query({ folder: 'Test Collection/Disc 1' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({
            folder: 'Test Collection/Disc 1',
            title: 'Disc 1',
            trackCount: 1
        });
    });

    test('GET /api/audiobooks/cover serves a protected collection cover', async () => {
        const res = await request(app)
            .get('/api/audiobooks/cover')
            .query({ path: 'Test Collection/Disc 1/cover.jpg' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBe('private, max-age=3600');
        expect(res.body.toString()).toBe('fake cover');
    });

    test('GET /api/audiobooks/audio streams protected tracks with range support', async () => {
        const res = await request(app)
            .get('/api/audiobooks/audio')
            .query({ path: 'Test Collection/Disc 1/sample-track.mp3' })
            .set('Cookie', guestCookie)
            .set('Range', 'bytes=0-4');

        expect(res.statusCode).toBe(206);
        expect(res.headers['content-range']).toMatch(/^bytes 0-4\//);
        expect(res.body.toString()).toBe('dummy');
    });

    test('PUT /api/audiobooks/metadata lets librarians edit collection metadata', async () => {
        const res = await request(app)
            .put('/api/audiobooks/metadata')
            .set('Cookie', authCookie)
            .send({
                folder: 'Test Collection/Disc 1',
                metadata: {
                    title: 'The Test Audiobook',
                    author: 'Test Author',
                    narrator: 'Test Narrator',
                    language: 'English',
                    publishedYear: 2026,
                    description: 'An integration-test collection.'
                }
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({
            title: 'The Test Audiobook',
            author: 'Test Author',
            narrator: 'Test Narrator',
            language: 'English',
            publishedYear: 2026,
            description: 'An integration-test collection.'
        });
        expect(JSON.parse(fs.readFileSync(uploadedAudiobookMetadataPath, 'utf8')).title)
            .toBe('The Test Audiobook');

        const guestDetails = await request(app)
            .get('/api/audiobooks/details')
            .query({ folder: 'Test Collection/Disc 1' })
            .set('Cookie', guestCookie);
        expect(guestDetails.body.data.title).toBe('The Test Audiobook');
        expect(guestDetails.body.data.author).toBe('Test Author');
    });

    test('PUT /api/audiobooks/metadata rejects guest accounts', async () => {
        const res = await request(app)
            .put('/api/audiobooks/metadata')
            .set('Cookie', guestCookie)
            .send({
                folder: 'Test Collection/Disc 1',
                metadata: { title: 'Unauthorized title' }
            });

        expect(res.statusCode).toBe(403);
    });

    test('GET /api/audiobooks/download downloads a single-track audiobook directly', async () => {
        const res = await request(app)
            .get('/api/audiobooks/download')
            .query({ folder: 'Test Collection/Disc 1' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toContain('The Test Audiobook.mp3');
        expect(res.body.toString()).toBe('dummy audio content');
    });

    test('GET /api/audiobooks/download streams multi-track collections as a tar archive', async () => {
        const res = await request(app)
            .get('/api/audiobooks/download')
            .query({ folder: 'Archive Collection' })
            .set('Cookie', guestCookie)
            .buffer(true)
            .parse(binaryParser);

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('application/x-tar');
        expect(res.headers['content-disposition']).toContain('Archive Collection.tar');
        expect(res.body.length).toBeGreaterThan(20);
    });

    test('DELETE /api/audiobooks rejects guest accounts', async () => {
        const res = await request(app)
            .delete('/api/audiobooks')
            .query({ folder: 'Archive Collection' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(403);
        expect(fs.existsSync(archiveCollectionPath)).toBe(true);
    });

    test('DELETE /api/audiobooks rejects book managers who are not librarians', async () => {
        const res = await request(app)
            .delete('/api/audiobooks')
            .query({ folder: 'Archive Collection' })
            .set('Cookie', manageBooksOnlyCookie);

        expect(res.statusCode).toBe(403);
        expect(fs.existsSync(archiveCollectionPath)).toBe(true);
    });

    test('DELETE /api/audiobooks removes a collection for librarians', async () => {
        const res = await request(app)
            .delete('/api/audiobooks')
            .query({ folder: 'Archive Collection' })
            .set('Cookie', authCookie);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Audiobook deleted');
        expect(fs.existsSync(archiveCollectionPath)).toBe(false);
    });

    test('GET /api/audiobooks requires authentication', async () => {
        const res = await request(app).get('/api/audiobooks');

        expect(res.statusCode).toBe(403);
    });
});
