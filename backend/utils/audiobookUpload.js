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

module.exports = {
    AudiobookUploadError,
    SUPPORTED_AUDIOBOOK_EXTENSIONS,
    normalizeAudiobookRelativePath,
    resolveAudiobookUploadPath
};
