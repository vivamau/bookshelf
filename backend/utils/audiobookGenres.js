class AudiobookGenreError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'AudiobookGenreError';
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

const isSqliteStorageError = (error) => String(error?.code || '').startsWith('SQLITE_');

const ensureAudiobookRecord = async (db, folder) => {
    const normalizedFolder = String(folder || '').trim();
    if (!normalizedFolder) throw new AudiobookGenreError('Audiobook folder is required');

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

const getAudiobookGenres = (db, audiobookId) => dbAll(
    db,
    `SELECT g.*
     FROM Generes g
     JOIN AudiobooksGeneres ag ON ag.genere_id = g.ID
     WHERE ag.audiobook_id = ?
     ORDER BY g.genere_title COLLATE NOCASE, g.ID`,
    [audiobookId]
);

const enrichAudiobookGenres = async (db, catalog = []) => {
    const enrichedCatalog = [];
    for (const item of catalog) {
        let genres = [];
        try {
            const audiobook = item.audiobookId
                ? { ID: item.audiobookId }
                : await ensureAudiobookRecord(db, item.folder);
            genres = await getAudiobookGenres(db, audiobook.ID);
        } catch (error) {
            if (!isSqliteStorageError(error)) throw error;
            console.error(`Audiobook genre enrichment failed for "${item.folder}":`, error);
        }
        enrichedCatalog.push({ ...item, genres });
    }
    return enrichedCatalog;
};

const normalizeGenreIds = (genreIds) => {
    if (!Array.isArray(genreIds)) {
        throw new AudiobookGenreError('genreIds must be a list');
    }
    const normalized = [...new Set(genreIds.map((value) => Number(value)))];
    if (normalized.length > 50 || normalized.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
        throw new AudiobookGenreError('genreIds contains an invalid genre');
    }
    return normalized;
};

const replaceAudiobookGenres = async (db, folder, genreIds) => {
    const normalizedIds = normalizeGenreIds(genreIds);
    const audiobook = await ensureAudiobookRecord(db, folder);

    if (normalizedIds.length > 0) {
        const placeholders = normalizedIds.map(() => '?').join(', ');
        const existingGenres = await dbAll(
            db,
            `SELECT ID FROM Generes WHERE ID IN (${placeholders})`,
            normalizedIds
        );
        if (existingGenres.length !== normalizedIds.length) {
            throw new AudiobookGenreError('One or more selected genres do not exist', 404);
        }
    }

    await dbRun(db, 'BEGIN IMMEDIATE TRANSACTION');
    try {
        await dbRun(db, 'DELETE FROM AudiobooksGeneres WHERE audiobook_id = ?', [audiobook.ID]);
        for (const genereId of normalizedIds) {
            await dbRun(
                db,
                `INSERT INTO AudiobooksGeneres (
                    audiobook_id, genere_id, audiobookgenere_create_date
                 ) VALUES (?, ?, ?)`,
                [audiobook.ID, genereId, Date.now()]
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

    return getAudiobookGenres(db, audiobook.ID);
};

module.exports = {
    AudiobookGenreError,
    enrichAudiobookGenres,
    normalizeGenreIds,
    replaceAudiobookGenres
};
