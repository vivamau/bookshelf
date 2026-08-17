CREATE TABLE IF NOT EXISTS AudiobooksUsers (
    ID                       INTEGER PRIMARY KEY AUTOINCREMENT,
    audiobook_folder         TEXT    NOT NULL,
    user_id                  INTEGER NOT NULL REFERENCES Users (ID) ON DELETE CASCADE,
    track_path               TEXT    NOT NULL,
    track_index              INTEGER NOT NULL DEFAULT (0),
    position_seconds         REAL    NOT NULL DEFAULT (0),
    duration_seconds         REAL    NOT NULL DEFAULT (0),
    progress_percentage      REAL    NOT NULL DEFAULT (0),
    audiobook_started_date   INTEGER,
    audiobook_ended_date     INTEGER,
    audiobooksusers_create_date INTEGER NOT NULL,
    audiobooksusers_update_date INTEGER NOT NULL,
    UNIQUE (user_id, audiobook_folder)
);
