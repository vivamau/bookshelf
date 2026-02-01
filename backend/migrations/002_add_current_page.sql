-- Migration to add book_current_page to BooksUsers table
ALTER TABLE BooksUsers ADD COLUMN book_current_page INTEGER DEFAULT 0;
