class AudiobookAuthorError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'AudiobookAuthorError';
        this.statusCode = statusCode;
    }
}

const dbRun = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

const dbGet = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
        if (error) reject(error);
        else resolve(row);
    });
});

const dbAll = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows);
    });
});

const normalizeFullName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const CENTRAL_METADATA_FIELDS = [
    'title',
    'narrator',
    'series',
    'seriesSequence',
    'language',
    'description',
    'publishedYear'
];

const parseCentralMetadata = (value) => {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(CENTRAL_METADATA_FIELDS
            .filter((field) => Object.prototype.hasOwnProperty.call(parsed, field))
            .map((field) => [field, parsed[field]]));
    } catch {
        return {};
    }
};

const parseCatalogSnapshot = (value) => {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        if (!Array.isArray(parsed.tracks) || parsed.tracks.length === 0) return {};
        return parsed;
    } catch {
        return {};
    }
};

const getCatalogSnapshot = (item) => {
    const tracks = Array.isArray(item.tracks) ? item.tracks : [];
    return {
        id: item.id,
        coverPath: item.coverPath || null,
        coverModifiedAt: item.coverModifiedAt || null,
        trackCount: Number(item.trackCount) || tracks.length,
        totalSize: Number(item.totalSize) || 0,
        formats: Array.isArray(item.formats) ? item.formats : [],
        modifiedAt: item.modifiedAt || null,
        updatedAt: item.updatedAt || item.modifiedAt || null,
        destinationId: item.destinationId ?? 'default',
        destinationName: item.destinationName || 'Built-in storage',
        tracks: tracks.map((track) => ({
            title: track.title,
            path: track.path,
            format: track.format,
            size: Number(track.size) || 0,
            mimeType: track.mimeType,
            modifiedAt: track.modifiedAt,
            duration: Number(track.duration) || 0
        }))
    };
};

const getScannedMetadata = (item) => Object.fromEntries(CENTRAL_METADATA_FIELDS.map((field) => [
    field,
    item[field] ?? (field === 'publishedYear' ? null : '')
]));

const splitFullName = (fullName) => {
    const parts = normalizeFullName(fullName).split(' ').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return { author_name: parts[0], author_lastname: '' };
    return {
        author_name: parts.slice(0, -1).join(' '),
        author_lastname: parts.at(-1)
    };
};

const isSqliteStorageError = (error) => String(error?.code || '').startsWith('SQLITE_');

const ensureAudiobookRecord = async (db, folder) => {
    const normalizedFolder = String(folder || '').trim();
    if (!normalizedFolder) throw new AudiobookAuthorError('Audiobook folder is required');

    const now = Date.now();
    await dbRun(
        db,
        `INSERT INTO Audiobooks (audiobook_folder, audiobook_create_date, audiobook_update_date)
         VALUES (?, ?, ?)
         ON CONFLICT(audiobook_folder) DO NOTHING`,
        [normalizedFolder, now, now]
    );
    return dbGet(db, 'SELECT * FROM Audiobooks WHERE audiobook_folder = ?', [normalizedFolder]);
};

const findAuthorByName = async (db, fullName) => {
    const normalizedName = normalizeFullName(fullName);
    if (!normalizedName) return null;

    return dbGet(
        db,
        `SELECT * FROM Authors
         WHERE LOWER(TRIM(author_name || ' ' || author_lastname)) = LOWER(?)
         ORDER BY ID
        LIMIT 1`,
        [normalizedName]
    );
};

const findOrCreateAuthorByName = async (db, fullName) => {
    const normalizedName = normalizeFullName(fullName);
    if (!normalizedName) return null;

    const existingAuthor = await findAuthorByName(db, normalizedName);
    if (existingAuthor) return existingAuthor;

    const name = splitFullName(normalizedName);
    const now = Date.now();
    const result = await dbRun(
        db,
        `INSERT INTO Authors (
            author_name, author_lastname, author_create_date, author_update_date
         ) VALUES (?, ?, ?, ?)`,
        [name.author_name, name.author_lastname, now, now]
    );
    return dbGet(db, 'SELECT * FROM Authors WHERE ID = ?', [result.lastID]);
};

const getAudiobookAuthors = (db, audiobookId) => dbAll(
    db,
    `SELECT a.*
     FROM Authors a
     JOIN AudiobooksAuthors aa ON aa.author_id = a.ID
     WHERE aa.audiobook_id = ?
     ORDER BY aa.ID`,
    [audiobookId]
);

