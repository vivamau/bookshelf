CREATE TABLE IF NOT EXISTS Readlists (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL, 
    user_id INTEGER REFERENCES Users (ID), 
    readlist_title TEXT NOT NULL, 
    readlist_create_date INTEGER, 
    readlist_update_date INTEGER
);

CREATE TABLE IF NOT EXISTS BooksReadlists (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL, 
    book_id INTEGER REFERENCES Books (ID), 
    readlist_id INTEGER REFERENCES Readlists (ID), 
    booksreadlists_create_date INTEGER
);
