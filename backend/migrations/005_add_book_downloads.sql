-- Add book_downloads column to Books table if it doesn't exist
-- This migration is for documentation and consistency, as the field was added manually.
ALTER TABLE Books ADD COLUMN book_downloads INTEGER DEFAULT 0;
