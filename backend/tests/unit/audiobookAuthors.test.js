const sqlite3 = require('sqlite3').verbose();
const {
    AudiobookAuthorError,
    enrichAudiobookCatalog,
    replaceAudiobookAuthors,
    splitFullName,
    updateAudiobookMetadata
} = require('../../utils/audiobookAuthors');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

const get = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
        if (error) reject(error);
        else resolve(row);
    });
});

const close = (db) => new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
});

describe('audiobook author repository', () => {
    let db;

    beforeEach(async () => {
        db = new sqlite3.Database(':memory:');
        await new Promise((resolve, reject) => {
            db.exec(`
                PRAGMA foreign_keys = ON;
                CREATE TABLE Authors (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    author_name TEXT NOT NULL,
                    author_lastname TEXT NOT NULL,
                    author_create_date INTEGER,
                    author_update_date INTEGER
                );
                CREATE TABLE Books (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    book_title TEXT NOT NULL
                );
                CREATE TABLE BooksAuthors (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    author_id INTEGER REFERENCES Authors (ID),
                    book_id INTEGER REFERENCES Books (ID)
                );
                CREATE TABLE Audiobooks (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    audiobook_folder TEXT NOT NULL UNIQUE,
                    audiobook_metadata TEXT NOT NULL DEFAULT '{}',
                    audiobook_create_date INTEGER NOT NULL,
                    audiobook_update_date INTEGER NOT NULL
                );
                CREATE TABLE AudiobooksAuthors (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    audiobook_id INTEGER NOT NULL REFERENCES Audiobooks (ID) ON DELETE CASCADE,
                    author_id INTEGER NOT NULL REFERENCES Authors (ID) ON DELETE RESTRICT,
                    audiobookauthor_create_date INTEGER NOT NULL,
                    UNIQUE (audiobook_id, author_id)
                );
            `, (error) => (error ? reject(error) : resolve()));
        });
    });

    afterEach(async () => close(db));

    test('reuses the same Authors row already linked to a book when importing legacy metadata', async () => {
        const author = await run(
            db,
            'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)',
            ['Ursula K. Le', 'Guin']
        );
        const book = await run(db, 'INSERT INTO Books (book_title) VALUES (?)', ['A Wizard of Earthsea']);
        await run(
            db,
            'INSERT INTO BooksAuthors (author_id, book_id) VALUES (?, ?)',
            [author.lastID, book.lastID]
        );

        const [audiobook] = await enrichAudiobookCatalog(db, [{
            id: 'Earthsea',
            folder: 'Earthsea',
            title: 'A Wizard of Earthsea',
            author: 'ursula k. le guin'
        }]);

        expect(audiobook.authors).toEqual([
            expect.objectContaining({ ID: author.lastID, author_name: 'Ursula K. Le', author_lastname: 'Guin' })
        ]);
        expect(audiobook).not.toHaveProperty('author');
        const links = await get(db, `
            SELECT ba.author_id AS book_author_id, aa.author_id AS audiobook_author_id
            FROM BooksAuthors ba
            JOIN AudiobooksAuthors aa ON aa.author_id = ba.author_id
            WHERE ba.book_id = ?
        `, [book.lastID]);
        expect(links).toEqual({ book_author_id: author.lastID, audiobook_author_id: author.lastID });
    });

    test('replaces audiobook links with validated author IDs and supports multiple authors', async () => {
        const first = await run(db, 'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)', ['Neil', 'Gaiman']);
        const second = await run(db, 'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)', ['Terry', 'Pratchett']);

        await replaceAudiobookAuthors(db, 'Good Omens', [first.lastID, second.lastID, first.lastID]);
        const [audiobook] = await enrichAudiobookCatalog(db, [{
            id: 'Good Omens',
            folder: 'Good Omens',
            title: 'Good Omens',
            author: 'Ignored Legacy Name'
        }]);

        expect(audiobook.authors.map((author) => author.ID)).toEqual([first.lastID, second.lastID]);
        expect(audiobook).not.toHaveProperty('author');
    });

    test('rejects author IDs that do not exist', async () => {
        await expect(replaceAudiobookAuthors(db, 'Missing Author', [999]))
            .rejects.toEqual(expect.objectContaining({
                name: 'AudiobookAuthorError',
                statusCode: 404
            }));
    });

    test('keeps central metadata when an audiobook folder is temporarily unavailable', async () => {
        await enrichAudiobookCatalog(db, [{
            id: 'Removed Collection',
            folder: 'Removed Collection',
            title: 'Removed Collection',
            author: 'Mary Shelley'
        }]);

        await enrichAudiobookCatalog(db, []);

        expect(await get(
            db,
            'SELECT * FROM Audiobooks WHERE audiobook_folder = ?',
            ['Removed Collection']
        )).toEqual(expect.objectContaining({
            audiobook_folder: 'Removed Collection'
        }));
    });

    test('imports discovered metadata centrally and keeps central edits authoritative', async () => {
        const [discovered] = await enrichAudiobookCatalog(db, [{
            id: 'Remote Collection',
            folder: '@bookshelf-destination-7/Remote Collection',
            title: 'Title from Folder Metadata',
            narrator: 'Original Narrator',
            series: 'Remote Series',
            seriesSequence: '1',
            language: 'English',
            description: 'Discovered on the storage folder',
            publishedYear: 2024,
            author: ''
        }]);
        expect(discovered.title).toBe('Title from Folder Metadata');

        const stored = await get(
            db,
            'SELECT audiobook_metadata FROM Audiobooks WHERE audiobook_folder = ?',
            ['@bookshelf-destination-7/Remote Collection']
        );
        expect(JSON.parse(stored.audiobook_metadata)).toMatchObject({
            title: 'Title from Folder Metadata',
            narrator: 'Original Narrator',
            publishedYear: 2024
        });

        await updateAudiobookMetadata(db, '@bookshelf-destination-7/Remote Collection', {
            title: 'Central Library Title',
            narrator: 'Central Narrator',
            series: '',
            seriesSequence: '',
            language: 'English',
            description: 'Stored in SQLite',
            publishedYear: 2025
        });
        const [rescanned] = await enrichAudiobookCatalog(db, [{
            id: 'Remote Collection',
            folder: '@bookshelf-destination-7/Remote Collection',
            title: 'Changed Folder Title',
            narrator: 'Changed Folder Narrator',
            author: ''
        }]);

        expect(rescanned).toMatchObject({
            title: 'Central Library Title',
            narrator: 'Central Narrator',
            description: 'Stored in SQLite',
            publishedYear: 2025
        });
    });

    test('keeps audiobook details available when link storage is unavailable', async () => {
        const author = await run(
            db,
            'INSERT INTO Authors (author_name, author_lastname) VALUES (?, ?)',
            ['Ray', 'Bradbury']
        );
        await run(db, 'DROP TABLE AudiobooksAuthors');
        await run(db, 'DROP TABLE Audiobooks');
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const [audiobook] = await enrichAudiobookCatalog(db, [{
            id: 'Ray Bradbury - Cronache marziane',
            folder: 'audiobooks/Ray Bradbury - Cronache marziane',
            title: 'Cronache marziane',
            author: 'Ray Bradbury'
        }]);

        expect(audiobook).toEqual(expect.objectContaining({
            audiobookId: null,
            title: 'Cronache marziane',
            authors: [expect.objectContaining({ ID: author.lastID })]
        }));
        expect(audiobook).not.toHaveProperty('author');
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    test('splits a legacy display name into required author columns', () => {
        expect(splitFullName('Octavia E. Butler')).toEqual({
            author_name: 'Octavia E.',
            author_lastname: 'Butler'
        });
        expect(() => {
            throw new AudiobookAuthorError('invalid');
        }).toThrow(AudiobookAuthorError);
    });
});
