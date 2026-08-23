const crypto = require('crypto');
const path = require('path');

const AUDIOBOOKSHELF_LIBRARY_ID = 'lib_bookshelf_audiobooks';
const AUDIOBOOKSHELF_FOLDER_ID = 'fol_bookshelf_audiobooks';
// SoundLeaf supports this pre-refresh-token Audiobookshelf contract and reads user.token.
const AUDIOBOOKSHELF_COMPATIBILITY_VERSION = '2.25.1';

const stableId = (prefix, value) => (
    `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`
);

const getAudiobookshelfItemId = (folder) => stableId('li', folder);
const getAudiobookshelfAuthorId = (authorId) => stableId('aut', authorId);
const getAudiobookshelfTrackId = (trackPath) => stableId('lf', trackPath);

const toTimestamp = (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const authorName = (author = {}) => (
    `${author.author_name || ''} ${author.author_lastname || ''}`.trim()
);

const buildAuthors = (audiobook) => (audiobook.authors || []).map((author) => ({
    id: getAudiobookshelfAuthorId(author.ID),
    name: authorName(author),
    description: null,
    imagePath: author.author_avatar || null,
    asin: null,
    addedAt: author.author_create_date || 0,
    updatedAt: author.author_update_date || author.author_create_date || 0
}));

const getTrackDuration = (track) => {
    const duration = Number(track.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

const getAudiobookDuration = (audiobook) => (
    (audiobook.tracks || []).reduce((total, track) => total + getTrackDuration(track), 0)
);

const getAudiobookAuthorsText = (audiobook) => (
    (audiobook.authors || []).map(authorName).filter(Boolean).join(', ')
);

const buildMetadata = (audiobook, expanded) => {
    const names = getAudiobookAuthorsText(audiobook);
    const common = {
        title: audiobook.title,
        titleIgnorePrefix: audiobook.title,
        subtitle: null,
        genres: [],
        publishedYear: audiobook.publishedYear ? String(audiobook.publishedYear) : null,
        publishedDate: null,
        publisher: null,
        description: audiobook.description || null,
        isbn: null,
        asin: null,
        language: audiobook.language || null,
        explicit: false
    };

    if (!expanded) {
        return {
            ...common,
            authorName: names,
            authorNameLF: names,
            narratorName: audiobook.narrator || '',
            seriesName: ''
        };
    }

    return {
        ...common,
        authors: buildAuthors(audiobook),
        narrators: audiobook.narrator ? [audiobook.narrator] : [],
        series: []
    };
};

const buildAudioTracks = (audiobook, itemId, contentUrlFactory) => {
    let startOffset = 0;
    return (audiobook.tracks || []).map((track, index) => {
        const duration = getTrackDuration(track);
        const audioTrack = {
            index,
            startOffset,
            duration,
            title: path.posix.basename(track.path),
            contentUrl: contentUrlFactory(itemId, index),
            mimeType: track.mimeType || null,
            metadata: {
                filename: path.posix.basename(track.path),
                ext: path.posix.extname(track.path).slice(1),
                path: track.path,
                relPath: track.path,
                size: track.size
            }
        };
        startOffset += duration;
        return audioTrack;
    });
};

const buildAudioFiles = (audiobook, audioTracks) => audioTracks.map((track) => ({
    index: track.index,
    ino: getAudiobookshelfTrackId(audiobook.tracks[track.index].path),
    metadata: track.metadata,
    addedAt: toTimestamp(audiobook.modifiedAt),
    updatedAt: toTimestamp(audiobook.modifiedAt),
    trackNumFromMeta: null,
    discNumFromMeta: null,
    trackNumFromFilename: track.index + 1,
    discNumFromFilename: null,
    manuallyVerified: false,
    exclude: false,
    error: null,
    format: audiobook.tracks[track.index].format,
    duration: track.duration,
    bitRate: 0,
    language: audiobook.language || null,
    codec: path.posix.extname(audiobook.tracks[track.index].path).slice(1),
    timeBase: null,
    channels: 0,
    channelLayout: null,
    chapters: [],
    embeddedCoverArt: null,
    metaTags: {},
    mimeType: track.mimeType
}));

const buildMediaProgress = (audiobook, row) => {
    if (!row) return null;
    const itemId = getAudiobookshelfItemId(audiobook.folder);
    const progress = Math.min(1, Math.max(0, Number(row.progress_percentage || 0) / 100));
    const catalogDuration = getAudiobookDuration(audiobook);
    const duration = catalogDuration || Number(row.duration_seconds || 0);
    const trackIndex = Math.max(0, audiobook.tracks.findIndex((track) => track.path === row.track_path));
    const priorDuration = catalogDuration
        ? audiobook.tracks.slice(0, trackIndex).reduce((total, track) => total + getTrackDuration(track), 0)
        : 0;

    return {
        id: itemId,
        libraryItemId: itemId,
        episodeId: null,
        duration,
        progress,
        currentTime: priorDuration + Number(row.position_seconds || 0),
        isFinished: Boolean(row.audiobook_ended_date) || progress >= 1,
        hideFromContinueListening: false,
        lastUpdate: row.audiobooksusers_update_date || 0,
        startedAt: row.audiobook_started_date || row.audiobooksusers_create_date || 0,
        finishedAt: row.audiobook_ended_date || null
    };
};

const buildLibraryItem = (audiobook, options = {}) => {
    const expanded = options.expanded === true;
    const itemId = getAudiobookshelfItemId(audiobook.folder);
    const modifiedAt = toTimestamp(audiobook.modifiedAt);
    const contentUrlFactory = options.contentUrlFactory || ((id, index) => `/api/items/${id}/file/${index}`);
    const audioTracks = buildAudioTracks(audiobook, itemId, contentUrlFactory);
    const duration = getAudiobookDuration(audiobook);
    const coverPath = audiobook.coverPath ? `/api/items/${itemId}/cover` : null;
    const media = expanded ? {
        libraryItemId: itemId,
        metadata: buildMetadata(audiobook, true),
        coverPath,
        tags: [],
        audioFiles: buildAudioFiles(audiobook, audioTracks),
        chapters: [],
        duration,
        size: audiobook.totalSize,
        tracks: audioTracks,
        ebookFile: null
    } : {
        metadata: buildMetadata(audiobook, false),
        coverPath,
        tags: [],
        numTracks: audioTracks.length,
        numAudioFiles: audioTracks.length,
        numChapters: 0,
        duration,
        size: audiobook.totalSize,
        ebookFormat: null
    };

    const item = {
        id: itemId,
        ino: stableId('ino', audiobook.folder),
        libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
        folderId: AUDIOBOOKSHELF_FOLDER_ID,
        path: `/audiobooks/${audiobook.folder}`,
        relPath: audiobook.folder,
        isFile: audiobook.folder === '.' && audiobook.tracks.length === 1,
        mtimeMs: modifiedAt,
        ctimeMs: modifiedAt,
        birthtimeMs: 0,
        addedAt: modifiedAt,
        updatedAt: modifiedAt,
        lastScan: modifiedAt,
        scanVersion: 'bookshelf-1',
        isMissing: false,
        isInvalid: false,
        mediaType: 'book',
        media,
        numFiles: audiobook.tracks.length + (audiobook.coverPath ? 1 : 0),
        size: audiobook.totalSize
    };

    const progress = buildMediaProgress(audiobook, options.progressRow);
    if (progress) item.userMediaProgress = progress;
    return item;
};

const buildLibrary = () => ({
    id: AUDIOBOOKSHELF_LIBRARY_ID,
    name: 'Audiobooks',
    folders: [{
        id: AUDIOBOOKSHELF_FOLDER_ID,
        fullPath: '/audiobooks',
        libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
        addedAt: 0
    }],
    displayOrder: 1,
    icon: 'audiobookshelf',
    mediaType: 'book',
    provider: 'audible',
    settings: {
        coverAspectRatio: 1,
        disableWatcher: true,
        skipMatchingMediaWithAsin: false,
        skipMatchingMediaWithIsbn: false,
        autoScanCronExpression: null
    },
    createdAt: 0,
    lastUpdate: Date.now()
});

const buildAudiobookshelfUser = (user, token, mediaProgress = []) => {
    const canManageBooks = Boolean(user.userrole_managebooks);
    const isAdmin = Boolean(user.userrole_manageusers);
    return {
        id: String(user.ID ?? user.id ?? user.user_id),
        username: user.user_username || user.username,
        type: isAdmin ? 'admin' : 'user',
        token,
        mediaProgress,
        seriesHideFromContinueListening: [],
        bookmarks: [],
        isActive: true,
        isLocked: false,
        lastSeen: Date.now(),
        createdAt: user.user_create_date || 0,
        permissions: {
            download: Boolean(user.userrole_readbooks),
            update: canManageBooks,
            delete: isAdmin,
            upload: canManageBooks,
            accessAllLibraries: true,
            accessAllTags: true,
            accessExplicitContent: true
        },
        librariesAccessible: [],
        itemTagsAccessible: []
    };
};

const buildServerSettings = (bookshelfVersion) => ({
    id: 'server-settings',
    scannerFindCovers: false,
    scannerCoverProvider: 'audible',
    scannerParseSubtitle: false,
    scannerPreferMatchedMetadata: false,
    scannerDisableWatcher: true,
    storeCoverWithItem: false,
    storeMetadataWithItem: true,
    metadataFileFormat: 'json',
    homeBookshelfView: 1,
    bookshelfView: 1,
    sortingIgnorePrefix: false,
    sortingPrefixes: ['the', 'a'],
    chromecastEnabled: false,
    dateFormat: 'dd/MM/yyyy',
    timeFormat: 'HH:mm',
    language: 'en-us',
    logLevel: 2,
    version: AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
    bookshelfVersion
});

const buildAuthorizationResponse = (user, token, mediaProgress, version) => ({
    user: buildAudiobookshelfUser(user, token, mediaProgress),
    userDefaultLibraryId: AUDIOBOOKSHELF_LIBRARY_ID,
    serverSettings: buildServerSettings(version),
    Source: 'bookshelf'
});

const findAudiobookByItemId = (catalog, itemId) => (
    catalog.find((audiobook) => getAudiobookshelfItemId(audiobook.folder) === itemId)
);

module.exports = {
    AUDIOBOOKSHELF_FOLDER_ID,
    AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
    AUDIOBOOKSHELF_LIBRARY_ID,
    buildAuthorizationResponse,
    buildAudiobookshelfUser,
    buildLibrary,
    buildLibraryItem,
    buildMediaProgress,
    buildServerSettings,
    findAudiobookByItemId,
    getAudiobookDuration,
    getAudiobookshelfItemId
};
