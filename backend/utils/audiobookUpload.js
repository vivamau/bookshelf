const fs = require('fs');
const path = require('path');

const SUPPORTED_AUDIOBOOK_EXTENSIONS = new Set([
    '.aac',
    '.cue',
    '.flac',
    '.jpeg',
    '.jpg',
    '.json',
    '.m4a',
    '.m4b',
    '.mp3',
    '.nfo',
    '.ogg',
    '.opus',
    '.png',
    '.txt',
    '.wav',
    '.webp'
]);
const AUDIOBOOK_AUDIO_EXTENSIONS = new Set([
    '.aac', '.flac', '.m4a', '.m4b', '.mp3', '.ogg', '.opus', '.wav'
]);
const MAX_DUPLICATE_CHECK_FILES = 5000;

class AudiobookUploadError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'AudiobookUploadError';
        this.statusCode = statusCode;
    }
}

const isPathInside = (parentPath, candidatePath) => {
    const relativePath = path.relative(parentPath, candidatePath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const collectAudiobookAssets = async (sourceDirectory, fsApi = fs.promises) => {
    const assets = [];
    let skippedCount = 0;

    const visit = async (directoryPath) => {
        const entries = await fsApi.readdir(directoryPath, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(directoryPath, entry.name);
            if (entry.isSymbolicLink()) {
                skippedCount += 1;
            } else if (entry.isDirectory()) {
                await visit(entryPath);
            } else if (entry.isFile() && SUPPORTED_AUDIOBOOK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                assets.push(entryPath);
            } else if (entry.isFile()) {
                skippedCount += 1;
            }
        }
    };

    await visit(sourceDirectory);
    return { assets, skippedCount };
};

const importAudiobookDirectory = async (
    sourceDirectory,
    audiobooksDirectory,
    fsApi = fs.promises
) => {
    const requestedPath = String(sourceDirectory || '').trim();
    if (!requestedPath || !path.isAbsolute(requestedPath)) {
        throw new AudiobookUploadError('Select an absolute server folder path');
    }

    await fsApi.mkdir(audiobooksDirectory, { recursive: true });

    let sourcePath;
    let destinationRoot;
    try {
        sourcePath = await fsApi.realpath(requestedPath);
        destinationRoot = await fsApi.realpath(audiobooksDirectory);
    } catch (err) {
        if (err?.code === 'ENOENT') {
            throw new AudiobookUploadError('The selected server folder does not exist', 404);
        }
        throw err;
    }

    const sourceStats = await fsApi.stat(sourcePath);
    if (!sourceStats.isDirectory()) {
        throw new AudiobookUploadError('The selected server path is not a folder');
    }
    if (isPathInside(destinationRoot, sourcePath) || isPathInside(sourcePath, destinationRoot)) {
        throw new AudiobookUploadError('Choose a folder outside the managed audiobook library');
    }

    const collectionFolder = path.basename(sourcePath);
    if (!collectionFolder || collectionFolder === path.parse(sourcePath).root) {
        throw new AudiobookUploadError('The server root cannot be imported as an audiobook folder');
    }

    const { assets, skippedCount } = await collectAudiobookAssets(sourcePath, fsApi);
    if (!assets.some((assetPath) => AUDIOBOOK_AUDIO_EXTENSIONS.has(path.extname(assetPath).toLowerCase()))) {
        throw new AudiobookUploadError('This folder does not contain a supported audiobook audio file');
    }

    let importedCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;
    const collectionDestination = path.join(destinationRoot, collectionFolder);

    for (const assetPath of assets) {
        const relativeAssetPath = path.relative(sourcePath, assetPath);
        const destinationPath = path.join(collectionDestination, relativeAssetPath);
        await fsApi.mkdir(path.dirname(destinationPath), { recursive: true });

        try {
            const [sourceFileStats, destinationStats] = await Promise.all([
                fsApi.stat(assetPath),
                fsApi.stat(destinationPath)
            ]);
            if (destinationStats.isFile() && destinationStats.size === sourceFileStats.size) {
                duplicateCount += 1;
            } else {
                conflictCount += 1;
            }
            continue;
        } catch (err) {
            if (err?.code !== 'ENOENT') throw err;
        }

        try {
            await fsApi.copyFile(assetPath, destinationPath, fs.constants.COPYFILE_EXCL);
            importedCount += 1;
        } catch (err) {
            if (err?.code !== 'EEXIST') throw err;
            conflictCount += 1;
        }
    }

    return {
        sourcePath,
        collectionFolder,
        importedCount,
        duplicateCount,
        conflictCount,
        skippedCount,
        supportedFileCount: assets.length
    };
};

const normalizeAudiobookRelativePath = (relativePath, fallbackName = '') => {
    const candidate = String(relativePath || fallbackName)
        .replace(/\\/g, '/')
        .normalize('NFC');

    if (!candidate || candidate.includes('\0') || candidate.startsWith('/')) {
        throw new AudiobookUploadError('Invalid audiobook file path');
    }

    const segments = candidate.split('/').filter(Boolean);
    if (!segments.length || segments.some(segment => segment === '.' || segment === '..')) {
        throw new AudiobookUploadError('Invalid audiobook file path');
    }

    const extension = path.extname(segments.at(-1)).toLowerCase();
    if (!SUPPORTED_AUDIOBOOK_EXTENSIONS.has(extension)) {
        throw new AudiobookUploadError('Unsupported audiobook file type');
    }

    return segments.join('/');
};

const resolveAudiobookUploadPath = (audiobooksDirectory, relativePath, fallbackName) => {
    const normalizedPath = normalizeAudiobookRelativePath(relativePath, fallbackName);
    const rootPath = path.resolve(audiobooksDirectory);
    const uploadPath = path.resolve(rootPath, ...normalizedPath.split('/'));
    const pathFromRoot = path.relative(rootPath, uploadPath);

    if (!pathFromRoot || pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
        throw new AudiobookUploadError('Invalid audiobook file path');
    }

    return {
        relativePath: normalizedPath,
        uploadPath
    };
};

const findAudiobookUploadConflicts = async (audiobooksDirectory, files, fsApi = fs.promises) => {
    if (!Array.isArray(files)) {
        throw new AudiobookUploadError('files must be a list');
    }
    if (files.length > MAX_DUPLICATE_CHECK_FILES) {
        throw new AudiobookUploadError(`No more than ${MAX_DUPLICATE_CHECK_FILES} files can be checked at once`);
    }

    const results = await Promise.all(files.map(async (file) => {
        if (!file || !Number.isSafeInteger(file.size) || file.size < 0) {
            throw new AudiobookUploadError('Each file must include a valid size');
        }

        const destination = resolveAudiobookUploadPath(
            audiobooksDirectory,
            file.relativePath,
            file.name
        );

        try {
            const stats = await fsApi.lstat(destination.uploadPath);
            const isMatchingFile = stats.isFile() && stats.size === file.size;
            return {
                relativePath: destination.relativePath,
                status: isMatchingFile ? 'duplicate' : 'conflict'
            };
        } catch (err) {
            if (err?.code === 'ENOENT') return null;
            throw err;
        }
    }));

    return results.filter(Boolean);
};

module.exports = {
    AudiobookUploadError,
    AUDIOBOOK_AUDIO_EXTENSIONS,
    MAX_DUPLICATE_CHECK_FILES,
    SUPPORTED_AUDIOBOOK_EXTENSIONS,
    collectAudiobookAssets,
    findAudiobookUploadConflicts,
    importAudiobookDirectory,
    normalizeAudiobookRelativePath,
    resolveAudiobookUploadPath
};
