CREATE TABLE IF NOT EXISTS Audiobooks (
    ID                    INTEGER PRIMARY KEY AUTOINCREMENT,
    audiobook_folder      TEXT    NOT NULL UNIQUE,
    audiobook_create_date INTEGER NOT NULL,
    audiobook_update_date INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS AudiobooksAuthors (
    ID                          INTEGER PRIMARY KEY AUTOINCREMENT,
    audiobook_id                INTEGER NOT NULL REFERENCES Audiobooks (ID) ON DELETE CASCADE,
    author_id                   INTEGER NOT NULL REFERENCES Authors (ID) ON DELETE RESTRICT,
    audiobookauthor_create_date INTEGER NOT NULL,
    UNIQUE (audiobook_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_audiobooks_authors_author
    ON AudiobooksAuthors (author_id);
