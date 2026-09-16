const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    AudiobookUploadError,
    findAudiobookUploadConflicts,
    importAudiobookDirectory,
    normalizeAudiobookRelativePath,
    resolveAudiobookUploadPath
} = require('../../utils/audiobookUpload');

describe('audiobook upload paths', () => {
    const temporaryDirectories = [];

    afterEach(() => {
        temporaryDirectories.splice(0).forEach((directory) => {
            fs.rmSync(directory, { recursive: true, force: true });
        });
    });

    const createTemporaryDirectory = (prefix) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
        temporaryDirectories.push(directory);
        return directory;
    };

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

    test('imports a server folder while preserving supported nested assets', async () => {
        const sourceParent = createTemporaryDirectory('bookshelf-audiobook-source-');
        const destination = createTemporaryDirectory('bookshelf-audiobook-destination-');
        const source = path.join(sourceParent, 'The Collection');
        fs.mkdirSync(path.join(source, 'Disc 1'), { recursive: true });
        fs.writeFileSync(path.join(source, 'Disc 1', '01.mp3'), 'audio');
        fs.writeFileSync(path.join(source, 'cover.jpg'), 'cover');
        fs.writeFileSync(path.join(source, 'notes.docx'), 'unsupported');

        const result = await importAudiobookDirectory(source, destination);

        expect(result).toMatchObject({
            collectionFolder: 'The Collection',
            importedCount: 2,
            duplicateCount: 0,
            conflictCount: 0,
            skippedCount: 1,
            supportedFileCount: 2
        });
        expect(fs.readFileSync(path.join(destination, 'The Collection', 'Disc 1', '01.mp3'), 'utf8'))
            .toBe('audio');
        expect(fs.readFileSync(path.join(destination, 'The Collection', 'cover.jpg'), 'utf8'))
            .toBe('cover');
    });

    test('skips duplicate and conflicting destination files without overwriting them', async () => {
        const sourceParent = createTemporaryDirectory('bookshelf-audiobook-source-');
        const destination = createTemporaryDirectory('bookshelf-audiobook-destination-');
        const source = path.join(sourceParent, 'Existing Collection');
        const importedCollection = path.join(destination, 'Existing Collection');
        fs.mkdirSync(source, { recursive: true });
        fs.mkdirSync(importedCollection, { recursive: true });
        fs.writeFileSync(path.join(source, 'same.mp3'), 'same');
        fs.writeFileSync(path.join(source, 'changed.m4b'), 'new-content');
        fs.writeFileSync(path.join(importedCollection, 'same.mp3'), 'same');
        fs.writeFileSync(path.join(importedCollection, 'changed.m4b'), 'old');

        const result = await importAudiobookDirectory(source, destination);

        expect(result).toMatchObject({ importedCount: 0, duplicateCount: 1, conflictCount: 1 });
        expect(fs.readFileSync(path.join(importedCollection, 'changed.m4b'), 'utf8')).toBe('old');
    });

    test('rejects importing from within the managed audiobook library', async () => {
        const destination = createTemporaryDirectory('bookshelf-audiobook-destination-');
        const source = path.join(destination, 'Managed Collection');
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'track.mp3'), 'audio');

        await expect(importAudiobookDirectory(source, destination))
            .rejects.toThrow('Choose a folder outside the managed audiobook library');
    });

    test('rejects a server folder that only contains artwork and metadata', async () => {
        const sourceParent = createTemporaryDirectory('bookshelf-audiobook-source-');
        const destination = createTemporaryDirectory('bookshelf-audiobook-destination-');
        const source = path.join(sourceParent, 'Artwork Only');
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'cover.jpg'), 'cover');
        fs.writeFileSync(path.join(source, 'metadata.json'), '{}');

        await expect(importAudiobookDirectory(source, destination))
            .rejects.toThrow('This folder does not contain a supported audiobook audio file');
    });
});