const updateAudiobookMetadata = async (db, folder, metadata) => {
    const audiobook = await ensureAudiobookRecord(db, folder);
    const normalizedMetadata = parseCentralMetadata(metadata);
    await dbRun(
        db,
        `UPDATE Audiobooks
         SET audiobook_metadata = ?, audiobook_update_date = ?
         WHERE ID = ?`,
        [JSON.stringify(normalizedMetadata), Date.now(), audiobook.ID]
    );
    return normalizedMetadata;
};

const updateAudiobookCatalogSnapshot = async (db, folder, item) => {
    const audiobook = await ensureAudiobookRecord(db, folder);
    const catalogSnapshot = JSON.stringify(getCatalogSnapshot(item));
    const now = Date.now();
    await dbRun(
        db,
        `UPDATE Audiobooks
         SET audiobook_catalog = ?,
             audiobook_update_date = CASE
                 WHEN audiobook_catalog = ? THEN audiobook_update_date
                 ELSE ?
             END
         WHERE ID = ?`,
        [catalogSnapshot, catalogSnapshot, now, audiobook.ID]
    );
    return parseCatalogSnapshot(catalogSnapshot);
};

const loadAudiobookCatalogFromDatabase = async (db) => {
    const [audiobooks, authorRows, genreRows] = await Promise.all([
        dbAll(
            db,
            `SELECT * FROM Audiobooks
             WHERE audiobook_catalog IS NOT NULL AND audiobook_catalog <> '{}'
             ORDER BY ID`
        ),
        dbAll(
            db,
            `SELECT aa.audiobook_id, a.*
             FROM AudiobooksAuthors aa
             JOIN Authors a ON a.ID = aa.author_id
             ORDER BY aa.ID`
        ),
        dbAll(
            db,
            `SELECT ag.audiobook_id, g.*
             FROM AudiobooksGeneres ag
             JOIN Generes g ON g.ID = ag.genere_id
             ORDER BY g.genere_title COLLATE NOCASE, g.ID`
        )
    ]);
    const authorsByAudiobook = new Map();
    authorRows.forEach(({ audiobook_id: audiobookId, ...author }) => {
        if (!authorsByAudiobook.has(audiobookId)) authorsByAudiobook.set(audiobookId, []);
        authorsByAudiobook.get(audiobookId).push(author);
    });
    const genresByAudiobook = new Map();
    genreRows.forEach(({ audiobook_id: audiobookId, ...genre }) => {
        if (!genresByAudiobook.has(audiobookId)) genresByAudiobook.set(audiobookId, []);
        genresByAudiobook.get(audiobookId).push(genre);
    });

    return audiobooks.map((audiobook) => {
        const snapshot = parseCatalogSnapshot(audiobook.audiobook_catalog);
        if (Object.keys(snapshot).length === 0) return null;
        const metadata = parseCentralMetadata(audiobook.audiobook_metadata);
        const centralUpdatedAt = Number.isFinite(Number(audiobook.audiobook_update_date))
            ? new Date(Number(audiobook.audiobook_update_date)).toISOString()
            : null;
        return {
            ...snapshot,
            ...metadata,
            id: snapshot.id || audiobook.audiobook_folder,
            folder: audiobook.audiobook_folder,
            audiobookId: audiobook.ID,
            updatedAt: centralUpdatedAt && (!snapshot.updatedAt || centralUpdatedAt > snapshot.updatedAt)
                ? centralUpdatedAt
                : snapshot.updatedAt,
            authors: authorsByAudiobook.get(audiobook.ID) || [],
            genres: genresByAudiobook.get(audiobook.ID) || []
        };
    }).filter(Boolean);
};

const linkLegacyAuthor = async (db, audiobook, legacyAuthorName) => {
    const author = await findOrCreateAuthorByName(db, legacyAuthorName);
    if (!author) return;
    await dbRun(
        db,
        `INSERT OR IGNORE INTO AudiobooksAuthors (
            audiobook_id, author_id, audiobookauthor_create_date
         ) VALUES (?, ?, ?)`,
        [audiobook.ID, author.ID, Date.now()]
    );
};

