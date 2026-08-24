const crypto = require('crypto');
const path = require('path');

const AUDIOBOOKSHELF_LIBRARY_ID = 'lib_bookshelf_audiobooks';
const AUDIOBOOKSHELF_FOLDER_ID = 'fol_bookshelf_audiobooks';
// SoundLeaf supports this pre-refresh-token Audiobookshelf contract and reads user.token.
const AUDIOBOOKSHELF_COMPATIBILITY_VERSION = '2.25.1';
const LIBRARY_ITEM_SCHEMA_REVISION = 2;

const stableId = (prefix, value) => (
    `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`
);

const getAudiobookshelfItemId = (folder) => stableId('li', folder);
const getAudiobookshelfMediaId = (folder) => stableId('media', folder);
const getAudiobookshelfAuthorId = (authorId) => stableId('aut', authorId);
const getAudiobookshelfSeriesId = (seriesName) => stableId('ser', seriesName.toLowerCase());
// Audiobookshelf exposes filesystem inode values as decimal strings. Some
// native clients use that numeric shape when associating background download
// tasks with audioFiles, even though the API schema models `ino` as a string.
// Keep the value deterministic without exposing host filesystem details.
const getAudiobookshelfTrackId = (trackPath) => (
    (BigInt(`0x${crypto.createHash('sha256').update(String(trackPath)).digest('hex').slice(0, 13)}`) + 1n).toString()
);

