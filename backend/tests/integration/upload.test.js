const request = require('supertest');
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

describe('Upload Endpoint Integration', () => {
    let token;
    const dummyFilePath = path.join(__dirname, 'test_upload.epub');

    beforeAll(async () => {
        await setupTestDb();
        
        // Create dummy file
        fs.writeFileSync(dummyFilePath, 'dummy content');
        
        // Login to get token
        const res = await request(app)
            .post('/login')
            .send({
                username: 'admin',
                password: 'adminpassword' 
            });
        token = res.body.token;
        if (!token) console.error("Login failed used for upload test", res.body);
    });

    afterAll((done) => {
        if (fs.existsSync(dummyFilePath)) {
            fs.unlinkSync(dummyFilePath);
        }
        db.close(done);
    });

    test('POST /api/books/upload should upload file using express-fileupload', async () => {
        const res = await request(app)
            .post('/api/books/upload')
            .set('Authorization', `Bearer ${token}`)
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
            .set('Authorization', `Bearer ${token}`)
            .attach('book', dummyTxtPath);

        fs.unlinkSync(dummyTxtPath);

        expect(res.statusCode).toEqual(400);
        expect(res.body.error).toContain('Invalid file type');
    });
});