const enrichAudiobookCatalog = async (db, catalog = []) => {
    const enrichedCatalog = [];
    // Import serially so two legacy audiobooks by the same new author cannot create duplicate rows.
    for (const item of catalog) {
        const { author: legacyAuthorName, ...normalizedItem } = item;
        let audiobook = null;
        let authors = [];

        try {
            audiobook = await ensureAudiobookRecord(db, item.folder);
            let centralMetadata = parseCentralMetadata(audiobook.audiobook_metadata);
            if (Object.keys(centralMetadata).length === 0) {
                centralMetadata = getScannedMetadata(normalizedItem);
                await updateAudiobookMetadata(db, item.folder, centralMetadata);
            }
            if (Array.isArray(normalizedItem.tracks) && normalizedItem.tracks.length > 0) {
                await updateAudiobookCatalogSnapshot(db, item.folder, normalizedItem);
            }
            audiobook = await dbGet(db, 'SELECT * FROM Audiobooks WHERE ID = ?', [audiobook.ID]);
            authors = await getAudiobookAuthors(db, audiobook.ID);

            if (authors.length === 0 && normalizeFullName(legacyAuthorName)) {
                await linkLegacyAuthor(db, audiobook, legacyAuthorName);
                authors = await getAudiobookAuthors(db, audiobook.ID);
            }
        } catch (error) {
            if (!isSqliteStorageError(error)) throw error;
            console.error(`Audiobook author normalization failed for "${item.folder}":`, error);

            // Keep read endpoints available if the link tables are temporarily unavailable.
            // A matching shared Authors row is still safe to return, but legacy free text is not.
            if (normalizeFullName(legacyAuthorName)) {
                const existingAuthor = await findAuthorByName(db, legacyAuthorName).catch(() => null);
                if (existingAuthor) authors = [existingAuthor];
            }
        }

        const centralMetadata = parseCentralMetadata(audiobook?.audiobook_metadata);
        const centralUpdatedAt = Number.isFinite(Number(audiobook?.audiobook_update_date))
            ? new Date(Number(audiobook.audiobook_update_date)).toISOString()
            : null;
        enrichedCatalog.push({
            ...normalizedItem,
            ...(Object.keys(centralMetadata).length > 0 ? centralMetadata : {}),
            id: item.id,
            audiobookId: audiobook?.ID || null,
            updatedAt: centralUpdatedAt && centralUpdatedAt > normalizedItem.updatedAt
                ? centralUpdatedAt
                : normalizedItem.updatedAt,
            authors
        });
    }
    return enrichedCatalog;
};

const normalizeAuthorIds = (authorIds) => {
    if (!Array.isArray(authorIds)) {
        throw new AudiobookAuthorError('authorIds must be a list');
    }
    const normalized = [...new Set(authorIds.map((value) => Number(value)))];
    if (normalized.length > 20 || normalized.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
        throw new AudiobookAuthorError('authorIds contains an invalid author');
    }
    return normalized;
};

const replaceAudiobookAuthors = async (db, folder, authorIds) => {
    const normalizedIds = normalizeAuthorIds(authorIds);
    const audiobook = await ensureAudiobookRecord(db, folder);

    if (normalizedIds.length > 0) {
        const placeholders = normalizedIds.map(() => '?').join(', ');
        const existingAuthors = await dbAll(
            db,
            `SELECT ID FROM Authors WHERE ID IN (${placeholders})`,
            normalizedIds
        );
        if (existingAuthors.length !== normalizedIds.length) {
            throw new AudiobookAuthorError('One or more selected authors do not exist', 404);
        }
    }

    await dbRun(db, 'BEGIN IMMEDIATE TRANSACTION');
    try {
        await dbRun(db, 'DELETE FROM AudiobooksAuthors WHERE audiobook_id = ?', [audiobook.ID]);
        for (const authorId of normalizedIds) {
            await dbRun(
                db,
                `INSERT INTO AudiobooksAuthors (
                    audiobook_id, author_id, audiobookauthor_create_date
                 ) VALUES (?, ?, ?)`,
                [audiobook.ID, authorId, Date.now()]
            );
        }
        await dbRun(
            db,
            'UPDATE Audiobooks SET audiobook_update_date = ? WHERE ID = ?',
            [Date.now(), audiobook.ID]
        );
        await dbRun(db, 'COMMIT');
    } catch (error) {
        await dbRun(db, 'ROLLBACK').catch(() => undefined);
        throw error;
    }

    return getAudiobookAuthors(db, audiobook.ID);
};

const deleteAudiobookRecord = (db, folder) => dbRun(
    db,
    'DELETE FROM Audiobooks WHERE audiobook_folder = ?',
    [folder]
);

module.exports = {
    AudiobookAuthorError,
    deleteAudiobookRecord,
    enrichAudiobookCatalog,
    findOrCreateAuthorByName,
    loadAudiobookCatalogFromDatabase,
    normalizeAuthorIds,
    parseCatalogSnapshot,
    parseCentralMetadata,
    replaceAudiobookAuthors,
    splitFullName,
    updateAudiobookCatalogSnapshot,
    updateAudiobookMetadata
};