const toTimestamp = (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const authorName = (author = {}) => (
    `${author.author_name || ''} ${author.author_lastname || ''}`.trim()
);

const authorNameLastFirst = (author = {}) => {
    const first = String(author.author_name || '').trim();
    const last = String(author.author_lastname || '').trim();
    return last ? `${last}, ${first}`.replace(/, $/, '') : first;
};

const buildExpandedAuthor = (author, numBooks = 0) => ({
    id: getAudiobookshelfAuthorId(author.ID),
    asin: null,
    name: authorName(author),
    description: null,
    imagePath: null,
    libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
    addedAt: author.author_create_date || 0,
    updatedAt: author.author_update_date || author.author_create_date || 0,
    numBooks,
    lastFirst: authorNameLastFirst(author)
});

const buildAuthors = (audiobook) => (audiobook.authors || []).map((author) => ({
    id: getAudiobookshelfAuthorId(author.ID),
    name: authorName(author),
    description: null,
    imagePath: author.author_avatar || null,
    asin: null,
    addedAt: author.author_create_date || 0,
    updatedAt: author.author_update_date || author.author_create_date || 0
}));

const buildLibraryAuthors = (catalog = []) => {
    const authors = new Map();
    catalog.forEach((audiobook) => {
        const seen = new Set();
        (audiobook.authors || []).forEach((author) => {
            if (seen.has(author.ID)) return;
            seen.add(author.ID);
            const id = getAudiobookshelfAuthorId(author.ID);
            const existing = authors.get(id);
            authors.set(id, buildExpandedAuthor(author, (existing?.numBooks || 0) + 1));
        });
    });
    return [...authors.values()].sort((left, right) => (
        left.name.localeCompare(right.name, undefined, { numeric: true })
    ));
};

const findAudiobooksByAuthorId = (catalog = [], authorId) => catalog.filter((audiobook) => (
    (audiobook.authors || []).some((author) => getAudiobookshelfAuthorId(author.ID) === authorId)
));

const getAudiobookGenreNames = (audiobook = {}) => [...new Set(
    (audiobook.genres || [])
        .map((genre) => String(
            typeof genre === 'string'
                ? genre
                : genre?.genere_title || genre?.name || ''
        ).trim())
        .filter(Boolean)
)];

const findAudiobooksByGenre = (catalog = [], genreName) => {
    const normalizedName = String(genreName || '').trim().toLocaleLowerCase();
    if (!normalizedName) return catalog;
    return catalog.filter((audiobook) => (
        getAudiobookGenreNames(audiobook)
            .some((name) => name.toLocaleLowerCase() === normalizedName)
    ));
};

const getAudiobookSeries = (audiobook) => {
    const explicitName = String(audiobook.series || '').trim();
    const segments = String(audiobook.folder || '').split('/').filter(Boolean);
    const inferredName = segments.length >= 3 ? segments.at(-2) : '';
    const name = explicitName || inferredName;
    if (!name) return null;

    const explicitSequence = String(audiobook.seriesSequence || '').trim();
    const titleSequence = /^\s*(\d+(?:\.\d+)?)\b/.exec(segments.at(-1) || audiobook.title || '');
    return {
        id: getAudiobookshelfSeriesId(name),
        name,
        sequence: explicitSequence || titleSequence?.[1] || null
    };
};

const findAudiobooksBySeriesId = (catalog = [], seriesId) => catalog.filter((audiobook) => (
    getAudiobookSeries(audiobook)?.id === seriesId
));

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

const getAudiobookshelfFileMetadataPaths = (audiobook, filePath) => ({
    path: `/audiobooks/${filePath}`,
    relPath: audiobook.folder && audiobook.folder !== '.'
        ? path.posix.relative(audiobook.folder, filePath)
        : filePath
});

const buildMetadata = (audiobook, expanded) => {
    const names = getAudiobookAuthorsText(audiobook);
    const series = getAudiobookSeries(audiobook);
    const common = {
        title: audiobook.title,
        titleIgnorePrefix: audiobook.title,
        subtitle: null,
        genres: getAudiobookGenreNames(audiobook),
        publishedYear: audiobook.publishedYear ? String(audiobook.publishedYear) : null,
        publishedDate: null,
        publisher: null,
        description: audiobook.description || null,
        descriptionPlain: audiobook.description || null,
        isbn: null,
        asin: null,
        language: audiobook.language || null,
        explicit: false,
        abridged: false
    };

    const searchableNames = {
        authorName: names,
        authorNameLF: names,
        narratorName: audiobook.narrator || '',
        seriesName: series?.name || ''
    };

    if (!expanded) return { ...common, ...searchableNames };

    return {
        ...common,
        ...searchableNames,
        authors: buildAuthors(audiobook),
        narrators: audiobook.narrator ? [audiobook.narrator] : [],
        series: series ? [series] : []
    };
};

const buildFileMetadata = (audiobook, track) => {
    const timestamp = toTimestamp(track.modifiedAt || audiobook.modifiedAt);
    const metadataPaths = getAudiobookshelfFileMetadataPaths(audiobook, track.path);
    return {
        filename: path.posix.basename(track.path),
        ext: path.posix.extname(track.path),
        ...metadataPaths,
        size: Number(track.size) || 0,
        mtimeMs: timestamp,
        ctimeMs: timestamp,
        birthtimeMs: 0
    };
};

const buildMetaTags = (audiobook, track, index) => ({
    tagAlbum: audiobook.title || '',
    tagArtist: getAudiobookAuthorsText(audiobook),
    tagGenre: getAudiobookGenreNames(audiobook).join(', '),
    tagTitle: track.title || path.posix.basename(track.path),
    tagTrack: String(index + 1),
    tagDisc: null,
    tagDate: audiobook.publishedYear ? String(audiobook.publishedYear) : null,
    tagComment: null,
    tagDescription: null,
    tagComposer: null,
    tagPublisher: null,
    tagSeries: null,
    tagSeriesPart: null,
    tagSubtitle: null,
    tagAlbumSort: null,
    tagArtistSort: null,
    tagTitleSort: null,
    tagIsbn: null,
    tagAsin: null,
    tagLanguage: audiobook.language || null,
    tagEncoder: ''
});

const buildAudioTracks = (audiobook, itemId, contentUrlFactory) => {
    let startOffset = 0;
    return (audiobook.tracks || []).map((track, index) => {
        const duration = getTrackDuration(track);
        const fileId = getAudiobookshelfTrackId(track.path);
        const audioTrack = {
            // Audiobookshelf uses 1-based public indexes. The URL factory also
            // receives the zero-based source position and stable file inode.
            index: index + 1,
            startOffset,
            duration,
            title: path.posix.basename(track.path),
            contentUrl: contentUrlFactory(itemId, index, fileId),
            mimeType: track.mimeType || null,
            metadata: buildFileMetadata(audiobook, track)
        };
        startOffset += duration;
        return audioTrack;
    });
};

const buildAudioFiles = (audiobook, audioTracks) => audioTracks.map((track) => {
    const sourceTrack = audiobook.tracks[track.index - 1];
    const timestamp = toTimestamp(sourceTrack.modifiedAt || audiobook.modifiedAt);
    return {
        index: track.index,
        ino: getAudiobookshelfTrackId(sourceTrack.path),
        metadata: track.metadata,
        addedAt: timestamp,
        updatedAt: timestamp,
        trackNumFromMeta: track.index,
        discNumFromMeta: null,
        trackNumFromFilename: null,
        discNumFromFilename: null,
        manuallyVerified: false,
        exclude: false,
        error: null,
        format: sourceTrack.format || path.posix.extname(sourceTrack.path).slice(1),
        duration: track.duration,
        bitRate: 0,
        language: audiobook.language || null,
        codec: path.posix.extname(sourceTrack.path).slice(1),
        timeBase: '1/1000',
        channels: 0,
        channelLayout: '',
        chapters: [],
        embeddedCoverArt: null,
        metaTags: buildMetaTags(audiobook, sourceTrack, track.index - 1),
        mimeType: track.mimeType
    };
});

const buildMediaChapters = (audiobook, audioTracks) => audioTracks.map((track, index) => ({
    id: index,
    start: track.startOffset,
    end: track.startOffset + track.duration,
    title: audiobook.tracks[index].title || track.title
}));

const buildLibraryFiles = (audiobook) => {
    const audioFiles = (audiobook.tracks || []).map((track) => {
        const timestamp = toTimestamp(track.modifiedAt || audiobook.modifiedAt);
        return {
            ino: getAudiobookshelfTrackId(track.path),
            metadata: buildFileMetadata(audiobook, track),
            isSupplementary: null,
            addedAt: timestamp,
            updatedAt: timestamp,
            fileType: 'audio'
        };
    });

    if (!audiobook.coverPath) return audioFiles;
    const timestamp = toTimestamp(audiobook.modifiedAt);
    return [...audioFiles, {
        ino: getAudiobookshelfTrackId(audiobook.coverPath),
        metadata: {
            filename: path.posix.basename(audiobook.coverPath),
            ext: path.posix.extname(audiobook.coverPath),
            ...getAudiobookshelfFileMetadataPaths(audiobook, audiobook.coverPath),
            size: 0,
            mtimeMs: timestamp,
            ctimeMs: timestamp,
            birthtimeMs: 0
        },
        isSupplementary: null,
        addedAt: timestamp,
        updatedAt: timestamp,
        fileType: 'image'
    }];
};

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
    const coverVersion = audiobook.coverPath ? toTimestamp(audiobook.coverModifiedAt) : 0;
    // The small schema revision makes clients replace library items cached
    // under an older compatibility payload. It remains stable until the
    // underlying metadata or cover changes again.
    const updatedAt = Math.max(
        toTimestamp(audiobook.updatedAt || audiobook.modifiedAt),
        coverVersion
    ) + (coverVersion ? LIBRARY_ITEM_SCHEMA_REVISION : 0);
    const contentUrlFactory = options.contentUrlFactory || ((id, _index, fileId) => `/api/items/${id}/file/${fileId}`);
    const audioTracks = buildAudioTracks(audiobook, itemId, contentUrlFactory);
    const audioFiles = buildAudioFiles(audiobook, audioTracks);
    const tracks = audioTracks.map((track, index) => ({
        ...audioFiles[index],
        startOffset: track.startOffset,
        title: audiobook.tracks[index].title || track.title,
        contentUrl: track.contentUrl
    }));
    const chapters = buildMediaChapters(audiobook, audioTracks);
    const libraryFiles = buildLibraryFiles(audiobook);
    const duration = getAudiobookDuration(audiobook);
    // Audiobookshelf exposes the absolute media-file path here. Clients use its
    // presence to decide whether to request /api/items/:id/cover; it is not the
    // public cover URL itself.
    const coverPath = audiobook.coverPath ? `/audiobooks/${audiobook.coverPath}` : null;
    const media = expanded ? {
        id: getAudiobookshelfMediaId(audiobook.folder),
        libraryItemId: itemId,
        metadata: buildMetadata(audiobook, true),
        coverPath,
        tags: [],
        audioFiles,
        chapters,
        numTracks: audioTracks.length,
        numAudioFiles: audioFiles.length,
        numChapters: chapters.length,
        duration,
        size: audiobook.totalSize,
        tracks,
        ebookFile: null
    } : {
        id: getAudiobookshelfMediaId(audiobook.folder),
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
        oldLibraryItemId: null,
        libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
        folderId: AUDIOBOOKSHELF_FOLDER_ID,
        path: `/audiobooks/${audiobook.folder}`,
        relPath: audiobook.folder,
        isFile: audiobook.folder === '.' && audiobook.tracks.length === 1,
        mtimeMs: updatedAt,
        ctimeMs: modifiedAt,
        birthtimeMs: 0,
        addedAt: modifiedAt,
        updatedAt,
        lastScan: updatedAt,
        scanVersion: 'bookshelf-1',
        isMissing: false,
        isInvalid: false,
        mediaType: 'book',
        media,
        numFiles: libraryFiles.length,
        size: audiobook.totalSize
    };

    if (expanded) item.libraryFiles = libraryFiles;
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
        audiobooksOnly: true,
        epubsAllowScriptedContent: false,
        hideSingleBookSeries: false,
        onlyShowLaterBooksInContinueSeries: false,
        metadataPrecedence: [
            'folderStructure',
            'audioMetatags',
            'nfoFile',
            'txtFiles',
            'opfFile',
            'absMetadata'
        ],
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10,
        skipMatchingMediaWithAsin: false,
        skipMatchingMediaWithIsbn: false,
        autoScanCronExpression: null
    },
    lastScan: 0,
    lastScanVersion: AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
    createdAt: 0,
    lastUpdate: Date.now()
});

