const path = require('path');
const {
    AudiobookDestinationError,
    isUnmountedNetworkPath,
    normalizeDestinationId,
    parseVirtualAudiobookPath,
    pathsOverlap,
    toVirtualAudiobookPath,
    virtualizeAudiobookCatalog
} = require('../../utils/audiobookDestinations');

describe('audiobook destinations', () => {
    test('normalizes the built-in and numeric destination identifiers', () => {
        expect(normalizeDestinationId()).toBe('default');
        expect(normalizeDestinationId('default')).toBe('default');
        expect(normalizeDestinationId('7')).toBe(7);
        expect(() => normalizeDestinationId('../7')).toThrow(AudiobookDestinationError);
    });

    test('recognizes network addresses that must be mounted by the server first', () => {
        expect(isUnmountedNetworkPath('smb://nas.local/audiobooks')).toBe(true);
        expect(isUnmountedNetworkPath('cifs://nas.local/audiobooks')).toBe(true);
        expect(isUnmountedNetworkPath('\\\\nas.local\\audiobooks')).toBe(true);
        expect(isUnmountedNetworkPath('/mnt/nas/audiobooks')).toBe(false);
        expect(isUnmountedNetworkPath('/Volumes/Audiobooks')).toBe(false);
    });

    test('round-trips virtual paths for additional destinations', () => {
        const virtualPath = toVirtualAudiobookPath(7, 'Author/Book/01.mp3');
        expect(virtualPath).toBe('@bookshelf-destination-7/Author/Book/01.mp3');
        expect(parseVirtualAudiobookPath(virtualPath)).toEqual({
            destinationId: 7,
            relativePath: 'Author/Book/01.mp3'
        });
    });

    test('keeps paths in the built-in destination backward compatible', () => {
        expect(toVirtualAudiobookPath('default', 'Collection/01.mp3')).toBe('Collection/01.mp3');
        expect(parseVirtualAudiobookPath('Collection/01.mp3')).toEqual({
            destinationId: 'default',
            relativePath: 'Collection/01.mp3'
        });
    });

    test('detects equal, parent, and child destination paths', () => {
        const root = path.join(path.sep, 'srv', 'audiobooks');
        expect(pathsOverlap(root, root)).toBe(true);
        expect(pathsOverlap(root, path.join(root, 'archive'))).toBe(true);
        expect(pathsOverlap(path.join(root, 'archive'), root)).toBe(true);
        expect(pathsOverlap(root, path.join(path.sep, 'mnt', 'audiobooks'))).toBe(false);
    });

    test('adds destination identity to catalog folders and assets', () => {
        const [result] = virtualizeAudiobookCatalog([{
            id: 'Book',
            folder: 'Book',
            coverPath: 'Book/cover.jpg',
            tracks: [{ path: 'Book/01.mp3' }]
        }], { id: 4, name: 'NAS' });

        expect(result).toMatchObject({
            id: '@bookshelf-destination-4/Book',
            folder: '@bookshelf-destination-4/Book',
            coverPath: '@bookshelf-destination-4/Book/cover.jpg',
            destinationId: 4,
            destinationName: 'NAS',
            tracks: [{ path: '@bookshelf-destination-4/Book/01.mp3' }]
        });
    });
});
