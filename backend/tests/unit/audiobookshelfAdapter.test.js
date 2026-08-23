const {
    AUDIOBOOKSHELF_LIBRARY_ID,
    buildAuthorizationResponse,
    buildLibraryItem,
    buildLibraryStats,
    buildMediaProgress,
    findAudiobookByItemId,
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
                    narratorName: 'Rob Inglis'
                },
                numTracks: 2,
                duration: 150,
                coverPath: `/api/items/${firstId}/cover`
            }
        });
        expect(findAudiobookByItemId([audiobook], firstId)).toBe(audiobook);
    });

    test('builds expanded tracks with cumulative offsets and protected URLs', () => {
        const item = buildLibraryItem(audiobook, { expanded: true });

        expect(item.media.tracks).toEqual([
            expect.objectContaining({
                index: 0,
                startOffset: 0,
                duration: 60,
                mimeType: 'audio/mpeg'
            }),
            expect.objectContaining({
                index: 1,
                startOffset: 60,
                duration: 90,
                mimeType: 'audio/mpeg'
            })
        ]);
        expect(item.media.audioFiles).toHaveLength(2);
        expect(item.media.metadata.authors[0].name).toBe('Ursula K. Le Guin');
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
                token: 'api-token'
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
});