const buildLibraryStats = (catalog = []) => {
    const authors = new Map();
    const genres = new Map();
    const summaries = catalog.map((audiobook) => {
        (audiobook.authors || []).forEach((author) => {
            const id = getAudiobookshelfAuthorId(author.ID);
            const existing = authors.get(id) || { id, name: authorName(author), count: 0 };
            existing.count += 1;
            authors.set(id, existing);
        });
        getAudiobookGenreNames(audiobook).forEach((genre) => {
            if (!genre) return;
            genres.set(genre, (genres.get(genre) || 0) + 1);
        });
        return {
            id: getAudiobookshelfItemId(audiobook.folder),
            title: audiobook.title,
            size: Number(audiobook.totalSize) || 0,
            duration: getAudiobookDuration(audiobook),
            numAudioTracks: (audiobook.tracks || []).length
        };
    });
    const authorsWithCount = [...authors.values()].sort((left, right) => (
        right.count - left.count || left.name.localeCompare(right.name)
    ));
    const genresWithCount = [...genres.entries()]
        .map(([genre, count]) => ({ genre, count }))
        .sort((left, right) => right.count - left.count || left.genre.localeCompare(right.genre));

    return {
        largestItems: [...summaries]
            .sort((left, right) => right.size - left.size)
            .slice(0, 10)
            .map(({ id, title, size }) => ({ id, title, size })),
        totalAuthors: authorsWithCount.length,
        authorsWithCount,
        totalGenres: genresWithCount.length,
        genresWithCount,
        totalItems: summaries.length,
        longestItems: [...summaries]
            .sort((left, right) => right.duration - left.duration)
            .slice(0, 10)
            .map(({ id, title, duration }) => ({ id, title, duration })),
        totalSize: summaries.reduce((total, item) => total + item.size, 0),
        totalDuration: summaries.reduce((total, item) => total + item.duration, 0),
        numAudioTracks: summaries.reduce((total, item) => total + item.numAudioTracks, 0)
    };
};

