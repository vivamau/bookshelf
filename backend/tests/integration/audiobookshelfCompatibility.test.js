const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestDb, db } = require('../setup');
const app = require('../../index');

jest.setTimeout(30000);

const binaryParser = (response, callback) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Audiobookshelf client compatibility', () => {
    const folderName = 'SoundLeaf Compatibility';
    const audiobookDirectory = path.join(__dirname, '..', '..', 'audiobooks', folderName);
    const audioPath = path.join(audiobookDirectory, '01 - Connection Test.mp3');
    const coverPath = path.join(audiobookDirectory, 'cover.jpg');
    let accessToken;
    let itemId;

    beforeAll(async () => {
        await setupTestDb();
        fs.mkdirSync(audiobookDirectory, { recursive: true });
        fs.writeFileSync(audioPath, 'soundleaf audio');
        fs.writeFileSync(coverPath, 'soundleaf cover');

        const login = await request(app)
            .post('/login')
            .set('X-Return-Tokens', 'true')
            .send({ username: 'admin', password: 'adminpassword' });
        accessToken = login.body.accessToken;
    });

    afterAll((done) => {
        fs.rmSync(audiobookDirectory, { recursive: true, force: true });
        db.close(done);
    });

    test('exposes Audiobookshelf status and login discovery', async () => {
        const status = await request(app).get('/status');
        expect(status.statusCode).toBe(200);
        expect(status.body).toMatchObject({
            app: 'audiobookshelf',
            serverVersion: '2.25.1',
            isInit: true,
            authMethods: ['local']
        });

        const login = await request(app)
            .post('/login')
            .set('X-Return-Tokens', 'true')
            .send({ username: 'admin', password: 'adminpassword' });
        expect(login.statusCode).toBe(200);
        expect(login.body.user).toMatchObject({
            username: 'admin',
            token: expect.any(String),
            accessToken: expect.any(String),
            refreshToken: null
        });
        expect(login.body.user.accessToken).toBe(login.body.user.token);
        expect(login.body.userDefaultLibraryId).toBe('lib_bookshelf_audiobooks');
    });

    test('lists the audiobook library and Audiobookshelf-shaped items', async () => {
        const libraries = await request(app)
            .get('/api/libraries')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(libraries.statusCode).toBe(200);
        expect(libraries.body.libraries[0]).toMatchObject({
            id: 'lib_bookshelf_audiobooks',
            mediaType: 'book'
        });

        const items = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/items')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(items.statusCode).toBe(200);
        const item = items.body.results.find((candidate) => (
            candidate.media.metadata.title === folderName
        ));
        expect(item).toMatchObject({
            mediaType: 'book',
            media: {
                numTracks: 1,
                coverPath: expect.stringMatching(/^\/api\/items\/.+\/cover$/)
            }
        });
        itemId = item.id;

        const expanded = await request(app)
            .get(`/api/items/${itemId}`)
            .query({ expanded: 1, include: 'progress' })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(expanded.statusCode).toBe(200);
        expect(expanded.body.media.tracks[0]).toMatchObject({
            contentUrl: `/api/items/${itemId}/file/0`,
            mimeType: 'audio/mpeg'
        });
    });

    test('starts a direct-play session and streams its protected track', async () => {
        const play = await request(app)
            .post(`/api/items/${itemId}/play`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                mediaPlayer: 'SoundLeaf',
                deviceInfo: { clientName: 'SoundLeaf', clientVersion: '2.1' }
            });
        expect(play.statusCode).toBe(200);
        expect(play.body).toMatchObject({
            id: expect.stringMatching(/^play_/),
            playMethod: 0,
            mediaType: 'book'
        });

        const stream = await request(app)
            .get(play.body.audioTracks[0].contentUrl)
            .set('Range', 'bytes=0-8')
            .buffer(true)
            .parse(binaryParser);
        expect(stream.statusCode).toBe(206);
        expect(stream.headers['accept-ranges']).toBe('bytes');
        expect(stream.body.toString()).toBe('soundleaf');
    });

    test('syncs progress through the Audiobookshelf media-progress API', async () => {
        const update = await request(app)
            .patch(`/api/me/progress/${itemId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ duration: 100, currentTime: 25, progress: 0.25, isFinished: false });
        expect(update.statusCode).toBe(200);
        expect(update.body).toMatchObject({
            libraryItemId: itemId,
            duration: 100,
            currentTime: 25,
            progress: 0.25,
            isFinished: false
        });

        const progress = await request(app)
            .get(`/api/me/progress/${itemId}`)
            .set('Authorization', `Bearer ${accessToken}`);
        expect(progress.statusCode).toBe(200);
        expect(progress.body.progress).toBe(0.25);

        const authorize = await request(app)
            .post('/api/authorize')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(authorize.statusCode).toBe(200);
        expect(authorize.body.user.mediaProgress).toEqual([
            expect.objectContaining({ libraryItemId: itemId, progress: 0.25 })
        ]);
    });
});
