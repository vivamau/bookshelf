const path = require('path');
const {
    AudiobookUploadError,
    findAudiobookUploadConflicts,
    normalizeAudiobookRelativePath,
    resolveAudiobookUploadPath
} = require('../../utils/audiobookUpload');

describe('audiobook upload paths', () => {
    test('preserves a safe nested collection path', () => {
        expect(normalizeAudiobookRelativePath('My Library/Author/Book/01 - Intro.mp3'))
            .toBe('My Library/Author/Book/01 - Intro.mp3');
    });

    test('normalizes browser paths that contain backslashes', () => {
        expect(normalizeAudiobookRelativePath('Library\\Book\\audio.m4b'))
            .toBe('Library/Book/audio.m4b');
    });

    test.each([
        '../outside.mp3',
        'Library/../../outside.mp3',
        '/absolute/audio.mp3',
        'Library/audio.exe'
    ])('rejects unsafe or unsupported path %p', (relativePath) => {
        expect(() => normalizeAudiobookRelativePath(relativePath))
            .toThrow(AudiobookUploadError);
    });

    test('resolves uploads inside the fixed audiobooks directory', () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const result = resolveAudiobookUploadPath(root, 'Collection/Disc 1/track.flac');

        expect(result.relativePath).toBe('Collection/Disc 1/track.flac');
        expect(result.uploadPath).toBe(path.join(root, 'Collection', 'Disc 1', 'track.flac'));
    });

    test('finds matching duplicates and conflicting files before upload', async () => {
        const root = path.join(path.sep, 'srv', 'bookshelf', 'audiobooks');
        const fsApi = {
            lstat: jest.fn(async (filePath) => {
                if (filePath.endsWith('duplicate.m4b')) {
                    return { isFile: () => true, size: 250 };
                }
                if (filePath.endsWith('changed.mp3')) {
                    return { isFile: () => true, size: 100 };
                }
                const error = new Error('Not found');
                error.code = 'ENOENT';
                throw error;
            })
        };

        const conflicts = await findAudiobookUploadConflicts(root, [
            { relativePath: 'Book/duplicate.m4b', size: 250 },
            { relativePath: 'Book/changed.mp3', size: 200 },
            { relativePath: 'Book/new.flac', size: 300 }
        ], fsApi);

        expect(conflicts).toEqual([
            { relativePath: 'Book/duplicate.m4b', status: 'duplicate' },
            { relativePath: 'Book/changed.mp3', status: 'conflict' }
        ]);
    });

    test('rejects invalid duplicate-check descriptors', async () => {
        await expect(findAudiobookUploadConflicts('/srv/bookshelf/audiobooks', [
            { relativePath: 'Book/audio.m4b', size: -1 }
        ], { lstat: jest.fn() })).rejects.toThrow(AudiobookUploadError);
    });
});