const compareSeriesAudiobooks = (left, right) => {
    const leftSequence = getAudiobookSeries(left)?.sequence;
    const rightSequence = getAudiobookSeries(right)?.sequence;
    const leftNumber = leftSequence === null ? NaN : Number(leftSequence);
    const rightNumber = rightSequence === null ? NaN : Number(rightSequence);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    if (Number.isFinite(leftNumber)) return -1;
    if (Number.isFinite(rightNumber)) return 1;
    return left.title.localeCompare(right.title, undefined, { numeric: true });
};

const buildAudiobookSeriesCatalog = (catalog = []) => {
    const seriesById = new Map();
    catalog.forEach((audiobook) => {
        const series = getAudiobookSeries(audiobook);
        if (!series) return;
        const existing = seriesById.get(series.id) || {
            id: series.id,
            name: series.name,
            audiobooks: []
        };
        existing.audiobooks.push({
            ...audiobook,
            series: series.name,
            seriesSequence: series.sequence
        });
        seriesById.set(series.id, existing);
    });

    return [...seriesById.values()].map((series) => ({
        ...series,
        audiobookCount: series.audiobooks.length,
        totalSize: series.audiobooks.reduce((total, audiobook) => total + Number(audiobook.totalSize || 0), 0),
        audiobooks: series.audiobooks.sort(compareSeriesAudiobooks)
    })).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
};

