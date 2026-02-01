--
-- File generated with SQLiteStudio v3.4.13 on Sun Feb 1 09:54:27 2026
--
-- Text encoding used: UTF-8
--
PRAGMA foreign_keys = off;
BEGIN TRANSACTION;

-- Table: Authors
CREATE TABLE IF NOT EXISTS Authors (
    ID                 INTEGER PRIMARY KEY
                               UNIQUE
                               NOT NULL,
    author_name        TEXT    NOT NULL,
    author_lastname    TEXT    NOT NULL,
    author_wiki        TEXT,
    author_avatar      TEXT,
    author_create_date INTEGER,
    author_update_date INTEGER
);


-- Table: Books
CREATE TABLE IF NOT EXISTS Books (
    ID                INTEGER PRIMARY KEY
                              UNIQUE
                              NOT NULL,
    book_title        TEXT    NOT NULL,
    book_summary      TEXT,
    book_isbn         TEXT    DEFAULT [n.a.],
    book_isbn_13      TEXT    DEFAULT [n.a.],
    book_cover_img    TEXT,
    book_filename     TEXT,
    book_entry_point  TEXT,
    book_spine        TEXT,
    book_date         INTEGER,
    language_id       INTEGER REFERENCES Languages (ID),
    book_format_id    INTEGER REFERENCES Formats (ID),
    book_downloads    INTEGER DEFAULT (0),
    book_publisher_id INTEGER REFERENCES Publishers (ID),
    book_create_date  INTEGER,
    book_update_date  INTEGER
);


-- Table: BooksAuthors
CREATE TABLE IF NOT EXISTS BooksAuthors (
    ID                     INTEGER PRIMARY KEY
                                   NOT NULL
                                   UNIQUE,
    author_id              INTEGER REFERENCES Authors (ID),
    book_id                INTEGER REFERENCES Books (ID),
    bookauthor_create_date INTEGER
);


-- Table: BooksGeneres
CREATE TABLE IF NOT EXISTS BooksGeneres (
    ID                       INTEGER PRIMARY KEY
                                     NOT NULL,
    book_id                  INTEGER REFERENCES Books (ID),
    genere_id                INTEGER REFERENCES Generes (ID),
    booksgeneres_create_date INTEGER
);


-- Table: BooksReadlists
CREATE TABLE IF NOT EXISTS BooksReadlists (
    ID                         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id                    INTEGER REFERENCES Books (ID),
    readlist_id                INTEGER REFERENCES Readlists (ID),
    booksreadlists_create_date INTEGER
);


-- Table: BooksUsers
CREATE TABLE IF NOT EXISTS BooksUsers (
    ID                       INTEGER PRIMARY KEY
                                     UNIQUE
                                     NOT NULL,
    book_id                  INTEGER,
    user_id                  INTEGER,
    book_started_date        INTEGER,
    book_ended_date          INTEGER,
    booksusers_create_date   INTEGER,
    booksusers_update_date   INTEGER,
    book_current_index       INTEGER DEFAULT 0,
    book_progress_percentage REAL    DEFAULT 0
);


-- Table: Formats
CREATE TABLE IF NOT EXISTS Formats (
    ID                 INTEGER PRIMARY KEY
                               NOT NULL,
    format_name        TEXT    NOT NULL,
    format_create_date INTEGER,
    format_update_date INTEGER
);


-- Table: Generes
CREATE TABLE IF NOT EXISTS Generes (
    ID                 INTEGER PRIMARY KEY
                               NOT NULL,
    genere_title       TEXT    NOT NULL,
    genere_description TEXT,
    genere_create_date INTEGER,
    genere_update_date INTEGER
);


-- Table: Languages
CREATE TABLE IF NOT EXISTS Languages (
    ID                   INTEGER PRIMARY KEY
                                 UNIQUE
                                 NOT NULL,
    language_name        TEXT    NOT NULL,
    language_create_date INTEGER,
    language_update_date INTEGER
);


-- Table: Migrations
CREATE TABLE IF NOT EXISTS Migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    applied_at INTEGER
);


-- Table: Publishers
CREATE TABLE IF NOT EXISTS Publishers (
    ID                    INTEGER PRIMARY KEY
                                  UNIQUE
                                  NOT NULL,
    publisher_name        TEXT    NOT NULL,
    publisher_website     TEXT,
    publisher_wiki        TEXT,
    publisher_description TEXT,
    publisher_create_date INTEGER,
    publisher_update_date INTEGER
);


-- Table: Readlists
CREATE TABLE IF NOT EXISTS Readlists (
    ID                   INTEGER PRIMARY KEY
                                 UNIQUE
                                 NOT NULL,
    user_id              INTEGER REFERENCES Users (ID),
    readlist_title       TEXT    NOT NULL,
    readlist_create_date INTEGER,
    readlist_update_date INTEGER,
    readlist_visible     INTEGER DEFAULT 1,
    readlist_background  TEXT
);


-- Table: Reviews
CREATE TABLE IF NOT EXISTS Reviews (
    ID                 INTEGER PRIMARY KEY
                               UNIQUE
                               NOT NULL,
    review_title       TEXT    NOT NULL,
    review_description TEXT,
    review_score       INTEGER,
    bookuser_ID        INTEGER REFERENCES BooksUsers (ID),
    review_create_date INTEGER,
    review_update_date INTEGER
);


-- Table: ScanDirectories
CREATE TABLE IF NOT EXISTS ScanDirectories (
    ID         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT    UNIQUE,
    created_at INTEGER
);


-- Table: UserRoles
CREATE TABLE IF NOT EXISTS UserRoles (
    ID                   INTEGER PRIMARY KEY
                                 UNIQUE
                                 NOT NULL,
    userrole_name        TEXT    NOT NULL
                                 UNIQUE,
    userrole_description TEXT,
    userrole_manageusers INTEGER DEFAULT (0),
    userrole_managebooks INTEGER DEFAULT (0),
    userrole_readbooks   INTEGER DEFAULT (0),
    userrole_viewbooks   INTEGER DEFAULT (1),
    userrole_create_date INTEGER,
    userrole_update_date INTEGER
);


-- Table: Users
CREATE TABLE IF NOT EXISTS Users (
    ID                 INTEGER PRIMARY KEY
                               UNIQUE
                               NOT NULL,
    user_username      TEXT    NOT NULL
                               UNIQUE,
    user_email         TEXT    NOT NULL
                               UNIQUE,
    user_name          TEXT,
    user_lastname      TEXT,
    user_avatar        TEXT    DEFAULT [https://api.dicebear.com/7.x/avataaars/svg?seed=undefined],
    user_password      BLOB,
    user_oidc_provider TEXT,
    userrole_id        INTEGER REFERENCES UserRoles (ID),
    user_create_date   INTEGER,
    user_update_date   INTEGER
);


COMMIT TRANSACTION;
PRAGMA foreign_keys = on;
