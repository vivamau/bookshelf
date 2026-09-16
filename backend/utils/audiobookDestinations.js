const crypto = require('crypto');
const fs = require('fs');
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

const probeAudiobookDestinationAccess = async (
    destination,
    fsApi = fs.promises,
    constants = fs.constants,
    createProbeId = () => crypto.randomUUID(),
    verifyWrite = true
) => {
    try {
        if (destination.isDefault) {
            await fsApi.mkdir(destination.path, { recursive: true });
        }
        const stats = await fsApi.stat(destination.path);
        if (!stats.isDirectory()) {
            return { isAvailable: false, isWritable: false, accessStatus: 'not-a-folder' };
        }
        await fsApi.access(destination.path, constants.R_OK);
    } catch {
        return { isAvailable: false, isWritable: false, accessStatus: 'unavailable' };
    }

    try {
        await fsApi.access(destination.path, constants.W_OK);
        return { isAvailable: true, isWritable: true, accessStatus: 'writable' };
    } catch {
        // SMB/CIFS mounts do not always expose reliable POSIX permission bits.
        // When W_OK is inconclusive, verify the capability with an actual empty file.
    }

    if (!verifyWrite) {
        return { isAvailable: true, isWritable: false, accessStatus: 'read-only' };
    }

    const probePath = path.join(
        destination.path,
        `.bookshelf-write-test-${process.pid}-${createProbeId()}`
    );
    let probeHandle;
    let probeCreated = false;
    try {
        probeHandle = await fsApi.open(probePath, 'wx', 0o600);
        probeCreated = true;
        await probeHandle.close();
        probeHandle = null;
        await fsApi.unlink(probePath);
        probeCreated = false;
        return { isAvailable: true, isWritable: true, accessStatus: 'writable' };
    } catch {
        if (probeHandle) await probeHandle.close().catch(() => undefined);
        if (probeCreated) await fsApi.unlink(probePath).catch(() => undefined);
        return { isAvailable: true, isWritable: false, accessStatus: 'read-only' };
    }
};

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
    probeAudiobookDestinationAccess,
    toVirtualAudiobookPath,
    virtualizeAudiobookCatalog
};
