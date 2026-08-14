const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.m4b', '.mp3', '.ogg', '.opus', '.wav']);
const COVER_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const METADATA_FILE_NAME = '.bookshelf-metadata.json';
const METADATA_TEXT_LIMITS = Object.freeze({
    title: 300,
    author: 200,
    narrator: 200,
    language: 100,
    description: 5000
});

class AudiobookCatalogError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AudiobookCatalogError';
    }
}

const normalizeRelativeAssetPath = (relativePath) => {
    const candidate = String(relativePath || '')
        .replace(/\\/g, '/')
        .normalize('NFC');

    if (!candidate || candidate.includes('\0') || candidate.startsWith('/')) {
        throw new AudiobookCatalogError('Invalid audiobook asset path');
    }

    const segments = candidate.split('/').filter(Boolean);
    if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
        throw new AudiobookCatalogError('Invalid audiobook asset path');
    }

    return segments.join('/');
};

const resolveAudiobookAssetPath = (audiobooksDirectory, relativePath, supportedExtensions, unsupportedMessage) => {
    const normalizedPath = normalizeRelativeAssetPath(relativePath);
    if (!supportedExtensions.has(path.extname(normalizedPath).toLowerCase())) {
        throw new AudiobookCatalogError(unsupportedMessage);
    }

    const rootPath = path.resolve(audiobooksDirectory);
    const coverPath = path.resolve(rootPath, ...normalizedPath.split('/'));
    const pathFromRoot = path.relative(rootPath, coverPath);

    if (!pathFromRoot || pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
        throw new AudiobookCatalogError('Invalid audiobook asset path');
    }

    return { relativePath: normalizedPath, coverPath };
};

const resolveAudiobookCoverPath = (audiobooksDirectory, relativePath) => (
    resolveAudiobookAssetPath(
        audiobooksDirectory,
        relativePath,
        COVER_EXTENSIONS,
        'Unsupported audiobook cover type'
    )
);

const resolveAudiobookAudioPath = (audiobooksDirectory, relativePath) => {
    const resolved = resolveAudiobookAssetPath(
        audiobooksDirectory,
        relativePath,
        AUDIO_EXTENSIONS,
        'Unsupported audiobook audio type'
    );

    return { relativePath: resolved.relativePath, audioPath: resolved.coverPath };
};

const resolveAudiobookDirectoryPath = (audiobooksDirectory, relativeDirectory) => {
    const rootPath = path.resolve(audiobooksDirectory);
    if (relativeDirectory === '.') return rootPath;

    const normalizedPath = normalizeRelativeAssetPath(relativeDirectory);
    const directoryPath = path.resolve(rootPath, ...normalizedPath.split('/'));
    const pathFromRoot = path.relative(rootPath, directoryPath);

    if (!pathFromRoot || pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
        throw new AudiobookCatalogError('Invalid audiobook directory path');
    }

    return directoryPath;
};

const sanitizeAudiobookMetadata = (metadata = {}) => {
    const sanitized = {};
    Object.entries(METADATA_TEXT_LIMITS).forEach(([field, maxLength]) => {
        const value = metadata[field];
        if (value === undefined || value === null) {
            sanitized[field] = '';
            return;
        }
        if (typeof value !== 'string' || value.length > maxLength) {
            throw new AudiobookCatalogError(`${field} must be text no longer than ${maxLength} characters`);
        }
        sanitized[field] = value.trim();
    });

    const publishedYear = metadata.publishedYear;
    if (publishedYear === undefined || publishedYear === null || publishedYear === '') {
        sanitized.publishedYear = null;
    } else {
        const numericYear = Number(publishedYear);
        const maximumYear = new Date().getFullYear() + 1;
        if (!Number.isInteger(numericYear) || numericYear < 1 || numericYear > maximumYear) {
            throw new AudiobookCatalogError(`publishedYear must be between 1 and ${maximumYear}`);
        }
        sanitized.publishedYear = numericYear;
    }

    return sanitized;
};

const readAudiobookMetadata = async (audiobooksDirectory, relativeDirectory, fsApi = fs.promises) => {
    try {
        const directoryPath = resolveAudiobookDirectoryPath(audiobooksDirectory, relativeDirectory);
        const rawMetadata = await fsApi.readFile(path.join(directoryPath, METADATA_FILE_NAME), 'utf8');
        return sanitizeAudiobookMetadata(JSON.parse(rawMetadata));
    } catch (err) {
        return {};
    }
};

