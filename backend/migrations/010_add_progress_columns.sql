ALTER TABLE BooksUsers ADD COLUMN book_current_index TEXT;
ALTER TABLE BooksUsers ADD COLUMN book_progress_percentage INTEGER DEFAULT 0;
