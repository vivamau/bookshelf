const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'booksshelf.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

const users = [
    {
        username: 'admin',
        email: 'admin@bookshelf.com',
        password: 'adminpassword',
        role_id: 1 // librarian
    },
    {
        username: 'reader1',
        email: 'reader@bookshelf.com',
        password: 'readerpassword',
        role_id: 2 // reader
    },
    {
        username: 'guest1',
        email: 'guest@bookshelf.com',
        password: 'guestpassword',
        role_id: 3 // guest
    }
];

const seedUsers = async () => {
    const now = Date.now();
    
    // Clear existing test users if any
    db.run("DELETE FROM Users WHERE user_username IN ('admin', 'reader1', 'guest1')");

    for (const user of users) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        db.run(
            `INSERT INTO Users (user_username, user_email, user_password, userrole_id, user_create_date, user_update_date) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user.username, user.email, hashedPassword, user.role_id, now, now],
            (err) => {
                if (err) {
                    console.error(`Error seeding user ${user.username}:`, err.message);
                } else {
                    console.log(`User ${user.username} seeded successfully.`);
                }
            }
        );
    }
};

db.serialize(() => {
    seedUsers().then(() => {
        // Give some time for async operations to finish before closing
        setTimeout(() => db.close(), 1000);
    });
});
