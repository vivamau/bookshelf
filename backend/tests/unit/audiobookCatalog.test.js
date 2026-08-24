const path = require('path');
const {
    AudiobookCatalogError,
    METADATA_FILE_NAME,
    createStaleWhileRevalidateLoader,
    enrichAudiobookDurations,
    findAudiobookByFolder,
    getAudiobookContentType,
    probeAudioDuration,
    resolveAudiobookAudioPath,
    resolveAudiobookCoverPath,
    scanAudiobookCatalog,
    sanitizeAudiobookMetadata,
    writeAudiobookMetadata
} = require('../../utils/audiobookCatalog');

const directoryEntry = (name) => ({ name, isDirectory: () => true, isFile: () => false });
const fileEntry = (name) => ({ name, isDirectory: () => false, isFile: () => true });

describe('audiobook catalog', () => {
    test('reads audio duration with ffprobe and safely falls back when it is unavailable', async () => {
        const successfulExec = jest.fn((command, args, options, callback) => callback(null, '123.45\n'));
        const failedExec = jest.fn((command, args, options, callback) => callback(new Error('missing')));

        await expect(probeAudioDuration('/srv/book.mp3', 'duration-success', successfulExec))
            .resolves.toBe(123.45);
        await expect(probeAudioDuration('/srv/missing.mp3', 'duration-failure', failedExec))
            .resolves.toBe(0);
        expect(successfulExec).toHaveBeenCalledWith(
            'ffprobe',
            expect.arrayContaining(['/srv/book.mp3']),
            expect.objectContaining({ timeout: 15000 }),
            expect.any(Function)
        );
    });

    test('enriches scanned tracks with probed durations', async () => {
        const durationProbe = jest.fn(async () => 61.5);
        const catalog = [{
            folder: 'Earthsea',
            tracks: [{ path: 'Earthsea/01.mp3', size: 100, modifiedAt: '2026-08-23T10:00:00Z' }]
        }];

        const enriched = await enrichAudiobookDurations('/srv/audiobooks', catalog, durationProbe);

        expect(enriched[0].tracks[0].duration).toBe(61.5);
        expect(durationProbe).toHaveBeenCalledWith(
            path.join('/srv/audiobooks', 'Earthsea', '01.mp3'),
            expect.stringContaining(':100')
        );
    });

    test('probes multiple track durations concurrently while preserving track order', async () => {
        const pending = [];
        const durationProbe = jest.fn(() => new Promise((resolve) => pending.push(resolve)));
        const catalog = [{
            folder: 'Earthsea',
            tracks: [
                { path: 'Earthsea/01.mp3', size: 100 },
                { path: 'Earthsea/02.mp3', size: 200 }
            ]
        }];

        const resultPromise = enrichAudiobookDurations('/srv/audiobooks', catalog, durationProbe, 2);
        await Promise.resolve();
        expect(durationProbe).toHaveBeenCalledTimes(2);
        pending[1](90);
        pending[0](60);

        const enriched = await resultPromise;
        expect(enriched[0].tracks.map((track) => track.duration)).toEqual([60, 90]);
    });

    test('serves cached catalogs immediately while refreshing stale data in the background', async () => {
        let currentTime = 1000;
        let resolveRefresh;
        const loadFresh = jest.fn()
            .mockResolvedValueOnce(['initial'])
            .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
        const loadCatalog = createStaleWhileRevalidateLoader(loadFresh, {
            maxAgeMs: 100,
            now: () => currentTime
        });

        await expect(loadCatalog()).resolves.toEqual(['initial']);
        currentTime = 1200;
        await expect(loadCatalog()).resolves.toEqual(['initial']);
        await Promise.resolve();
        expect(loadFresh).toHaveBeenCalledTimes(2);
        resolveRefresh(['refreshed']);
        await Promise.resolve();
        await Promise.resolve();
        await expect(loadCatalog()).resolves.toEqual(['refreshed']);

        loadFresh.mockResolvedValueOnce(['forced']);
        await expect(loadCatalog.reload()).resolves.toEqual(['forced']);
        await expect(loadCatalog()).resolves.toEqual(['forced']);
    });

    test('serves M4B files with browser-compatible content types', () => {
        expect(getAudiobookContentType('Collection/Complete Book.m4b')).toBe('audio/mp4');
        expect(getAudiobookContentType('Collection/Complete Book.M4B')).toBe('audio/mp4');
        expect(getAudiobookContentType(
            'Collection/Complete Book.m4b',
            'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'
        )).toBe('audio/x-m4b');
        expect(getAudiobookContentType(
            'Collection/Complete Book.m4b',
            'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'
        )).toBe('audio/mp4');
    });

    test('accepts an audiobooks prefix while preferring exact folder matches', () => {
        const catalog = [
            { folder: 'David Foster Wallace - Essays', title: 'Relative collection' },
            { folder: 'audiobooks/Existing Nested Collection', title: 'Nested collection' }
        ];

        expect(findAudiobookByFolder(catalog, 'audiobooks/David Foster Wallace - Essays')?.title)
            .toBe('Relative collection');
        expect(findAudiobookByFolder(catalog, 'audiobooks/Existing Nested Collection')?.title)
            .toBe('Nested collection');
    });

    test('groups tracks by directory and selects a local cover using a mocked filesystem', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const collection = path.join(root, '001. Ursula Le Guin - Earthsea [mp3 - 64 kbps]');
        const fsApi = {
            readdir: jest.fn(async (directory) => {
                if (directory === root) return [directoryEntry('001. Ursula Le Guin - Earthsea [mp3 - 64 kbps]')];
                if (directory === collection) {
                    return [fileEntry('Chapter 10.mp3'), fileEntry('Chapter 2.mp3'), fileEntry('cover.jpg'), fileEntry('notes.txt')];
                }
                return [];
            }),
            stat: jest.fn(async (filePath) => ({
                size: filePath.endsWith('.jpg') ? 50 : 100,
                mtime: new Date('2026-08-14T10:00:00.000Z')
            }))
        };

        const catalog = await scanAudiobookCatalog(root, fsApi);

        expect(catalog).toHaveLength(1);
        expect(catalog[0]).toMatchObject({
            title: 'Ursula Le Guin - Earthsea',
            trackCount: 2,
            totalSize: 200,
            formats: ['MP3'],
            coverPath: '001. Ursula Le Guin - Earthsea [mp3 - 64 kbps]/cover.jpg',
            coverModifiedAt: '2026-08-14T10:00:00.000Z'
        });
        expect(catalog[0].tracks.map((track) => track.title)).toEqual(['Chapter 2', 'Chapter 10']);
        expect(fsApi.stat).toHaveBeenCalledTimes(3);
    });

    test('turns underscore-separated folder names into readable titles', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const collection = path.join(root, "Paulo_Coelho_L'Alchimista");
        const fsApi = {
            readdir: jest.fn(async (directory) => {
                if (directory === root) return [directoryEntry("Paulo_Coelho_L'Alchimista")];
                if (directory === collection) return [fileEntry("Paulo Coelho - L'Alchimista.m4b")];
                return [];
            }),
            stat: jest.fn(async () => ({ size: 100, mtime: new Date('2026-08-14T10:00:00.000Z') }))
        };

        const catalog = await scanAudiobookCatalog(root, fsApi);

        expect(catalog[0].title).toBe("Paulo Coelho L'Alchimista");
    });

    test('prefers a URL-managed cover without deleting an original collection cover', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const collection = path.join(root, 'Earthsea');
        const fsApi = {
            readdir: jest.fn(async (directory) => directory === root
                ? [directoryEntry('Earthsea')]
                : [fileEntry('Chapter 01.mp3'), fileEntry('cover.jpg'), fileEntry('bookshelf-cover.webp')]),
            stat: jest.fn(async (filePath) => ({
                size: filePath.endsWith('.mp3') ? 100 : 50,
                mtime: new Date('2026-08-16T10:00:00.000Z')
            }))
        };

        const catalog = await scanAudiobookCatalog(root, fsApi);

        expect(catalog[0].coverPath).toBe('Earthsea/bookshelf-cover.webp');
    });

    test('applies saved metadata when scanning a collection', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const collection = path.join(root, 'Earthsea');
        const fsApi = {
            readdir: jest.fn(async (directory) => directory === root
                ? [directoryEntry('Earthsea')]
                : [fileEntry('Chapter 01.mp3')]),
            stat: jest.fn(async () => ({ size: 100, mtime: new Date('2026-08-14T10:00:00.000Z') })),
            readFile: jest.fn(async (metadataPath) => {
                expect(metadataPath).toBe(path.join(collection, METADATA_FILE_NAME));
                return JSON.stringify({
                    title: 'A Wizard of Earthsea',
                    author: 'Ursula K. Le Guin',
                    narrator: 'Rob Inglis',
                    series: 'Earthsea Cycle',
                    seriesSequence: '1',
                    language: 'English',
                    publishedYear: 1968,
                    description: 'A classic fantasy audiobook.'
                });
            })
        };

        const catalog = await scanAudiobookCatalog(root, fsApi);

        expect(catalog[0]).toMatchObject({
            title: 'A Wizard of Earthsea',
            author: 'Ursula K. Le Guin',
            narrator: 'Rob Inglis',
            series: 'Earthsea Cycle',
            seriesSequence: '1',
            language: 'English',
            publishedYear: 1968,
            description: 'A classic fantasy audiobook.'
        });
    });

    test('uses the metadata file timestamp as the catalogue update timestamp', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const collection = path.join(root, 'Earthsea');
        const audioModifiedAt = new Date('2026-08-14T10:00:00.000Z');
        const metadataModifiedAt = new Date('2026-08-24T10:00:00.000Z');
        const fsApi = {
            readdir: jest.fn(async (directory) => directory === root
                ? [directoryEntry('Earthsea')]
                : [fileEntry('Chapter 01.mp3')]),
            stat: jest.fn(async (filePath) => ({
                size: 100,
                mtime: filePath.endsWith(METADATA_FILE_NAME) ? metadataModifiedAt : audioModifiedAt
            })),
            readFile: jest.fn(async () => JSON.stringify({ title: 'A Wizard of Earthsea' }))
        };

        const [result] = await scanAudiobookCatalog(root, fsApi);

        expect(result.modifiedAt).toBe(audioModifiedAt.toISOString());
        expect(result.updatedAt).toBe(metadataModifiedAt.toISOString());
    });

    test('writes sanitized metadata inside the collection directory', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const collection = path.join(root, 'Earthsea');
        const fsApi = {
            stat: jest.fn(async () => ({ isDirectory: () => true })),
            writeFile: jest.fn(async () => undefined)
        };

        const metadata = await writeAudiobookMetadata(root, 'Earthsea', {
            title: '  A Wizard of Earthsea  ',
            author: 'Ursula K. Le Guin',
            narrator: '',
            series: 'Earthsea Cycle',
            seriesSequence: '1',
            language: 'English',
            publishedYear: '1968',
            description: '  A classic fantasy audiobook.  '
        }, fsApi);

        expect(metadata.title).toBe('A Wizard of Earthsea');
        expect(metadata.series).toBe('Earthsea Cycle');
        expect(metadata.seriesSequence).toBe('1');
        expect(metadata.publishedYear).toBe(1968);
        expect(fsApi.writeFile).toHaveBeenCalledWith(
            path.join(collection, METADATA_FILE_NAME),
            expect.stringContaining('"publishedYear": 1968'),
            { encoding: 'utf8', mode: 0o600 }
        );
    });

    test('rejects invalid metadata years', () => {
        expect(() => sanitizeAudiobookMetadata({ publishedYear: 'not-a-year' }))
            .toThrow(AudiobookCatalogError);
    });

    test('resolves covers inside the fixed directory', () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const result = resolveAudiobookCoverPath(root, 'Collection/cover.webp');

        expect(result.coverPath).toBe(path.join(root, 'Collection', 'cover.webp'));
    });

    test('resolves audio tracks inside the fixed directory', () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const result = resolveAudiobookAudioPath(root, 'Collection/Chapter 01.m4b');

        expect(result.audioPath).toBe(path.join(root, 'Collection', 'Chapter 01.m4b'));
    });

    test.each(['../cover.jpg', '/tmp/cover.jpg', 'Collection/cover.svg'])(
        'rejects unsafe or unsupported cover path %s',
        (relativePath) => {
            expect(() => resolveAudiobookCoverPath('/srv/bookshelf/audiobooks', relativePath))
                .toThrow(AudiobookCatalogError);
        }
    );

    test.each(['../track.mp3', 'Collection/cover.jpg'])(
        'rejects unsafe or unsupported audio path %s',
        (relativePath) => {
            expect(() => resolveAudiobookAudioPath('/srv/bookshelf/audiobooks', relativePath))
                .toThrow(AudiobookCatalogError);
        }
    );
});
