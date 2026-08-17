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
const MAX_DUPLICATE_CHECK_FILES = 5000;

class AudiobookUploadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AudiobookUploadError';
    }
}

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
    MAX_DUPLICATE_CHECK_FILES,
    SUPPORTED_AUDIOBOOK_EXTENSIONS,
    findAudiobookUploadConflicts,
    normalizeAudiobookRelativePath,
    resolveAudiobookUploadPath
};
