const sqlite3 = require('sqlite3').verbose();
const {
    AudiobookGenreError,
    enrichAudiobookGenres,
    replaceAudiobookGenres
} = require('../../utils/audiobookGenres');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve(this);
    });
});

const close = (db) => new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
});

describe('audiobook genre repository', () => {
    let db;

    beforeEach(async () => {
        db = new sqlite3.Database(':memory:');
        await new Promise((resolve, reject) => {
            db.exec(`
                PRAGMA foreign_keys = ON;
                CREATE TABLE Generes (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    genere_title TEXT NOT NULL,
                    genere_description TEXT,
                    genere_create_date INTEGER,
                    genere_update_date INTEGER
                );
                CREATE TABLE Books (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    book_title TEXT NOT NULL
                );
                CREATE TABLE BooksGeneres (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    book_id INTEGER REFERENCES Books (ID),
                    genere_id INTEGER REFERENCES Generes (ID)
                );
                CREATE TABLE Audiobooks (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    audiobook_folder TEXT NOT NULL UNIQUE,
                    audiobook_create_date INTEGER NOT NULL,
                    audiobook_update_date INTEGER NOT NULL
                );
                CREATE TABLE AudiobooksGeneres (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    audiobook_id INTEGER NOT NULL REFERENCES Audiobooks (ID) ON DELETE CASCADE,
                    genere_id INTEGER NOT NULL REFERENCES Generes (ID) ON DELETE RESTRICT,
                    audiobookgenere_create_date INTEGER NOT NULL,
                    UNIQUE (audiobook_id, genere_id)
                );
            `, (error) => (error ? reject(error) : resolve()));
        });
    });

    afterEach(async () => close(db));

    test('links audiobooks to the same Generes rows used by ebooks', async () => {
        const genre = await run(db, 'INSERT INTO Generes (genere_title) VALUES (?)', ['FANTASY']);
        const book = await run(db, 'INSERT INTO Books (book_title) VALUES (?)', ['Earthsea']);
        await run(db, 'INSERT INTO BooksGeneres (book_id, genere_id) VALUES (?, ?)', [book.lastID, genre.lastID]);

        await replaceAudiobookGenres(db, 'Earthsea Audio', [genre.lastID, genre.lastID]);
        const [audiobook] = await enrichAudiobookGenres(db, [{
            id: 'Earthsea Audio',
            folder: 'Earthsea Audio',
            title: 'Earthsea Audio'
        }]);

        expect(audiobook.genres).toEqual([
            expect.objectContaining({ ID: genre.lastID, genere_title: 'FANTASY' })
        ]);
    });

    test('clears links and rejects unknown genre IDs', async () => {
        const genre = await run(db, 'INSERT INTO Generes (genere_title) VALUES (?)', ['MYSTERY']);
        await replaceAudiobookGenres(db, 'Detective Audio', [genre.lastID]);
        await replaceAudiobookGenres(db, 'Detective Audio', []);

        const [audiobook] = await enrichAudiobookGenres(db, [{ folder: 'Detective Audio' }]);
        expect(audiobook.genres).toEqual([]);
        await expect(replaceAudiobookGenres(db, 'Detective Audio', [999]))
            .rejects.toEqual(expect.objectContaining({
                name: 'AudiobookGenreError',
                statusCode: 404
            }));
        expect(() => {
            throw new AudiobookGenreError('invalid');
        }).toThrow(AudiobookGenreError);
    });
});
