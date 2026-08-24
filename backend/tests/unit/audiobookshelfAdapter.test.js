const {
    AUDIOBOOKSHELF_LIBRARY_ID,
    buildAuthorizationResponse,
    buildLibraryAuthors,
    buildLibraryItem,
    buildLibrarySeries,
    buildLibraryStats,
    buildListeningStats,
    buildMediaProgress,
    findAudiobookByItemId,
    findAudiobooksByAuthorId,
    findAudiobooksBySeriesId,
    getAudiobookshelfItemId
} = require('../../utils/audiobookshelfAdapter');

const audiobook = {
    folder: 'Ursula Le Guin/Earthsea',
    title: 'A Wizard of Earthsea',
    coverPath: 'Ursula Le Guin/Earthsea/cover.jpg',
    trackCount: 2,
    totalSize: 300,
    modifiedAt: '2026-08-23T10:00:00.000Z',
    narrator: 'Rob Inglis',
    language: 'English',
    description: 'A classic fantasy audiobook.',
    publishedYear: 1968,
    authors: [{
        ID: 9,
        author_name: 'Ursula K.',
        author_lastname: 'Le Guin'
    }],
    tracks: [
        {
            title: 'Chapter 1',
            path: 'Ursula Le Guin/Earthsea/01.mp3',
            format: 'MP3',
            size: 100,
            duration: 60,
            mimeType: 'audio/mpeg'
        },
        {
            title: 'Chapter 2',
            path: 'Ursula Le Guin/Earthsea/02.mp3',
            format: 'MP3',
            size: 200,
            duration: 90,
            mimeType: 'audio/mpeg'
        }
    ]
};

