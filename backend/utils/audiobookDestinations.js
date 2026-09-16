const path = require('path');

const DEFAULT_AUDIOBOOK_DESTINATION_ID = 'default';
const DESTINATION_PATH_PREFIX = '@bookshelf-destination-';

class AudiobookDestinationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'AudiobookDestinationError';
        this.statusCode = statusCode;
    }
}

const normalizeDestinationId = (destinationId) => {
    if (destinationId === undefined || destinationId === null || destinationId === '') {
        return DEFAULT_AUDIOBOOK_DESTINATION_ID;
    }
    if (destinationId === DEFAULT_AUDIOBOOK_DESTINATION_ID) return destinationId;

    const numericId = Number(destinationId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
        throw new AudiobookDestinationError('Invalid audiobook destination');
    }
    return numericId;
};

const isUnmountedNetworkPath = (serverPath) => (
    /^(?:smb|cifs):\/\//i.test(String(serverPath || '').trim())
    || /^\\\\/.test(String(serverPath || '').trim())
);

const pathsOverlap = (firstPath, secondPath) => {
    const first = path.resolve(firstPath);
    const second = path.resolve(secondPath);
    const firstToSecond = path.relative(first, second);
    const secondToFirst = path.relative(second, first);
    const isInside = (relativePath) => (
        relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    );
    return isInside(firstToSecond) || isInside(secondToFirst);
};

const toVirtualAudiobookPath = (destinationId, relativePath) => {
    const normalizedId = normalizeDestinationId(destinationId);
    const normalizedPath = String(relativePath || '.').replace(/\\/g, '/');
    if (normalizedId === DEFAULT_AUDIOBOOK_DESTINATION_ID) return normalizedPath;

    const prefix = `${DESTINATION_PATH_PREFIX}${normalizedId}`;
    return normalizedPath === '.' ? prefix : `${prefix}/${normalizedPath}`;
};

const parseVirtualAudiobookPath = (virtualPath) => {
    const normalizedPath = String(virtualPath || '').replace(/\\/g, '/');
    const match = new RegExp(`^${DESTINATION_PATH_PREFIX}(\\d+)(?:/(.*))?$`).exec(normalizedPath);
    if (!match) {
        return {
            destinationId: DEFAULT_AUDIOBOOK_DESTINATION_ID,
            relativePath: normalizedPath
        };
    }

    return {
        destinationId: normalizeDestinationId(match[1]),
        relativePath: match[2] || '.'
    };
};

const virtualizeAudiobookCatalog = (catalog, destination) => catalog.map((audiobook) => ({
    ...audiobook,
    id: toVirtualAudiobookPath(destination.id, audiobook.id),
    folder: toVirtualAudiobookPath(destination.id, audiobook.folder),
    coverPath: audiobook.coverPath
        ? toVirtualAudiobookPath(destination.id, audiobook.coverPath)
        : null,
    destinationId: destination.id,
    destinationName: destination.name,
    tracks: audiobook.tracks.map((track) => ({
        ...track,
        path: toVirtualAudiobookPath(destination.id, track.path)
    }))
}));

module.exports = {
    AudiobookDestinationError,
    DEFAULT_AUDIOBOOK_DESTINATION_ID,
    DESTINATION_PATH_PREFIX,
    isUnmountedNetworkPath,
    normalizeDestinationId,
    parseVirtualAudiobookPath,
    pathsOverlap,
    toVirtualAudiobookPath,
    virtualizeAudiobookCatalog
};
