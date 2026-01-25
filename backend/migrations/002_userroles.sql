CREATE TABLE IF NOT EXISTS UserRoles (
    ID INTEGER PRIMARY KEY UNIQUE NOT NULL,
    userrole_name TEXT NOT NULL UNIQUE,
    userrole_description TEXT,
    userrole_manageusers INTEGER DEFAULT (0),
    userrole_managebooks INTEGER DEFAULT (0),
    userrole_readbooks INTEGER DEFAULT (0),
    userrole_viewbooks INTEGER DEFAULT (1),
    userrole_create_date INTEGER,
    userrole_update_date INTEGER
);

-- Link Users to UserRoles
ALTER TABLE Users ADD COLUMN userrole_id INTEGER REFERENCES UserRoles(ID);