describe('Audiobookshelf compatibility adapter', () => {
    test('creates stable Audiobookshelf IDs and minified library items', () => {
        const firstId = getAudiobookshelfItemId(audiobook.folder);
        const secondId = getAudiobookshelfItemId(audiobook.folder);
        const item = buildLibraryItem(audiobook);

        expect(firstId).toBe(secondId);
        expect(item).toMatchObject({
            id: firstId,
            libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
            mediaType: 'book',
            media: {
                metadata: {
                    title: 'A Wizard of Earthsea',
                    authorName: 'Ursula K. Le Guin',
                    narratorName: 'Rob Inglis',
                    abridged: false
                },
                id: expect.any(String),
                numTracks: 2,
                duration: 150,
                coverPath: `/api/items/${firstId}/cover`
            }
        });
        expect(findAudiobookByItemId([audiobook], firstId)).toBe(audiobook);
        expect(item).not.toHaveProperty('libraryFiles');

        const itemWithoutPhysicalCover = buildLibraryItem({ ...audiobook, coverPath: null });
        expect(itemWithoutPhysicalCover.media.coverPath).toMatch(/^\/api\/items\/.+\/cover$/);
    });

    test('builds expanded tracks with cumulative offsets and protected URLs', () => {
        const item = buildLibraryItem(audiobook, { expanded: true });

        expect(item.media.tracks).toEqual([
            expect.objectContaining({
                index: 0,
                startOffset: 0,
                duration: 60,
                mimeType: 'audio/mpeg',
                ino: expect.any(String),
                bitRate: expect.any(Number),
                chapters: expect.any(Array),
                metaTags: expect.any(Object)
            }),
            expect.objectContaining({
                index: 1,
                startOffset: 60,
                duration: 90,
                mimeType: 'audio/mpeg'
            })
        ]);
        expect(item.media.audioFiles).toHaveLength(2);
        expect(item.media.id).toEqual(expect.any(String));
        expect(item.media.metadata.authors[0].name).toBe('Ursula K. Le Guin');
        expect(item.media.metadata).toMatchObject({
            authorName: 'Ursula K. Le Guin',
            authorNameLF: 'Ursula K. Le Guin',
            narratorName: 'Rob Inglis',
            seriesName: '',
            descriptionPlain: 'A classic fantasy audiobook.'
        });
        expect(item.media).toMatchObject({
            numTracks: 2,
            numAudioFiles: 2,
            numChapters: 2
        });
        expect(item.media.audioFiles[0]).toMatchObject({
            trackNumFromMeta: 1,
            trackNumFromFilename: null,
            timeBase: '1/1000',
            channelLayout: '',
            metaTags: {
                tagAlbum: 'A Wizard of Earthsea',
                tagArtist: 'Ursula K. Le Guin',
                tagTitle: 'Chapter 1',
                tagTrack: '1'
            },
            metadata: {
                mtimeMs: expect.any(Number),
                ctimeMs: expect.any(Number),
                birthtimeMs: expect.any(Number)
            }
        });
        expect(item.media.chapters).toEqual([
            { id: 0, start: 0, end: 60, title: 'Chapter 1' },
            { id: 1, start: 60, end: 150, title: 'Chapter 2' }
        ]);
        expect(item.libraryFiles).toHaveLength(3);
        expect(item.libraryFiles[0]).toMatchObject({
            ino: expect.any(String),
            fileType: 'audio',
            isSupplementary: null,
            metadata: { filename: '01.mp3', size: 100 }
        });
    });

    test('maps Bookshelf chapter progress to an Audiobookshelf media progress object', () => {
        const progress = buildMediaProgress(audiobook, {
            track_path: audiobook.tracks[1].path,
            position_seconds: 30,
            duration_seconds: 90,
            progress_percentage: 60,
            audiobook_started_date: 10,
            audiobook_ended_date: null,
            audiobooksusers_update_date: 20
        });

        expect(progress).toMatchObject({
            libraryItemId: getAudiobookshelfItemId(audiobook.folder),
            duration: 150,
            currentTime: 90,
            progress: 0.6,
            isFinished: false,
            startedAt: 10,
            lastUpdate: 20
        });
    });

    test('creates the login and authorize envelope expected by native clients', () => {
        const response = buildAuthorizationResponse({
            ID: 1,
            user_username: 'reader',
            userrole_manageusers: 0,
            userrole_managebooks: 0,
            userrole_readbooks: 1
        }, 'api-token', [], '1.50.0');

        expect(response).toMatchObject({
            userDefaultLibraryId: AUDIOBOOKSHELF_LIBRARY_ID,
            Source: 'bookshelf',
            user: {
                id: '1',
                username: 'reader',
                token: 'api-token',
                isOldToken: false
            },
            serverSettings: {
                version: '2.25.1',
                bookshelfVersion: '1.50.0'
            }
        });
    });

    test('builds the library statistics payload requested by SoundLeaf', () => {
        const secondAudiobook = {
            ...audiobook,
            folder: 'Ursula Le Guin/The Tombs of Atuan',
            title: 'The Tombs of Atuan',
            totalSize: 500,
            genres: ['Fantasy'],
            tracks: [{ ...audiobook.tracks[0], duration: 200 }]
        };
        const stats = buildLibraryStats([{ ...audiobook, genres: ['Fantasy'] }, secondAudiobook]);

        expect(stats).toMatchObject({
            totalAuthors: 1,
            authorsWithCount: [expect.objectContaining({ name: 'Ursula K. Le Guin', count: 2 })],
            totalGenres: 1,
            genresWithCount: [{ genre: 'Fantasy', count: 2 }],
            totalItems: 2,
            totalSize: 800,
            totalDuration: 350,
            numAudioTracks: 3
        });
        expect(stats.largestItems[0]).toMatchObject({ title: 'The Tombs of Atuan', size: 500 });
        expect(stats.longestItems[0]).toMatchObject({ title: 'The Tombs of Atuan', duration: 200 });
    });

    test('aggregates Audiobookshelf authors and finds their library items', () => {
        const secondAudiobook = {
            ...audiobook,
            folder: 'Ursula Le Guin/The Tombs of Atuan',
            title: 'The Tombs of Atuan'
        };
        const catalog = [audiobook, secondAudiobook];
        const authors = buildLibraryAuthors(catalog);

        expect(authors).toEqual([
            expect.objectContaining({
                id: expect.stringMatching(/^aut_/),
                name: 'Ursula K. Le Guin',
                lastFirst: 'Le Guin, Ursula K.',
                numBooks: 2,
                libraryId: AUDIOBOOKSHELF_LIBRARY_ID
            })
        ]);
        expect(findAudiobooksByAuthorId(catalog, authors[0].id)).toEqual(catalog);
    });

    test('groups explicit audiobook series and orders books by sequence', () => {
        const first = { ...audiobook, series: 'Earthsea Cycle', seriesSequence: '1' };
        const second = {
            ...audiobook,
            folder: 'Ursula Le Guin/The Tombs of Atuan',
            title: 'The Tombs of Atuan',
            series: 'Earthsea Cycle',
            seriesSequence: '2'
        };
        const catalog = [second, first];
        const series = buildLibrarySeries(catalog);

        expect(series).toEqual([
            expect.objectContaining({
                id: expect.stringMatching(/^ser_/),
                name: 'Earthsea Cycle',
                libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
                books: [
                    expect.objectContaining({ id: getAudiobookshelfItemId(first.folder) }),
                    expect.objectContaining({ id: getAudiobookshelfItemId(second.folder) })
                ]
            })
        ]);
        expect(findAudiobooksBySeriesId(catalog, series[0].id)).toEqual(catalog);
    });

    test('builds authenticated listening statistics in Audiobookshelf format', () => {
        const stats = buildListeningStats([{
            id: 'play_test',
            userId: '1',
            libraryItemId: 'li_test',
            mediaMetadata: { title: 'A Wizard of Earthsea' },
            date: '2026-08-24',
            dayOfWeek: 'Monday',
            timeListening: 63.4,
            startedAt: 100,
            updatedAt: 200,
            audiobook: { folder: 'must-not-leak' }
        }], Date.parse('2026-08-24T12:00:00.000Z'));

        expect(stats).toMatchObject({
            totalTime: 63,
            items: {
                li_test: {
                    id: 'li_test',
                    timeListening: 63,
                    mediaMetadata: { title: 'A Wizard of Earthsea' }
                }
            },
            days: { '2026-08-24': 63 },
            dayOfWeek: { Monday: 63 },
            today: 63,
            recentSessions: [expect.objectContaining({ id: 'play_test', timeListening: 63 })]
        });
        expect(stats.recentSessions[0]).not.toHaveProperty('audiobook');
    });
});