const writeAudiobookMetadata = async (audiobooksDirectory, relativeDirectory, metadata, fsApi = fs.promises) => {
    const directoryPath = resolveAudiobookDirectoryPath(audiobooksDirectory, relativeDirectory);
    const stats = await fsApi.stat(directoryPath);
    if (!stats.isDirectory()) {
        throw new AudiobookCatalogError('Audiobook directory not found');
    }

    const sanitized = sanitizeAudiobookMetadata(metadata);
    await fsApi.writeFile(
        path.join(directoryPath, METADATA_FILE_NAME),
        `${JSON.stringify(sanitized, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 }
    );
    return sanitized;
};

const displayName = (value) => value
    .replace(/\.(?:aac|flac|m4a|m4b|mp3|ogg|opus|wav)$/i, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*\[(?:mp3|m4[ab]|aac|flac|ogg|opus|wav)\b[^\]]*\]\s*$/i, '')
    .replace(/_+/g, ' ')
    .trim();

const collectFiles = async (rootDirectory, currentDirectory, fsApi, files) => {
    const entries = await fsApi.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
        const absolutePath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
            await collectFiles(rootDirectory, absolutePath, fsApi, files);
        } else if (entry.isFile()) {
            const extension = path.extname(entry.name).toLowerCase();
            if (!AUDIO_EXTENSIONS.has(extension) && !COVER_EXTENSIONS.has(extension)) continue;

            const stats = await fsApi.stat(absolutePath);
            files.push({
                name: entry.name,
                relativePath: path.relative(rootDirectory, absolutePath).split(path.sep).join('/'),
                directory: path.relative(rootDirectory, currentDirectory).split(path.sep).join('/') || '.',
                extension,
                size: stats.size,
                modifiedAt: stats.mtime instanceof Date ? stats.mtime.toISOString() : new Date(stats.mtimeMs).toISOString()
            });
        }
    }
};

const scanAudiobookCatalog = async (audiobooksDirectory, fsApi = fs.promises) => {
    const files = [];
    await collectFiles(audiobooksDirectory, audiobooksDirectory, fsApi, files);

    const filesByDirectory = new Map();
    files.forEach((file) => {
        const directoryFiles = filesByDirectory.get(file.directory) || [];
        directoryFiles.push(file);
        filesByDirectory.set(file.directory, directoryFiles);
    });

    const catalog = await Promise.all([...filesByDirectory.entries()]
        .map(async ([directory, directoryFiles]) => {
            const tracks = directoryFiles
                .filter((file) => AUDIO_EXTENSIONS.has(file.extension))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                .map((file) => ({
                    title: displayName(file.name),
                    path: file.relativePath,
                    format: file.extension.slice(1).toUpperCase(),
                    size: file.size
                }));

            if (!tracks.length) return null;

            const cover = directoryFiles
                .filter((file) => COVER_EXTENSIONS.has(file.extension))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
            const latestModifiedAt = directoryFiles.reduce(
                (latest, file) => file.modifiedAt > latest ? file.modifiedAt : latest,
                directoryFiles[0].modifiedAt
            );
            const folderName = directory === '.' ? tracks[0].title : path.posix.basename(directory);
            const metadata = await readAudiobookMetadata(audiobooksDirectory, directory, fsApi);

            return {
                id: directory,
                title: metadata.title || displayName(folderName),
                folder: directory,
                coverPath: cover?.relativePath || null,
                trackCount: tracks.length,
                totalSize: tracks.reduce((total, track) => total + track.size, 0),
                formats: [...new Set(tracks.map((track) => track.format))],
                modifiedAt: latestModifiedAt,
                author: metadata.author || '',
                narrator: metadata.narrator || '',
                language: metadata.language || '',
                description: metadata.description || '',
                publishedYear: metadata.publishedYear || null,
                tracks
            };
        }));

    return catalog
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
};

module.exports = {
    AUDIO_EXTENSIONS,
    COVER_EXTENSIONS,
    METADATA_FILE_NAME,
    AudiobookCatalogError,
    normalizeRelativeAssetPath,
    readAudiobookMetadata,
    resolveAudiobookAudioPath,
    resolveAudiobookCoverPath,
    resolveAudiobookDirectoryPath,
    sanitizeAudiobookMetadata,
    writeAudiobookMetadata,
    scanAudiobookCatalog
};
