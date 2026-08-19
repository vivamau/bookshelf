const express = require('express');

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

const all = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});

const get = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const clampPositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const parseIdList = (value) => String(value || '')
    .split(',')
    .map((item) => Number.parseInt(item, 10))
    .filter((item, index, values) => Number.isFinite(item) && item > 0 && values.indexOf(item) === index);

const parseStringList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, values) => item && values.indexOf(item) === index)
    .slice(0, 20);

const normalizeFreeText = (value) => String(value || '')
    .normalize('NFKC')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildFtsQuery = (value) => {
    const tokens = normalizeFreeText(value).match(/[\p{L}\p{N}]+/gu) || [];
    return tokens
        .slice(0, 12)
        .map((token) => `"${token.replace(/"/g, '""')}"*`)
        .join(' AND ');
};

const escapeLike = (value) => normalizeFreeText(value).replace(/[\\%_]/g, '\\$&');

const yearExpression = "CAST(SUBSTR(CAST(b.book_date AS TEXT), 1, 4) AS INTEGER)";

const buildSearchScope = (query) => {
    const ftsQuery = buildFtsQuery(query.q);
    const joins = [
        ftsQuery ? 'JOIN BookSearch ON BookSearch.rowid = b.ID' : '',
        'LEFT JOIN Formats f ON f.ID = b.book_format_id',
        'LEFT JOIN Languages l ON l.ID = b.language_id',
        'LEFT JOIN Publishers p ON p.ID = b.book_publisher_id'
    ].filter(Boolean).join('\n');
    const conditions = ['1 = 1'];
    const params = [];

    if (ftsQuery) {
        conditions.push('BookSearch MATCH ?');
        params.push(ftsQuery);
    }

    const formats = parseStringList(query.format).map((format) => format.toUpperCase());
    if (formats.length > 0) {
        conditions.push(`UPPER(f.format_name) IN (${formats.map(() => '?').join(', ')})`);
        params.push(...formats);
    }

    const languages = parseIdList(query.language);
    if (languages.length > 0) {
        conditions.push(`b.language_id IN (${languages.map(() => '?').join(', ')})`);
        params.push(...languages);
    }

    const publishers = parseIdList(query.publisher);
    if (publishers.length > 0) {
        conditions.push(`b.book_publisher_id IN (${publishers.map(() => '?').join(', ')})`);
        params.push(...publishers);
    }

    const genres = parseIdList(query.genre);
    if (genres.length > 0) {
        conditions.push(`EXISTS (
            SELECT 1 FROM BooksGeneres selected_genres
            WHERE selected_genres.book_id = b.ID
              AND selected_genres.genere_id IN (${genres.map(() => '?').join(', ')})
        )`);
        params.push(...genres);
    }

    const authors = parseIdList(query.author);
    if (authors.length > 0) {
        conditions.push(`EXISTS (
            SELECT 1 FROM BooksAuthors selected_authors
            WHERE selected_authors.book_id = b.ID
              AND selected_authors.author_id IN (${authors.map(() => '?').join(', ')})
        )`);
        params.push(...authors);
    }

    if (query.authorName) {
        conditions.push(`EXISTS (
            SELECT 1
            FROM BooksAuthors filtered_books_authors
            JOIN Authors filtered_authors ON filtered_authors.ID = filtered_books_authors.author_id
            WHERE filtered_books_authors.book_id = b.ID
              AND TRIM(filtered_authors.author_name || ' ' || filtered_authors.author_lastname) LIKE ? ESCAPE '\\'
        )`);
        params.push(`%${escapeLike(query.authorName)}%`);
    }

    if (query.publisherName) {
        conditions.push("p.publisher_name LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(query.publisherName)}%`);
    }

    if (query.genreName) {
        conditions.push(`EXISTS (
            SELECT 1
            FROM BooksGeneres filtered_books_genres
            JOIN Generes filtered_genres ON filtered_genres.ID = filtered_books_genres.genere_id
            WHERE filtered_books_genres.book_id = b.ID
              AND filtered_genres.genere_title LIKE ? ESCAPE '\\'
        )`);
        params.push(`%${escapeLike(query.genreName)}%`);
    }

    const yearFrom = clampPositiveInteger(query.yearFrom, null, 3000);
    const yearTo = clampPositiveInteger(query.yearTo, null, 3000);
    if (yearFrom) {
        conditions.push(`${yearExpression} >= ?`);
        params.push(yearFrom);
    }
    if (yearTo) {
        conditions.push(`${yearExpression} <= ?`);
        params.push(yearTo);
    }

    return {
        ftsQuery,
        joins,
        where: conditions.join('\nAND '),
        params
    };
};

const getOrderBy = (sort, hasQuery) => {
    switch (sort) {
        case 'latest': return 'b.book_create_date DESC, b.ID DESC';
        case 'title': return 'b.book_title COLLATE NOCASE ASC, b.ID ASC';
        case 'year': return `${yearExpression} DESC, b.book_title COLLATE NOCASE ASC`;
        case 'popular': return 'b.book_downloads DESC, b.book_title COLLATE NOCASE ASC';
        case 'readers': return 'readers_count DESC, b.book_title COLLATE NOCASE ASC';
        case 'relevance':
        default:
            return hasQuery
                ? 'relevance ASC, b.book_create_date DESC, b.ID DESC'
                : 'b.book_create_date DESC, b.ID DESC';
    }
};

const createSearchRouter = (db) => {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const query = normalizeFreeText(req.query.q);
        const ftsQuery = buildFtsQuery(query);
        if (!ftsQuery || query.length < 2) {
            return res.json({ data: { books: [], authors: [], genres: [] } });
        }

        try {
            const likeQuery = `%${escapeLike(query)}%`;
            const [books, authors, genres] = await Promise.all([
                all(db, `
                    SELECT b.ID, b.book_title, b.book_cover_img, b.book_create_date,
                           bm25(BookSearch, 10.0, 7.0, 1.0, 12.0, 4.0, 4.0, 0.5) AS relevance
                    FROM BookSearch
                    JOIN Books b ON b.ID = BookSearch.rowid
                    WHERE BookSearch MATCH ?
                    ORDER BY relevance ASC, b.book_create_date DESC, b.ID DESC
                    LIMIT 5
                `, [ftsQuery]),
                all(db, `
                    SELECT ID, author_name, author_lastname, author_avatar
                    FROM Authors
                    WHERE author_name LIKE ? ESCAPE '\\' OR author_lastname LIKE ? ESCAPE '\\'
                       OR TRIM(author_name || ' ' || author_lastname) LIKE ? ESCAPE '\\'
                    ORDER BY author_lastname COLLATE NOCASE, author_name COLLATE NOCASE
                    LIMIT 5
                `, [likeQuery, likeQuery, likeQuery]),
                all(db, `
                    SELECT ID, genere_title
                    FROM Generes
                    WHERE genere_title LIKE ? ESCAPE '\\'
                    ORDER BY genere_title COLLATE NOCASE
                    LIMIT 5
                `, [likeQuery])
            ]);

            res.json({ data: { books, authors, genres } });
        } catch (err) {
            console.error('Autocomplete search error:', err);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    router.get('/books', async (req, res) => {
        const page = clampPositiveInteger(req.query.page, 1);
        const limit = clampPositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const offset = (page - 1) * limit;
        const scope = buildSearchScope(req.query);
        const facetScope = buildSearchScope({ q: req.query.q });
        const orderBy = getOrderBy(req.query.sort, Boolean(scope.ftsQuery));
        const relevanceExpression = scope.ftsQuery
            ? 'bm25(BookSearch, 10.0, 7.0, 1.0, 12.0, 4.0, 4.0, 0.5)'
            : '0';

        const fromAndWhere = `
            FROM Books b
            ${scope.joins}
            WHERE ${scope.where}
        `;

        try {
            const dataSql = `
                SELECT b.ID, b.book_title, b.book_cover_img, b.book_date, b.book_create_date,
                       b.book_format_id, b.language_id, b.book_publisher_id, b.book_downloads,
                       f.format_name, l.language_name, p.publisher_name,
                       bu.book_progress_percentage,
                       ${yearExpression} AS publication_year,
                       ${relevanceExpression} AS relevance,
                       (SELECT COUNT(*) FROM BooksUsers readers WHERE readers.book_id = b.ID) AS readers_count,
                       COALESCE((
                           SELECT GROUP_CONCAT(author_full_name, ', ')
                           FROM (
                               SELECT DISTINCT TRIM(a.author_name || ' ' || a.author_lastname) AS author_full_name
                               FROM BooksAuthors ba
                               JOIN Authors a ON a.ID = ba.author_id
                               WHERE ba.book_id = b.ID
                               ORDER BY a.author_lastname, a.author_name
                           )
                       ), '') AS authors,
                       COALESCE((
                           SELECT GROUP_CONCAT(genere_title, ', ')
                           FROM (
                               SELECT DISTINCT g.genere_title
                               FROM BooksGeneres bg
                               JOIN Generes g ON g.ID = bg.genere_id
                               WHERE bg.book_id = b.ID
                               ORDER BY g.genere_title
                           )
                       ), '') AS genres
                FROM Books b
                ${scope.joins}
                LEFT JOIN BooksUsers bu ON bu.book_id = b.ID AND bu.user_id = ?
                WHERE ${scope.where}
                ORDER BY ${orderBy}
                LIMIT ? OFFSET ?
            `;

            const countSql = `SELECT COUNT(*) AS total ${fromAndWhere}`;
            const facetBase = `
                WITH matched_books AS (
                    SELECT b.ID
                    FROM Books b
                    ${facetScope.joins}
                    WHERE ${facetScope.where}
                )
            `;

            const [rows, countRow, formats, languages, genres, publishers, authors] = await Promise.all([
                all(db, dataSql, [req.user.user_id, ...scope.params, limit, offset]),
                get(db, countSql, scope.params),
                all(db, `${facetBase}
                    SELECT f.ID, f.format_name AS label, COUNT(*) AS count
                    FROM matched_books mb
                    JOIN Books b ON b.ID = mb.ID
                    JOIN Formats f ON f.ID = b.book_format_id
                    GROUP BY f.ID, f.format_name
                    ORDER BY count DESC, label COLLATE NOCASE
                `, facetScope.params),
                all(db, `${facetBase}
                    SELECT l.ID, l.language_name AS label, COUNT(*) AS count
                    FROM matched_books mb
                    JOIN Books b ON b.ID = mb.ID
                    JOIN Languages l ON l.ID = b.language_id
                    GROUP BY l.ID, l.language_name
                    ORDER BY count DESC, label COLLATE NOCASE
                    LIMIT 20
                `, facetScope.params),
                all(db, `${facetBase}
                    SELECT g.ID, g.genere_title AS label, COUNT(DISTINCT mb.ID) AS count
                    FROM matched_books mb
                    JOIN BooksGeneres bg ON bg.book_id = mb.ID
                    JOIN Generes g ON g.ID = bg.genere_id
                    GROUP BY g.ID, g.genere_title
                    ORDER BY count DESC, label COLLATE NOCASE
                    LIMIT 20
                `, facetScope.params),
                all(db, `${facetBase}
                    SELECT p.ID, p.publisher_name AS label, COUNT(*) AS count
                    FROM matched_books mb
                    JOIN Books b ON b.ID = mb.ID
                    JOIN Publishers p ON p.ID = b.book_publisher_id
                    GROUP BY p.ID, p.publisher_name
                    ORDER BY count DESC, label COLLATE NOCASE
                    LIMIT 12
                `, facetScope.params),
                all(db, `${facetBase}
                    SELECT a.ID, TRIM(a.author_name || ' ' || a.author_lastname) AS label,
                           COUNT(DISTINCT mb.ID) AS count
                    FROM matched_books mb
                    JOIN BooksAuthors ba ON ba.book_id = mb.ID
                    JOIN Authors a ON a.ID = ba.author_id
                    GROUP BY a.ID, a.author_name, a.author_lastname
                    ORDER BY count DESC, label COLLATE NOCASE
                    LIMIT 12
                `, facetScope.params)
            ]);

            res.json({
                data: rows,
                total: countRow?.total || 0,
                page,
                limit,
                query: normalizeFreeText(req.query.q),
                facets: { formats, languages, genres, publishers, authors }
            });
        } catch (err) {
            console.error('Book search error:', err);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    return router;
};

module.exports = createSearchRouter;
module.exports.buildFtsQuery = buildFtsQuery;
module.exports.buildSearchScope = buildSearchScope;
module.exports.normalizeFreeText = normalizeFreeText;
module.exports.parseIdList = parseIdList;
