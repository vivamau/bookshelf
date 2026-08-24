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
    const metadataPath = path.join(audiobookDirectory, '.bookshelf-metadata.json');
    const noCoverFolderName = 'SoundLeaf No Cover';
    const noCoverDirectory = path.join(__dirname, '..', '..', 'audiobooks', noCoverFolderName);
    const noCoverAudioPath = path.join(noCoverDirectory, '01 - No Cover.mp3');
    let accessToken;
    let itemId;

    beforeAll(async () => {
        await setupTestDb();
        fs.mkdirSync(audiobookDirectory, { recursive: true });
        fs.writeFileSync(audioPath, 'soundleaf audio');
        fs.writeFileSync(coverPath, 'soundleaf cover');
        fs.writeFileSync(metadataPath, JSON.stringify({
            title: folderName,
            author: 'Sound Leaf Author',
            series: 'SoundLeaf Saga',
            seriesSequence: '1'
        }));
        fs.mkdirSync(noCoverDirectory, { recursive: true });
        fs.writeFileSync(noCoverAudioPath, 'soundleaf audio without cover');

        const login = await request(app)
            .post('/login')
            .set('X-Return-Tokens', 'true')
            .send({ username: 'admin', password: 'adminpassword' });
        accessToken = login.body.accessToken;
    });

    afterAll((done) => {
        fs.rmSync(audiobookDirectory, { recursive: true, force: true });
        fs.rmSync(noCoverDirectory, { recursive: true, force: true });
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
        expect(status.headers['cache-control']).toBe('no-store');

        const conditionalStatus = await request(app)
            .get('/status')
            .set('If-None-Match', status.headers.etag);
        expect(conditionalStatus.statusCode).toBe(200);

        const ping = await request(app)
            .get('/ping')
            .set('If-None-Match', 'W/"cached-soundleaf-ping"');
        expect(ping.statusCode).toBe(200);
        expect(ping.body).toEqual({ success: true });

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

        const me = await request(app)
            .get('/api/me')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(me.statusCode).toBe(200);
        expect(me.body).toMatchObject({
            id: expect.any(String),
            isOldToken: false
        });

        const listeningStats = await request(app)
            .get('/api/me/listening-stats')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(listeningStats.statusCode).toBe(200);
        expect(listeningStats.body).toEqual({
            totalTime: 0,
            items: {},
            days: {},
            dayOfWeek: {},
            today: 0,
            recentSessions: []
        });
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
            oldLibraryItemId: null,
            mediaType: 'book',
            media: {
                id: expect.any(String),
                numTracks: 1,
                metadata: { abridged: false },
                coverPath: expect.stringMatching(/^\/api\/items\/.+\/cover$/)
            }
        });
        expect(item).not.toHaveProperty('libraryFiles');
        itemId = item.id;

        const authors = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/authors')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(authors.statusCode).toBe(200);
        const author = authors.body.authors.find(({ name }) => name === 'Sound Leaf Author');
        expect(author).toMatchObject({
            id: expect.stringMatching(/^aut_/),
            libraryId: 'lib_bookshelf_audiobooks',
            numBooks: 1,
            lastFirst: 'Author, Sound Leaf'
        });

        const seriesResponse = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/series')
            .query({ limit: 50, page: 0, sort: 'name' })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(seriesResponse.statusCode).toBe(200);
        const series = seriesResponse.body.results.find(({ name }) => name === 'SoundLeaf Saga');
        expect(series).toMatchObject({
            id: expect.stringMatching(/^ser_/),
            libraryId: 'lib_bookshelf_audiobooks',
            books: [expect.objectContaining({ id: itemId })]
        });

        const seriesDetails = await request(app)
            .get(`/api/series/${series.id}`)
            .set('Authorization', `Bearer ${accessToken}`);
        expect(seriesDetails.statusCode).toBe(200);
        expect(seriesDetails.body).toMatchObject({ id: series.id, name: 'SoundLeaf Saga' });

        const authorDetails = await request(app)
            .get(`/api/authors/${author.id}`)
            .query({ include: 'items,series' })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(authorDetails.statusCode).toBe(200);
        expect(authorDetails.body).toMatchObject({
            id: author.id,
            libraryItems: [expect.objectContaining({ id: itemId })],
            series: [expect.objectContaining({ id: series.id })]
        });

        const authorFilter = Buffer.from(author.id).toString('base64');
        const authorItems = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/items')
            .query({ filter: `authors.${authorFilter}` })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(authorItems.statusCode).toBe(200);
        expect(authorItems.body).toMatchObject({
            total: 1,
            results: [expect.objectContaining({ id: itemId })]
        });

        const filterData = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/filterdata')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(filterData.statusCode).toBe(200);
        expect(filterData.body.authors).toContainEqual({ id: author.id, name: author.name });
        expect(filterData.body.series).toContainEqual({ id: series.id, name: series.name });

        const seriesFilter = Buffer.from(series.id).toString('base64');
        const seriesItems = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/items')
            .query({ filter: `series.${seriesFilter}` })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(seriesItems.statusCode).toBe(200);
        expect(seriesItems.body).toMatchObject({
            total: 1,
            results: [expect.objectContaining({ id: itemId })]
        });

        const itemWithoutPhysicalCover = items.body.results.find((candidate) => (
            candidate.media.metadata.title === noCoverFolderName
        ));
        expect(itemWithoutPhysicalCover.media.coverPath).toMatch(/^\/api\/items\/.+\/cover$/);
        const fallbackCover = await request(app)
            .get(itemWithoutPhysicalCover.media.coverPath)
            .set('Authorization', `Bearer ${accessToken}`)
            .buffer(true)
            .parse(binaryParser);
        expect(fallbackCover.statusCode).toBe(200);
        expect(fallbackCover.headers['content-type']).toMatch(/^image\/png/);
        expect(fallbackCover.body.subarray(0, 8)).toEqual(Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
        ]));

        const expanded = await request(app)
            .get(`/api/items/${itemId}`)
            .query({ expanded: 1, include: 'progress' })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(expanded.statusCode).toBe(200);
        expect(expanded.body.media.tracks[0]).toMatchObject({
            contentUrl: `/api/items/${itemId}/file/0`,
            mimeType: 'audio/mpeg'
        });

        const stats = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/stats')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(stats.statusCode).toBe(200);
        expect(stats.body).toMatchObject({
            totalItems: expect.any(Number),
            totalSize: expect.any(Number),
            totalDuration: expect.any(Number),
            numAudioTracks: expect.any(Number),
            largestItems: expect.any(Array),
            longestItems: expect.any(Array),
            authorsWithCount: expect.any(Array),
            genresWithCount: expect.any(Array)
        });

        const personalized = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/personalized')
            .query({ include: 'rssfeed,numEpisodesIncomplete' })
            .set('Authorization', `Bearer ${accessToken}`);
        expect(personalized.statusCode).toBe(200);
        expect(personalized.headers['cache-control']).toBe('no-store');
        expect(personalized.body).toEqual(expect.arrayContaining([
            expect.objectContaining({ total: expect.any(Number) })
        ]));

        const conditionalPersonalized = await request(app)
            .get('/api/libraries/lib_bookshelf_audiobooks/personalized')
            .query({ include: 'rssfeed,numEpisodesIncomplete' })
            .set('Authorization', `Bearer ${accessToken}`)
            .set('If-None-Match', personalized.headers.etag);
        expect(conditionalPersonalized.statusCode).toBe(200);
        expect(conditionalPersonalized.body).toEqual(expect.any(Array));

        const batch = await request(app)
            .post('/api/items/batch/get')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ libraryItemIds: [itemId] });
        expect(batch.statusCode).toBe(200);
        expect(batch.body.libraryItems).toEqual([
            expect.objectContaining({
                id: itemId,
                media: expect.objectContaining({
                    id: expect.any(String),
                    tracks: expect.any(Array),
                    audioFiles: expect.any(Array),
                    numTracks: expect.any(Number),
                    numAudioFiles: expect.any(Number),
                    numChapters: expect.any(Number)
                }),
                libraryFiles: expect.any(Array)
            })
        ]);
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
