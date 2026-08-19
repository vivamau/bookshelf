-- Preserve readable titles for records that previously fell back to a sanitized filename.
UPDATE Books
SET book_title = TRIM(REPLACE(REPLACE(REPLACE(REPLACE(book_title, '____', '_'), '__', '_'), '_', ' '), '  ', ' '))
WHERE INSTR(book_title, '_') > 0
  AND (
    (LOWER(book_filename) LIKE '%.pdf' AND book_title = SUBSTR(book_filename, 1, LENGTH(book_filename) - 4))
    OR (LOWER(book_filename) LIKE '%.epub' AND book_title = SUBSTR(book_filename, 1, LENGTH(book_filename) - 5))
    OR (LOWER(book_filename) LIKE '%.cbz' AND book_title = SUBSTR(book_filename, 1, LENGTH(book_filename) - 4))
    OR (LOWER(book_filename) LIKE '%.cbr' AND book_title = SUBSTR(book_filename, 1, LENGTH(book_filename) - 4))
    OR (LOWER(book_filename) LIKE '%.zip' AND book_title = SUBSTR(book_filename, 1, LENGTH(book_filename) - 4))
    OR (LOWER(book_filename) LIKE '%.rar' AND book_title = SUBSTR(book_filename, 1, LENGTH(book_filename) - 4))
  );

CREATE INDEX IF NOT EXISTS idx_books_authors_book_id ON BooksAuthors (book_id);
CREATE INDEX IF NOT EXISTS idx_books_authors_author_id ON BooksAuthors (author_id);
CREATE INDEX IF NOT EXISTS idx_books_generes_book_id ON BooksGeneres (book_id);
CREATE INDEX IF NOT EXISTS idx_books_generes_genere_id ON BooksGeneres (genere_id);
CREATE INDEX IF NOT EXISTS idx_books_users_book_user ON BooksUsers (book_id, user_id);
CREATE INDEX IF NOT EXISTS idx_books_format_id ON Books (book_format_id);
CREATE INDEX IF NOT EXISTS idx_books_language_id ON Books (language_id);
CREATE INDEX IF NOT EXISTS idx_books_publisher_id ON Books (book_publisher_id);
CREATE INDEX IF NOT EXISTS idx_books_create_date ON Books (book_create_date);

CREATE VIEW IF NOT EXISTS BookSearchSource AS
SELECT
    b.ID,
    REPLACE(COALESCE(b.book_title, ''), '_', ' ') AS book_title,
    COALESCE((
        SELECT GROUP_CONCAT(author_full_name, ' ')
        FROM (
            SELECT DISTINCT TRIM(COALESCE(a.author_name, '') || ' ' || COALESCE(a.author_lastname, '')) AS author_full_name
            FROM BooksAuthors ba
            JOIN Authors a ON a.ID = ba.author_id
            WHERE ba.book_id = b.ID
        )
    ), '') AS authors,
    COALESCE(b.book_summary, '') AS book_summary,
    TRIM(COALESCE(NULLIF(b.book_isbn, 'n.a.'), '') || ' ' || COALESCE(NULLIF(b.book_isbn_13, 'n.a.'), '')) AS isbn,
    COALESCE(p.publisher_name, '') AS publisher,
    COALESCE((
        SELECT GROUP_CONCAT(genere_title, ' ')
        FROM (
            SELECT DISTINCT g.genere_title
            FROM BooksGeneres bg
            JOIN Generes g ON g.ID = bg.genere_id
            WHERE bg.book_id = b.ID
        )
    ), '') AS genres,
    REPLACE(COALESCE(b.book_filename, ''), '_', ' ') AS filename
FROM Books b
LEFT JOIN Publishers p ON p.ID = b.book_publisher_id;

CREATE VIRTUAL TABLE IF NOT EXISTS BookSearch USING fts5(
    book_title,
    authors,
    book_summary,
    isbn,
    publisher,
    genres,
    filename,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3 4'
);

DELETE FROM BookSearch;
INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
FROM BookSearchSource;

CREATE TRIGGER IF NOT EXISTS books_search_after_insert
AFTER INSERT ON Books
BEGIN
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID = NEW.ID;
END;

CREATE TRIGGER IF NOT EXISTS books_search_after_update
AFTER UPDATE OF book_title, book_summary, book_isbn, book_isbn_13, book_filename, book_publisher_id ON Books
BEGIN
    DELETE FROM BookSearch WHERE rowid = NEW.ID;
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID = NEW.ID;
END;

CREATE TRIGGER IF NOT EXISTS books_search_after_delete
AFTER DELETE ON Books
BEGIN
    DELETE FROM BookSearch WHERE rowid = OLD.ID;
END;

CREATE TRIGGER IF NOT EXISTS books_authors_search_after_insert
AFTER INSERT ON BooksAuthors
BEGIN
    DELETE FROM BookSearch WHERE rowid = NEW.book_id;
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID = NEW.book_id;
END;

CREATE TRIGGER IF NOT EXISTS books_authors_search_after_update
AFTER UPDATE ON BooksAuthors
BEGIN
    DELETE FROM BookSearch WHERE rowid IN (OLD.book_id, NEW.book_id);
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID IN (OLD.book_id, NEW.book_id);
END;

CREATE TRIGGER IF NOT EXISTS books_authors_search_after_delete
AFTER DELETE ON BooksAuthors
BEGIN
    DELETE FROM BookSearch WHERE rowid = OLD.book_id;
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID = OLD.book_id;
END;

CREATE TRIGGER IF NOT EXISTS books_generes_search_after_insert
AFTER INSERT ON BooksGeneres
BEGIN
    DELETE FROM BookSearch WHERE rowid = NEW.book_id;
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID = NEW.book_id;
END;

CREATE TRIGGER IF NOT EXISTS books_generes_search_after_update
AFTER UPDATE ON BooksGeneres
BEGIN
    DELETE FROM BookSearch WHERE rowid IN (OLD.book_id, NEW.book_id);
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID IN (OLD.book_id, NEW.book_id);
END;

CREATE TRIGGER IF NOT EXISTS books_generes_search_after_delete
AFTER DELETE ON BooksGeneres
BEGIN
    DELETE FROM BookSearch WHERE rowid = OLD.book_id;
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID = OLD.book_id;
END;

CREATE TRIGGER IF NOT EXISTS authors_search_after_update
AFTER UPDATE ON Authors
BEGIN
    DELETE FROM BookSearch WHERE rowid IN (SELECT book_id FROM BooksAuthors WHERE author_id = NEW.ID);
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID IN (SELECT book_id FROM BooksAuthors WHERE author_id = NEW.ID);
END;

CREATE TRIGGER IF NOT EXISTS generes_search_after_update
AFTER UPDATE ON Generes
BEGIN
    DELETE FROM BookSearch WHERE rowid IN (SELECT book_id FROM BooksGeneres WHERE genere_id = NEW.ID);
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID IN (SELECT book_id FROM BooksGeneres WHERE genere_id = NEW.ID);
END;

CREATE TRIGGER IF NOT EXISTS publishers_search_after_update
AFTER UPDATE ON Publishers
BEGIN
    DELETE FROM BookSearch WHERE rowid IN (SELECT ID FROM Books WHERE book_publisher_id = NEW.ID);
    INSERT INTO BookSearch(rowid, book_title, authors, book_summary, isbn, publisher, genres, filename)
    SELECT ID, book_title, authors, book_summary, isbn, publisher, genres, filename
    FROM BookSearchSource
    WHERE ID IN (SELECT ID FROM Books WHERE book_publisher_id = NEW.ID);
END;
