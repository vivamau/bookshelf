const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.m4b', '.mp3', '.ogg', '.opus', '.wav']);
const AUDIO_CONTENT_TYPES = Object.freeze({
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.m4b': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.wav': 'audio/wav'
});
const COVER_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const MANAGED_COVER_PREFIX = 'bookshelf-cover.';
const METADATA_FILE_NAME = '.bookshelf-metadata.json';
const METADATA_TEXT_LIMITS = Object.freeze({
    title: 300,
    author: 200,
    narrator: 200,
    series: 300,
    seriesSequence: 50,
    language: 100,
    description: 5000
});
const audioDurationCache = new Map();

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

const isSafariUserAgent = (userAgent = '') => (
    /Safari\//.test(userAgent)
    && !/(?:Chrome|Chromium|CriOS|Edg|OPR|Android)\//.test(userAgent)
);

const getAudiobookContentType = (relativePath, userAgent = '') => {
    const extension = path.extname(String(relativePath || '')).toLowerCase();
    if (extension === '.m4b' && isSafariUserAgent(userAgent)) {
        return 'audio/x-m4b';
    }

    const contentType = AUDIO_CONTENT_TYPES[extension];
    if (!contentType) {
        throw new AudiobookCatalogError('Unsupported audiobook audio type');
    }
    return contentType;
};

const probeAudioDuration = (audioPath, cacheKey = audioPath, execFileApi = execFile) => {
    if (audioDurationCache.has(cacheKey)) return audioDurationCache.get(cacheKey);

    const durationPromise = new Promise((resolve) => {
        execFileApi(
            'ffprobe',
            [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                audioPath
            ],
            { timeout: 15000, maxBuffer: 1024 * 1024 },
            (error, stdout) => {
                if (error) return resolve(0);
                const duration = Number.parseFloat(String(stdout).trim());
                return resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
            }
        );
    });
    audioDurationCache.set(cacheKey, durationPromise);
    return durationPromise;
};

const enrichAudiobookDurations = async (
    audiobooksDirectory,
    catalog,
    durationProbe = probeAudioDuration,
    concurrency = 4
) => {
    const entries = catalog.flatMap((audiobook, audiobookIndex) => (
        audiobook.tracks.map((track, trackIndex) => ({ audiobookIndex, trackIndex, track }))
    ));
    const durations = catalog.map((audiobook) => new Array(audiobook.tracks.length));
    let cursor = 0;
    const worker = async () => {
        while (cursor < entries.length) {
            const entry = entries[cursor];
            cursor += 1;
            const resolved = resolveAudiobookAudioPath(audiobooksDirectory, entry.track.path);
            const cacheKey = `${resolved.audioPath}:${entry.track.modifiedAt || ''}:${entry.track.size}`;
            durations[entry.audiobookIndex][entry.trackIndex] = await durationProbe(
                resolved.audioPath,
                cacheKey
            );
        }
    };
    const workerCount = Math.min(
        entries.length,
        Math.max(1, Number.parseInt(concurrency, 10) || 1)
    );
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return catalog.map((audiobook, audiobookIndex) => ({
        ...audiobook,
        tracks: audiobook.tracks.map((track, trackIndex) => ({
            ...track,
            duration: durations[audiobookIndex][trackIndex]
        }))
    }));
};

