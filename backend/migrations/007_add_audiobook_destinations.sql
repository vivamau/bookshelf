CREATE TABLE IF NOT EXISTS AudiobookDestinations (
    ID                          INTEGER PRIMARY KEY AUTOINCREMENT,
    audiobookdestination_name  TEXT    NOT NULL,
    audiobookdestination_path  TEXT    NOT NULL UNIQUE,
    audiobookdestination_create_date INTEGER NOT NULL
);
