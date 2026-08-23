const crypto = require('crypto');
const express = require('express');

const FALLBACK_COVER_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);
const {
    AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
    AUDIOBOOKSHELF_LIBRARY_ID,
    buildAuthorizationResponse,
    buildLibrary,
    buildLibraryItem,
    buildLibraryStats,
    buildListeningStats,
    buildMediaProgress,
    findAudiobookByItemId,
    getAudiobookDuration,
    getAudiobookshelfItemId
} = require('../utils/audiobookshelfAdapter');

const dbAll = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const dbGet = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});

const dbRun = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

const asyncRoute = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
};

const getRequestToken = (req) => {
    const authorization = req.get('authorization');
    if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
    if (req.get('x-access-token')) return req.get('x-access-token');
    if (req.query.token) return String(req.query.token);
    const cookie = String(req.get('cookie') || '').split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith('token='));
    return cookie ? cookie.slice('token='.length) : null;
};

const getUser = (db, userId) => dbGet(
    db,
    `SELECT u.*, r.userrole_name, r.userrole_manageusers, r.userrole_managebooks,
            r.userrole_readbooks, r.userrole_viewbooks
     FROM Users u
     LEFT JOIN UserRoles r ON u.userrole_id = r.ID
     WHERE u.ID = ?`,
    [userId]
);

const getProgressRows = (db, userId) => dbAll(
    db,
    'SELECT * FROM AudiobooksUsers WHERE user_id = ?',
    [userId]
);

const indexProgressRows = (rows) => new Map(rows.map((row) => [row.audiobook_folder, row]));

const normalizeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const selectProgressTrack = (audiobook, input, existingRow) => {
    const duration = normalizeNumber(input.duration);
    const currentTime = normalizeNumber(input.currentTime);
    const requestedProgress = Number(input.progress);
    const progress = input.isFinished === true
        ? 1
        : Number.isFinite(requestedProgress)
            ? Math.min(1, Math.max(0, requestedProgress))
            : duration > 0
                ? Math.min(1, currentTime / duration)
                : 0;
    const catalogDuration = getAudiobookDuration(audiobook);
    let trackIndex = existingRow
        ? audiobook.tracks.findIndex((track) => track.path === existingRow.track_path)
        : -1;
    let positionSeconds = currentTime;
    let trackDuration = duration;

    if (catalogDuration > 0) {
        let offset = 0;
        trackIndex = audiobook.tracks.findIndex((track) => {
            const nextOffset = offset + normalizeNumber(track.duration);
            if (currentTime < nextOffset || nextOffset >= catalogDuration) return true;
            offset = nextOffset;
            return false;
        });
        if (trackIndex < 0) trackIndex = audiobook.tracks.length - 1;
        positionSeconds = Math.max(0, currentTime - offset);
        trackDuration = normalizeNumber(audiobook.tracks[trackIndex].duration, duration);
    } else if (trackIndex < 0) {
        trackIndex = Math.min(audiobook.tracks.length - 1, Math.floor(progress * audiobook.tracks.length));
    }

    return {
        trackIndex,
        trackPath: audiobook.tracks[trackIndex].path,
        positionSeconds,
        durationSeconds: trackDuration,
        progressPercentage: progress * 100,
        completed: input.isFinished === true || progress >= 1
    };
};

