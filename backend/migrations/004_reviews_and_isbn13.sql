-- Add new columns to Books table
-- SQLite doesn't support IF NOT EXISTS for ADD COLUMN, but this migration is marked as applied.
ALTER TABLE Books ADD COLUMN book_isbn_13 TEXT;
ALTER TABLE Books ADD COLUMN book_entry_point TEXT;
ALTER TABLE Books ADD COLUMN book_spine TEXT;

-- Create Reviews table
CREATE TABLE IF NOT EXISTS Reviews (
    ID INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    review_title TEXT NOT NULL,
    review_description TEXT,
    review_score INTEGER,
    bookuser_ID INTEGER REFERENCES BooksUsers (ID),
    review_create_date INTEGER,
    review_update_date INTEGER
);
