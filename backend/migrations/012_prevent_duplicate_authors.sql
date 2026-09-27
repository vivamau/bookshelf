CREATE TRIGGER IF NOT EXISTS prevent_duplicate_authors_insert
BEFORE INSERT ON Authors
WHEN EXISTS (
    SELECT 1
    FROM Authors
    WHERE LOWER(TRIM(author_name || ' ' || author_lastname))
        = LOWER(TRIM(NEW.author_name || ' ' || NEW.author_lastname))
)
BEGIN
    SELECT RAISE(ABORT, 'duplicate author');
END;