const saveProgress = async (db, userId, audiobook, input = {}) => {
    const existing = await dbGet(
        db,
        'SELECT * FROM AudiobooksUsers WHERE audiobook_folder = ? AND user_id = ?',
        [audiobook.folder, userId]
    );
    const progress = selectProgressTrack(audiobook, input, existing);
    const now = Date.now();
    const startedAt = existing?.audiobook_started_date || input.startedAt || now;
    const finishedAt = progress.completed ? (input.finishedAt || now) : null;

    await dbRun(
        db,
        `INSERT INTO AudiobooksUsers (
            audiobook_folder, user_id, track_path, track_index, position_seconds,
            duration_seconds, progress_percentage, audiobook_started_date,
            audiobook_ended_date, audiobooksusers_create_date, audiobooksusers_update_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, audiobook_folder) DO UPDATE SET
            track_path = excluded.track_path,
            track_index = excluded.track_index,
            position_seconds = excluded.position_seconds,
            duration_seconds = excluded.duration_seconds,
            progress_percentage = excluded.progress_percentage,
            audiobook_ended_date = excluded.audiobook_ended_date,
            audiobooksusers_update_date = excluded.audiobooksusers_update_date`,
        [
            audiobook.folder,
            userId,
            progress.trackPath,
            progress.trackIndex,
            progress.positionSeconds,
            progress.durationSeconds,
            progress.progressPercentage,
            startedAt,
            finishedAt,
            existing?.audiobooksusers_create_date || now,
            now
        ]
    );

    const row = await dbGet(
        db,
        'SELECT * FROM AudiobooksUsers WHERE audiobook_folder = ? AND user_id = ?',
        [audiobook.folder, userId]
    );
    return buildMediaProgress(audiobook, row);
};

const validateLibrary = (res, libraryId) => {
    if (libraryId === AUDIOBOOKSHELF_LIBRARY_ID) return true;
    res.status(404).json({ error: 'Library not found' });
    return false;
};

