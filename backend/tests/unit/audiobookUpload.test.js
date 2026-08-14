const path = require('path');
const {
    AudiobookUploadError,
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
});
