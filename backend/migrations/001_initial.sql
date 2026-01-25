CREATE TABLE IF NOT EXISTS Generes (
    ID INTEGER PRIMARY KEY NOT NULL,
    genere_title TEXT NOT NULL,
    genere_description TEXT,
    genere_create_date INTEGER,
    genere_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS Formats (
    ID INTEGER PRIMARY KEY NOT NULL,
    format_name TEXT NOT NULL,
    format_create_date INTEGER,
    format_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS Authors (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    author_name TEXT NOT NULL,
    author_lastname TEXT NOT NULL,
    author_wiki TEXT,
    author_create_date INTEGER,
    author_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS Publishers (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    publisher_name TEXT NOT NULL,
    publisher_website TEXT,
    publisher_create_date INTEGER,
    publisher_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS Languages (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    language_name TEXT NOT NULL,
    language_create_date INTEGER,
    language_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS Users (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    user_username TEXT NOT NULL UNIQUE,
    user_email TEXT NOT NULL UNIQUE,
    user_name TEXT,
    user_lastname TEXT,
    user_password BLOB,
    user_oidc_provider TEXT,
    user_create_date INTEGER,
    user_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS Books (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    book_title TEXT NOT NULL,
    book_isbn TEXT,
    book_summary TEXT,
    book_cover_img TEXT,
    book_filename TEXT,
    book_date INTEGER,
    language_id INTEGER REFERENCES Languages (ID),
    book_format_id INTEGER REFERENCES Formats (ID),
    book_publisher_id INTEGER REFERENCES Publishers (ID),
    book_create_date INTEGER,
    book_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS BooksGeneres (
    ID INTEGER PRIMARY KEY NOT NULL,
    book_id INTEGER REFERENCES Books (ID),
    genere_id INTEGER REFERENCES Generes (ID),
    booksgeneres_create_date INTEGER
);

CREATE TABLE IF NOT EXISTS BooksAuthors (
    ID INTEGER PRIMARY KEY NOT NULL UNIQUE,
    author_id INTEGER REFERENCES Authors (ID),
    book_id INTEGER REFERENCES Books (ID),
    bookauthor_create_date INTEGER
);

CREATE TABLE IF NOT EXISTS BooksUsers (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    book_id INTEGER,
    user_id INTEGER,
    book_started_date INTEGER,
    book_ended_date INTEGER,
    booksusers_create_date INTEGER,
    booksusers_update_date INTEGER
);