const createAudiobookshelfRouters = ({
    db,
    loadAudiobookCatalog,
    audiobooksDirectory,
    resolveAudiobookAudioPath,
    resolveAudiobookCoverPath,
    getAudiobookContentType,
    serverVersion
}) => {
    const apiRouter = express.Router();
    const publicSessionRouter = express.Router();
    const sessions = new Map();

    // Some native clients treat a valid 304 with an empty body as a failed API
    // response. Ignore conditional-cache headers for compatibility JSON so the
    // client always receives a complete 200 response body.
    apiRouter.use((req, res, next) => {
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    const loadItem = async (itemId) => {
        const catalog = await loadAudiobookCatalog();
        return findAudiobookByItemId(catalog, itemId);
    };

    const streamTrack = async (req, res, audiobook, trackIndex) => {
        const track = audiobook.tracks[trackIndex];
        if (!track) return res.status(404).json({ error: 'Audio track not found' });

        let resolved;
        try {
            resolved = resolveAudiobookAudioPath(audiobooksDirectory, track.path);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Vary', 'User-Agent');
        res.type(getAudiobookContentType(resolved.relativePath, req.get('user-agent')));
        return res.sendFile(resolved.audioPath);
    };

    apiRouter.post('/authorize', asyncRoute(async (req, res) => {
        try {
            const [user, catalog, rows] = await Promise.all([
                getUser(db, req.user.user_id),
                loadAudiobookCatalog(),
                getProgressRows(db, req.user.user_id)
            ]);
            if (!user) return res.status(404).json({ error: 'User not found' });
            const catalogByFolder = new Map(catalog.map((audiobook) => [audiobook.folder, audiobook]));
            const progress = rows
                .map((row) => catalogByFolder.has(row.audiobook_folder)
                    ? buildMediaProgress(catalogByFolder.get(row.audiobook_folder), row)
                    : null)
                .filter(Boolean);
            return res.json(buildAuthorizationResponse(
                user,
                getRequestToken(req),
                progress,
                serverVersion
            ));
        } catch (error) {
            console.error('Audiobookshelf authorization failed:', error);
            return res.status(500).json({ error: 'Could not authorize Audiobookshelf client' });
        }
    }));

    apiRouter.get('/me/listening-stats', (req, res) => {
        const userSessions = [...sessions.values()].filter((session) => (
            session.userId === String(req.user.user_id)
        ));
        return res.json(buildListeningStats(userSessions));
    });

    apiRouter.get('/libraries', (req, res) => res.json({ libraries: [buildLibrary()] }));

    apiRouter.get('/libraries/:libraryId/stats', asyncRoute(async (req, res) => {
        if (!validateLibrary(res, req.params.libraryId)) return;
        try {
            return res.json(buildLibraryStats(await loadAudiobookCatalog()));
        } catch (error) {
            console.error('Audiobookshelf library stats failed:', error);
            return res.status(500).json({ error: 'Could not load library statistics' });
        }
    }));

    apiRouter.get('/libraries/:libraryId/personalized', asyncRoute(async (req, res) => {
        if (!validateLibrary(res, req.params.libraryId)) return;
        try {
            const [catalog, rows] = await Promise.all([
                loadAudiobookCatalog(),
                getProgressRows(db, req.user.user_id)
            ]);
            const progressRows = indexProgressRows(rows);
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
            const items = catalog.map((audiobook) => buildLibraryItem(audiobook, {
                progressRow: progressRows.get(audiobook.folder)
            }));
            const continuing = items.filter((item) => (
                item.userMediaProgress?.progress > 0 && !item.userMediaProgress?.isFinished
            ));
            return res.json([
                {
                    id: 'continue-listening',
                    label: 'Continue Listening',
                    labelStringKey: 'LabelContinueListening',
                    type: 'book',
                    entities: continuing.slice(0, limit),
                    total: continuing.length
                },
                {
                    id: 'recently-added',
                    label: 'Recently Added',
                    labelStringKey: 'LabelRecentlyAdded',
                    type: 'book',
                    entities: [...items].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit),
                    total: items.length
                }
            ]);
        } catch (error) {
            console.error('Audiobookshelf personalized library failed:', error);
            return res.status(500).json({ error: 'Could not load personalized library' });
        }
    }));

    apiRouter.get('/libraries/:libraryId/items', asyncRoute(async (req, res) => {
        if (!validateLibrary(res, req.params.libraryId)) return;
        try {
            const [catalog, rows] = await Promise.all([
                loadAudiobookCatalog(),
                getProgressRows(db, req.user.user_id)
            ]);
            const progressRows = indexProgressRows(rows);
            const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            const page = Math.max(0, Number.parseInt(req.query.page, 10) || 0);
            const sortBy = req.query.sort || 'media.metadata.title';
            const sortDesc = String(req.query.desc || '0') === '1';
            const items = catalog.map((audiobook) => buildLibraryItem(audiobook, {
                progressRow: progressRows.get(audiobook.folder)
            })).sort((left, right) => {
                const comparison = sortBy === 'addedAt'
                    ? left.addedAt - right.addedAt
                    : left.media.metadata.title.localeCompare(right.media.metadata.title, undefined, { numeric: true });
                return sortDesc ? -comparison : comparison;
            });
            return res.json({
                results: items.slice(page * limit, (page + 1) * limit),
                total: items.length,
                limit,
                page,
                sortBy,
                sortDesc,
                filterBy: req.query.filter || null,
                mediaType: 'book',
                minified: true,
                collapseSeries: false,
                collapseseries: false,
                offset: page * limit,
                include: req.query.include || ''
            });
        } catch (error) {
            console.error('Audiobookshelf library items failed:', error);
            return res.status(500).json({ error: 'Could not load library items' });
        }
    }));

    apiRouter.get('/libraries/:libraryId', (req, res) => {
        if (!validateLibrary(res, req.params.libraryId)) return;
        const library = buildLibrary();
        if (String(req.query.include || '').split(',').includes('filterdata')) {
            library.filterdata = {
                authors: [],
                genres: [],
                tags: [],
                series: [],
                narrators: [],
                languages: [],
                publishers: []
            };
        }
        return res.json(library);
    });

    apiRouter.get('/items/:itemId/cover', asyncRoute(async (req, res) => {
        try {
            const audiobook = await loadItem(req.params.itemId);
            if (!audiobook) return res.status(404).json({ error: 'Library item not found' });
            if (!audiobook.coverPath) {
                res.setHeader('Cache-Control', 'private, max-age=3600');
                return res.type('png').send(FALLBACK_COVER_PNG);
            }
            const cover = resolveAudiobookCoverPath(audiobooksDirectory, audiobook.coverPath);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.sendFile(cover.coverPath);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }));

    apiRouter.get('/items/:itemId/file/:trackIndex', asyncRoute(async (req, res) => {
        const audiobook = await loadItem(req.params.itemId);
        if (!audiobook) return res.status(404).json({ error: 'Library item not found' });
        return streamTrack(req, res, audiobook, Number.parseInt(req.params.trackIndex, 10));
    }));

    apiRouter.post('/items/batch/get', asyncRoute(async (req, res) => {
        const libraryItemIds = req.body?.libraryItemIds;
        if (!Array.isArray(libraryItemIds) || libraryItemIds.length === 0) {
            return res.status(403).send('Invalid payload');
        }

        const [catalog, rows] = await Promise.all([
            loadAudiobookCatalog(),
            getProgressRows(db, req.user.user_id)
        ]);
        const progressRows = indexProgressRows(rows);
        const catalogByItemId = new Map(catalog.map((audiobook) => [
            getAudiobookshelfItemId(audiobook.folder),
            audiobook
        ]));
        const libraryItems = libraryItemIds.map((itemId) => {
            const audiobook = catalogByItemId.get(String(itemId));
            return audiobook ? buildLibraryItem(audiobook, {
                expanded: true,
                progressRow: progressRows.get(audiobook.folder)
            }) : null;
        }).filter(Boolean);

        return res.json({ libraryItems });
    }));

    apiRouter.post('/items/:itemId/play', asyncRoute(async (req, res) => {
        try {
            const audiobook = await loadItem(req.params.itemId);
            if (!audiobook?.tracks?.length) return res.status(404).json({ error: 'Library item has no audio tracks' });
            const row = await dbGet(
                db,
                'SELECT * FROM AudiobooksUsers WHERE user_id = ? AND audiobook_folder = ?',
                [req.user.user_id, audiobook.folder]
            );
            const expirationThreshold = Date.now() - (24 * 60 * 60 * 1000);
            sessions.forEach((existingSession, id) => {
                if (existingSession.updatedAt < expirationThreshold) sessions.delete(id);
            });
            const sessionId = `play_${crypto.randomBytes(18).toString('hex')}`;
            const item = buildLibraryItem(audiobook, {
                expanded: true,
                progressRow: row,
                contentUrlFactory: (itemId, index) => `/public/session/${sessionId}/track/${index}`
            });
            const progress = item.userMediaProgress;
            const now = Date.now();
            const session = {
                id: sessionId,
                userId: String(req.user.user_id),
                libraryId: AUDIOBOOKSHELF_LIBRARY_ID,
                libraryItemId: item.id,
                episodeId: null,
                mediaType: 'book',
                mediaMetadata: item.media.metadata,
                chapters: item.media.chapters,
                displayTitle: audiobook.title,
                displayAuthor: item.media.metadata.authors.map((author) => author.name).join(', '),
                coverPath: item.media.coverPath,
                duration: item.media.duration,
                playMethod: 0,
                mediaPlayer: req.body.mediaPlayer || 'unknown',
                deviceInfo: req.body.deviceInfo || {},
                serverVersion: AUDIOBOOKSHELF_COMPATIBILITY_VERSION,
                date: new Date(now).toISOString().slice(0, 10),
                dayOfWeek: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now),
                timeListening: 0,
                startTime: progress?.currentTime || 0,
                currentTime: progress?.currentTime || 0,
                startedAt: now,
                updatedAt: now,
                audioTracks: item.media.tracks,
                videoTrack: null,
                libraryItem: item,
                audiobook
            };
            sessions.set(sessionId, session);
            const { audiobook: ignored, ...responseSession } = session;
            return res.json(responseSession);
        } catch (error) {
            console.error('Audiobookshelf play request failed:', error);
            return res.status(500).json({ error: 'Could not start playback' });
        }
    }));

    apiRouter.get('/items/:itemId', asyncRoute(async (req, res) => {
        try {
            const audiobook = await loadItem(req.params.itemId);
            if (!audiobook) return res.status(404).json({ error: 'Library item not found' });
            const progressRow = String(req.query.include || '').split(',').includes('progress')
                ? await dbGet(
                    db,
                    'SELECT * FROM AudiobooksUsers WHERE audiobook_folder = ? AND user_id = ?',
                    [audiobook.folder, req.user.user_id]
                )
                : null;
            return res.json(buildLibraryItem(audiobook, {
                expanded: String(req.query.expanded || '0') === '1',
                progressRow
            }));
        } catch (error) {
            console.error('Audiobookshelf item lookup failed:', error);
            return res.status(500).json({ error: 'Could not load library item' });
        }
    }));

    apiRouter.get('/me/progress', asyncRoute(async (req, res) => {
        try {
            const [catalog, rows] = await Promise.all([
                loadAudiobookCatalog(),
                getProgressRows(db, req.user.user_id)
            ]);
            const catalogByFolder = new Map(catalog.map((audiobook) => [audiobook.folder, audiobook]));
            return res.json({
                mediaProgress: rows.map((row) => (
                    catalogByFolder.has(row.audiobook_folder)
                        ? buildMediaProgress(catalogByFolder.get(row.audiobook_folder), row)
                        : null
                )).filter(Boolean)
            });
        } catch (error) {
            return res.status(500).json({ error: 'Could not load media progress' });
        }
    }));

    apiRouter.patch('/me/progress/batch/update', asyncRoute(async (req, res) => {
        if (!Array.isArray(req.body) || req.body.length === 0) {
            return res.status(400).json({ error: 'A non-empty progress list is required' });
        }
        const catalog = await loadAudiobookCatalog();
        const updates = [];
        for (const input of req.body) {
            const audiobook = findAudiobookByItemId(catalog, input.libraryItemId);
            if (!audiobook) continue;
            updates.push(await saveProgress(db, req.user.user_id, audiobook, input));
        }
        return res.json({ success: true, mediaProgress: updates });
    }));

    apiRouter.get('/me/progress/:itemId', asyncRoute(async (req, res) => {
        const audiobook = await loadItem(req.params.itemId);
        if (!audiobook) return res.status(404).json({ error: 'Library item not found' });
        const row = await dbGet(
            db,
            'SELECT * FROM AudiobooksUsers WHERE audiobook_folder = ? AND user_id = ?',
            [audiobook.folder, req.user.user_id]
        );
        if (!row) return res.status(404).json({ error: 'Media progress not found' });
        return res.json(buildMediaProgress(audiobook, row));
    }));

    apiRouter.patch('/me/progress/:itemId', asyncRoute(async (req, res) => {
        const audiobook = await loadItem(req.params.itemId);
        if (!audiobook) return res.status(404).json({ error: 'Library item not found' });
        return res.json(await saveProgress(db, req.user.user_id, audiobook, req.body));
    }));

    const updateSession = async (req, res, close) => {
        const session = sessions.get(req.params.sessionId);
        if (!session || session.userId !== String(req.user.user_id)) {
            return res.status(404).json({ error: 'Playback session not found' });
        }
        const progress = await saveProgress(db, req.user.user_id, session.audiobook, req.body);
        session.currentTime = progress.currentTime;
        session.duration = progress.duration;
        session.timeListening += normalizeNumber(req.body.timeListened);
        session.updatedAt = Date.now();
        if (close) sessions.delete(session.id);
        return res.json(close ? { success: true, progress } : { ...session, audiobook: undefined });
    };

    apiRouter.post('/session/:sessionId/sync', asyncRoute((req, res) => updateSession(req, res, false)));
    apiRouter.post('/session/:sessionId/close', asyncRoute((req, res) => updateSession(req, res, true)));

    publicSessionRouter.get('/:sessionId/track/:trackIndex', asyncRoute(async (req, res) => {
        const session = sessions.get(req.params.sessionId);
        const isExpired = session && session.updatedAt < Date.now() - (24 * 60 * 60 * 1000);
        if (!session || isExpired) {
            if (session) sessions.delete(session.id);
            return res.status(404).json({ error: 'Playback session not found' });
        }
        return streamTrack(req, res, session.audiobook, Number.parseInt(req.params.trackIndex, 10));
    }));

    return { apiRouter, publicSessionRouter };
};

module.exports = createAudiobookshelfRouters;
module.exports.getRequestToken = getRequestToken;
module.exports.saveProgress = saveProgress;
module.exports.selectProgressTrack = selectProgressTrack;
