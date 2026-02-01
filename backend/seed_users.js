const defaultDb = require('./config/db');
const bcrypt = require('bcryptjs');

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

const seedUsers = (dbInstance) => {
    const db = dbInstance || defaultDb;
    return new Promise((resolve, reject) => {
        const now = Date.now();
        
        db.serialize(async () => {
            // Check if admin exists to avoid re-seeding if not needed, or just use INSERT OR IGNORE if username is unique
            // But passwords are hashed, so checking existence is better.
            
            // For simplicity in this "startup" context, let's only Insert if NOT exists.
            // Using a simple check for 'admin'
            
            db.get("SELECT COUNT(*) as count FROM Users", async (err, row) => {
                if (err) return reject(err);
                if (row && row.count > 0) {
                    // Users exist, skip seeding
                    return resolve();
                }

                console.log('Seeding initial users...');
                
                try {
                    for (const user of users) {
                        const hashedPassword = await bcrypt.hash(user.password, 10);
                        await new Promise((res, rej) => {
                            db.run(
                                `INSERT INTO Users (user_username, user_email, user_password, userrole_id, user_create_date, user_update_date) 
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [user.username, user.email, hashedPassword, user.role_id, now, now],
                                (err) => {
                                    if (err) rej(err);
                                    else {
                                        console.log(`User ${user.username} seeded successfully.`);
                                        res();
                                    }
                                }
                            );
                        });
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    });
};

if (require.main === module) {
    seedUsers(defaultDb).then(() => {
        setTimeout(() => defaultDb.close(), 1000);
    }).catch(console.error);
}

module.exports = seedUsers;
