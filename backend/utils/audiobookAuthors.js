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

const splitFullName = (fullName) => {
    const parts = normalizeFullName(fullName).split(' ').filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return { author_name: parts[0], author_lastname: '' };
    return {
        author_name: parts.slice(0, -1).join(' '),
        author_lastname: parts.at(-1)
    };
};

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

const findOrCreateAuthorByName = async (db, fullName) => {
    const normalizedName = normalizeFullName(fullName);
    if (!normalizedName) return null;

    const existingAuthor = await dbGet(
        db,
        `SELECT * FROM Authors
         WHERE LOWER(TRIM(author_name || ' ' || author_lastname)) = LOWER(?)
         ORDER BY ID
         LIMIT 1`,
        [normalizedName]
    );
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
        const audiobook = await ensureAudiobookRecord(db, item.folder);
        let authors = await getAudiobookAuthors(db, audiobook.ID);

        if (authors.length === 0 && normalizeFullName(legacyAuthorName)) {
            await linkLegacyAuthor(db, audiobook, legacyAuthorName);
            authors = await getAudiobookAuthors(db, audiobook.ID);
        }

        enrichedCatalog.push({
            ...normalizedItem,
            id: item.id,
            audiobookId: audiobook.ID,
            authors
        });
    }

    const activeFolders = catalog.map((item) => item.folder);
    if (activeFolders.length === 0) {
        await dbRun(db, 'DELETE FROM Audiobooks');
    } else {
        const placeholders = activeFolders.map(() => '?').join(', ');
        await dbRun(
            db,
            `DELETE FROM Audiobooks WHERE audiobook_folder NOT IN (${placeholders})`,
            activeFolders
        );
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
    normalizeAuthorIds,
    replaceAudiobookAuthors,
    splitFullName
};