const createStaleWhileRevalidateLoader = (
    loadFresh,
    { maxAgeMs = 30000, now = Date.now, onRefreshError = () => undefined } = {}
) => {
    let cachedValue;
    let cachedAt = 0;
    let hasCachedValue = false;
    let refreshPromise = null;

    const refresh = () => {
        if (refreshPromise) return refreshPromise;
        refreshPromise = Promise.resolve()
            .then(loadFresh)
            .then((value) => {
                cachedValue = value;
                cachedAt = now();
                hasCachedValue = true;
                return value;
            })
            .finally(() => {
                refreshPromise = null;
            });
        return refreshPromise;
    };

    const load = async () => {
        if (!hasCachedValue) return refresh();
        if (now() - cachedAt >= maxAgeMs && !refreshPromise) {
            refresh().catch(onRefreshError);
        }
        return cachedValue;
    };
    load.reload = async () => {
        if (refreshPromise) await refreshPromise.catch(() => undefined);
        hasCachedValue = false;
        return refresh();
    };
    return load;
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

const findAudiobookByFolder = (catalog, requestedFolder) => {
    const folder = String(requestedFolder || '').replace(/\\/g, '/');
    const exactMatch = catalog.find((item) => item.folder === folder);
    if (exactMatch) return exactMatch;

    const relativeFolder = folder.replace(/^audiobooks\//i, '');
    if (relativeFolder === folder) return undefined;
    return catalog.find((item) => item.folder === relativeFolder);
};

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
                    size: file.size,
                    mimeType: AUDIO_CONTENT_TYPES[file.extension],
                    modifiedAt: file.modifiedAt,
                    duration: 0
                }));

            if (!tracks.length) return null;

            const cover = directoryFiles
                .filter((file) => COVER_EXTENSIONS.has(file.extension))
                .sort((a, b) => {
                    const aIsManaged = a.name.startsWith(MANAGED_COVER_PREFIX);
                    const bIsManaged = b.name.startsWith(MANAGED_COVER_PREFIX);
                    if (aIsManaged !== bIsManaged) return aIsManaged ? -1 : 1;
                    return a.name.localeCompare(b.name, undefined, { numeric: true });
                })[0];
            const latestModifiedAt = directoryFiles.reduce(
                (latest, file) => file.modifiedAt > latest ? file.modifiedAt : latest,
                directoryFiles[0].modifiedAt
            );
            const folderName = directory === '.' ? tracks[0].title : path.posix.basename(directory);
            const metadata = await readAudiobookMetadata(audiobooksDirectory, directory, fsApi);
            let metadataModifiedAt = null;
            if (Object.keys(metadata).length > 0) {
                try {
                    const directoryPath = resolveAudiobookDirectoryPath(audiobooksDirectory, directory);
                    const metadataStats = await fsApi.stat(path.join(directoryPath, METADATA_FILE_NAME));
                    metadataModifiedAt = metadataStats.mtime instanceof Date
                        ? metadataStats.mtime.toISOString()
                        : new Date(metadataStats.mtimeMs).toISOString();
                } catch {
                    metadataModifiedAt = null;
                }
            }

            return {
                id: directory,
                title: metadata.title || displayName(folderName),
                folder: directory,
                coverPath: cover?.relativePath || null,
                trackCount: tracks.length,
                totalSize: tracks.reduce((total, track) => total + track.size, 0),
                formats: [...new Set(tracks.map((track) => track.format))],
                modifiedAt: latestModifiedAt,
                updatedAt: metadataModifiedAt && metadataModifiedAt > latestModifiedAt
                    ? metadataModifiedAt
                    : latestModifiedAt,
                author: metadata.author || '',
                narrator: metadata.narrator || '',
                series: metadata.series || null,
                seriesSequence: metadata.seriesSequence || null,
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
    createStaleWhileRevalidateLoader,
    AUDIO_CONTENT_TYPES,
    COVER_EXTENSIONS,
    MANAGED_COVER_PREFIX,
    METADATA_FILE_NAME,
    AudiobookCatalogError,
    findAudiobookByFolder,
    enrichAudiobookDurations,
    getAudiobookContentType,
    isSafariUserAgent,
    normalizeRelativeAssetPath,
    probeAudioDuration,
    readAudiobookMetadata,
    resolveAudiobookAudioPath,
    resolveAudiobookCoverPath,
    resolveAudiobookDirectoryPath,
    sanitizeAudiobookMetadata,
    writeAudiobookMetadata,
    scanAudiobookCatalog
};
