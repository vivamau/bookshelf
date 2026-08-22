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
jest.mock('../../utils/remoteImage', () => {
    const actual = jest.requireActual('../../utils/remoteImage');
    return { ...actual, downloadRemoteImage: jest.fn() };
});

const app = require('../../index');
const { downloadRemoteImage } = require('../../utils/remoteImage');

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
    const managedAudiobookCoverPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'Disc 1', 'bookshelf-cover.png');
    const uploadedAudiobookMetadataPath = path.join(__dirname, '..', '..', 'audiobooks', 'Test Collection', 'Disc 1', '.bookshelf-metadata.json');
    const archiveCollectionPath = path.join(__dirname, '..', '..', 'audiobooks', 'Archive Collection');
    const rootAudiobookPath = path.join(__dirname, '..', '..', 'audiobooks', 'Standalone Audiobook.m4b');
    const secondRootAudiobookPath = path.join(__dirname, '..', '..', 'audiobooks', 'Second Standalone Audiobook.mp3');

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
        if (fs.existsSync(rootAudiobookPath)) {
            fs.unlinkSync(rootAudiobookPath);
        }
        if (fs.existsSync(secondRootAudiobookPath)) {
            fs.unlinkSync(secondRootAudiobookPath);
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

    test('POST /api/audiobooks/upload/check-duplicates identifies files already on the server', async () => {
        const res = await request(app)
            .post('/api/audiobooks/upload/check-duplicates')
            .set('Cookie', authCookie)
            .send({
                files: [
                    {
                        relativePath: 'Test Collection/Disc 1/sample-track.mp3',
                        size: fs.statSync(uploadedAudiobookPath).size
                    },
                    {
                        relativePath: 'Test Collection/Disc 1/new-track.mp3',
                        size: 123
                    }
                ]
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toEqual([{
            relativePath: 'Test Collection/Disc 1/sample-track.mp3',
            status: 'duplicate'
        }]);
    });

    test('POST /api/audiobooks/upload refuses to overwrite an existing file', async () => {
        const originalContent = fs.readFileSync(uploadedAudiobookPath, 'utf8');
        const res = await request(app)
            .post('/api/audiobooks/upload')
            .set('Cookie', authCookie)
            .field('relativePath', 'Test Collection/Disc 1/sample-track.mp3')
            .attach('audiobook', dummyAudiobookPath);

        expect(res.statusCode).toBe(409);
        expect(res.body.duplicate).toBe(true);
        expect(fs.readFileSync(uploadedAudiobookPath, 'utf8')).toBe(originalContent);
    });

    test('POST and GET /api/audiobooks/progress retain a user chapter and timestamp', async () => {
        const saveResponse = await request(app)
            .post('/api/audiobooks/progress')
            .set('Cookie', authCookie)
            .send({
                folder: 'Archive Collection',
                trackPath: 'Archive Collection/02.mp3',
                trackIndex: 1,
                positionSeconds: 30,
                durationSeconds: 60
            });

        expect(saveResponse.statusCode).toBe(200);
        expect(saveResponse.body.data).toMatchObject({
            track_path: 'Archive Collection/02.mp3',
            track_index: 1,
            position_seconds: 30,
            progress_percentage: 75
        });

        const loadResponse = await request(app)
            .get('/api/audiobooks/progress')
            .query({ folder: 'Archive Collection' })
            .set('Cookie', authCookie);

        expect(loadResponse.statusCode).toBe(200);
        expect(loadResponse.body.data).toMatchObject({
            track_path: 'Archive Collection/02.mp3',
            track_index: 1,
            position_seconds: 30,
            progress_percentage: 75
        });
    });

    test('GET /api/audiobooks/progress keeps listening positions separate per user', async () => {
        const res = await request(app)
            .get('/api/audiobooks/progress')
            .query({ folder: 'Archive Collection' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({
            track_path: 'Archive Collection/01.mp3',
            track_index: 0,
            position_seconds: 0,
            progress_percentage: 0
        });
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

    test('GET /api/audiobooks/details accepts an audiobooks-prefixed folder', async () => {
        const res = await request(app)
            .get('/api/audiobooks/details')
            .query({ folder: 'audiobooks/Test Collection/Disc 1' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({
            folder: 'Test Collection/Disc 1',
            title: 'Disc 1',
            trackCount: 1
        });
    });

    test('POST /api/audiobooks/cover-from-url lets librarians add a managed cover', async () => {
        downloadRemoteImage.mockResolvedValueOnce({
            data: Buffer.from('downloaded cover'),
            extension: 'png',
            contentType: 'image/png'
        });

        const res = await request(app)
            .post('/api/audiobooks/cover-from-url')
            .set('Cookie', authCookie)
            .send({
                folder: 'Test Collection/Disc 1',
                coverUrl: 'https://covers.example/audiobook.png'
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.coverPath).toBe('Test Collection/Disc 1/bookshelf-cover.png');
        expect(fs.readFileSync(managedAudiobookCoverPath, 'utf8')).toBe('downloaded cover');
        expect(downloadRemoteImage).toHaveBeenCalledWith('https://covers.example/audiobook.png');
    });

    test('POST /api/audiobooks/cover-from-url rejects guest accounts', async () => {
        const res = await request(app)
            .post('/api/audiobooks/cover-from-url')
            .set('Cookie', guestCookie)
            .send({
                folder: 'Test Collection/Disc 1',
                coverUrl: 'https://covers.example/unauthorized.png'
            });

        expect(res.statusCode).toBe(403);
    });

    test('GET /api/audiobooks/cover serves a protected collection cover', async () => {
        const res = await request(app)
            .get('/api/audiobooks/cover')
            .query({ path: 'Test Collection/Disc 1/bookshelf-cover.png' })
            .set('Cookie', guestCookie);

        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBe('private, max-age=3600');
        expect(res.body.toString()).toBe('downloaded cover');
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

    test('GET /api/audiobooks/audio serves M4B ranges as MP4 audio', async () => {
        const res = await request(app)
            .get('/api/audiobooks/audio')
            .query({ path: 'Test Collection/complete-book.m4b' })
            .set('Cookie', guestCookie)
            .set('Range', 'bytes=0-3');

        expect(res.statusCode).toBe(206);
        expect(res.headers['content-type']).toMatch(/^audio\/mp4/);
        expect(res.headers['accept-ranges']).toBe('bytes');
        expect(res.body.toString()).toBe('dumm');
    });

    test('GET /api/audiobooks/audio serves Safari M4B ranges with Apple\'s MIME type', async () => {
        const res = await request(app)
            .get('/api/audiobooks/audio')
            .query({ path: 'Test Collection/complete-book.m4b' })
            .set('Cookie', guestCookie)
            .set('User-Agent', 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15')
            .set('Range', 'bytes=0-3');

        expect(res.statusCode).toBe(206);
        expect(res.headers['content-type']).toMatch(/^audio\/x-m4b/);
        expect(res.headers.vary).toContain('User-Agent');
        expect(res.headers['accept-ranges']).toBe('bytes');
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
            authors: [expect.objectContaining({
                author_name: 'Test',
                author_lastname: 'Author'
            })],
            narrator: 'Test Narrator',
            language: 'English',
            publishedYear: 2026,
            description: 'An integration-test collection.'
        });
        expect(res.body.data).not.toHaveProperty('author');
        expect(JSON.parse(fs.readFileSync(uploadedAudiobookMetadataPath, 'utf8')).title)
            .toBe('The Test Audiobook');

        const guestDetails = await request(app)
            .get('/api/audiobooks/details')
            .query({ folder: 'Test Collection/Disc 1' })
            .set('Cookie', guestCookie);
        expect(guestDetails.body.data.title).toBe('The Test Audiobook');
        expect(guestDetails.body.data.authors).toEqual([
            expect.objectContaining({ author_name: 'Test', author_lastname: 'Author' })
        ]);
        expect(guestDetails.body.data).not.toHaveProperty('author');
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

    test('DELETE /api/audiobooks refuses to delete grouped root-level files', async () => {
        fs.writeFileSync(rootAudiobookPath, 'first standalone audio');
        fs.writeFileSync(secondRootAudiobookPath, 'second standalone audio');

        const res = await request(app)
            .delete('/api/audiobooks')
            .query({ folder: '.' })
            .set('Cookie', authCookie);

        expect(res.statusCode).toBe(400);
        expect(fs.existsSync(rootAudiobookPath)).toBe(true);
        expect(fs.existsSync(secondRootAudiobookPath)).toBe(true);
        expect(fs.existsSync(uploadedAudiobookPath)).toBe(true);

        fs.unlinkSync(rootAudiobookPath);
        fs.unlinkSync(secondRootAudiobookPath);
    });

    test('DELETE /api/audiobooks removes only a standalone root-level file', async () => {
        fs.writeFileSync(rootAudiobookPath, 'standalone audio');

        const res = await request(app)
            .delete('/api/audiobooks')
            .query({ folder: '.' })
            .set('Cookie', authCookie);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Audiobook deleted');
        expect(fs.existsSync(rootAudiobookPath)).toBe(false);
        expect(fs.existsSync(uploadedAudiobookPath)).toBe(true);
        expect(fs.existsSync(path.join(__dirname, '..', '..', 'audiobooks'))).toBe(true);
    });

    test('GET /api/audiobooks requires authentication', async () => {
        const res = await request(app).get('/api/audiobooks');

        expect(res.statusCode).toBe(403);
    });
});