const buildLibrarySeries = (catalog = []) => buildAudiobookSeriesCatalog(catalog).map((series) => {
    const books = series.audiobooks.map((audiobook) => buildLibraryItem(audiobook));
    return {
        id: series.id,
        name: series.name,
        nameIgnorePrefix: series.name,
        description: null,
        addedAt: Math.min(...books.map((item) => item.addedAt)),
        updatedAt: Math.max(...books.map((item) => item.updatedAt)),
        libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
        books
    };
});

const buildListeningStats = (listeningSessions = [], now = Date.now()) => {
    const items = {};
    const days = {};
    const dayOfWeek = {};
    const todayKey = new Date(now).toISOString().slice(0, 10);
    const sessions = listeningSessions.map((session) => {
        const { audiobook: ignoredAudiobook, ...publicSession } = session;
        const timeListening = Math.max(0, Math.round(Number(session.timeListening) || 0));
        const date = session.date || new Date(session.startedAt || now).toISOString().slice(0, 10);
        const weekday = session.dayOfWeek || new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            timeZone: 'UTC'
        }).format(new Date(`${date}T00:00:00.000Z`));

        days[date] = (days[date] || 0) + timeListening;
        dayOfWeek[weekday] = (dayOfWeek[weekday] || 0) + timeListening;

        if (session.libraryItemId) {
            const existing = items[session.libraryItemId] || {
                id: session.libraryItemId,
                timeListening: 0,
                mediaMetadata: session.mediaMetadata || null
            };
            existing.timeListening += timeListening;
            items[session.libraryItemId] = existing;
        }

        return { ...publicSession, timeListening, date, dayOfWeek: weekday };
    }).sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));

    return {
        totalTime: sessions.reduce((total, session) => total + session.timeListening, 0),
        items,
        days,
        dayOfWeek,
        today: days[todayKey] || 0,
        recentSessions: sessions.slice(0, 10)
    };
};

const buildAudiobookshelfUser = (user, token, mediaProgress = []) => {
    const canManageBooks = Boolean(user.userrole_managebooks);
    const isAdmin = Boolean(user.userrole_manageusers);
    return {
        id: String(user.ID ?? user.id ?? user.user_id),
        username: user.user_username || user.username,
        email: user.user_email || user.email || null,
        type: isAdmin ? 'admin' : 'user',
        // Keep both fields: pre-2.26 clients read token, while current native
        // clients read accessToken from the nested user object.
        token,
        accessToken: token,
        refreshToken: null,
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
            createEreader: Boolean(user.userrole_readbooks),
            accessAllLibraries: true,
            accessAllTags: true,
            accessExplicitContent: true,
            selectedTagsNotAccessible: false
        },
        librariesAccessible: [],
        itemTagsAccessible: [],
        itemTagsSelected: [],
        hasOpenIDLink: false,
        isOldToken: false
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
    buildAudiobookSeriesCatalog,
    buildAudiobookshelfUser,
    buildLibrary,
    buildLibraryAuthors,
    buildLibraryItem,
    buildLibrarySeries,
    buildLibraryStats,
    buildListeningStats,
    buildMediaProgress,
    buildServerSettings,
    findAudiobookByItemId,
    findAudiobooksByAuthorId,
    findAudiobooksByGenre,
    findAudiobooksBySeriesId,
    getAudiobookGenreNames,
    getAudiobookSeries,
    getAudiobookDuration,
    getAudiobookshelfItemId,
    getAudiobookshelfAuthorId,
    getAudiobookshelfMediaId,
    getAudiobookshelfSeriesId,
    getAudiobookshelfTrackId
};
