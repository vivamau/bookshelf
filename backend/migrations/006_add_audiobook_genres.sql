CREATE TABLE IF NOT EXISTS AudiobooksGeneres (
    ID                          INTEGER PRIMARY KEY AUTOINCREMENT,
    audiobook_id                INTEGER NOT NULL REFERENCES Audiobooks (ID) ON DELETE CASCADE,
    genere_id                   INTEGER NOT NULL REFERENCES Generes (ID) ON DELETE RESTRICT,
    audiobookgenere_create_date INTEGER NOT NULL,
    UNIQUE (audiobook_id, genere_id)
);

CREATE INDEX IF NOT EXISTS idx_audiobooks_generes_genere
    ON AudiobooksGeneres (genere_id);
