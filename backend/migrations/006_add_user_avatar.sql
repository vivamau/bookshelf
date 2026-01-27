-- Add user_avatar column to Users table
ALTER TABLE Users ADD COLUMN user_avatar TEXT DEFAULT 'https://api.dicebear.com/7.x/avataaars/svg?seed=undefined';
