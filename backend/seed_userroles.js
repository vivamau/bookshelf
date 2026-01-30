const defaultDb = require('./config/db');

const seedUserRoles = (dbInstance) => {
    const db = dbInstance || defaultDb;
    return new Promise((resolve, reject) => {
        const roles = [
            {
                userrole_name: 'librarian',
                userrole_description: 'Can manage users, books and read books',
                userrole_manageusers: 1,
                userrole_managebooks: 1,
                userrole_readbooks: 1,
                userrole_viewbooks: 1
            },
            {
                userrole_name: 'reader',
                userrole_description: 'Can read books',
                userrole_manageusers: 0,
                userrole_managebooks: 0,
                userrole_readbooks: 1,
                userrole_viewbooks: 1
            },
            {
                userrole_name: 'guest',
                userrole_description: 'Cannot do anything',
                userrole_manageusers: 0,
                userrole_managebooks: 0,
                userrole_readbooks: 0,
                userrole_viewbooks: 1
            }
        ];

        db.serialize(() => {
            const now = Date.now();
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO UserRoles (
                    userrole_name,
                    userrole_description,
                    userrole_manageusers,
                    userrole_managebooks,
                    userrole_readbooks,
                    userrole_viewbooks,
                    userrole_create_date,
                    userrole_update_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, (err) => {
                if (err) return reject(err);
            });

            db.run("BEGIN TRANSACTION");
            roles.forEach(role => {
                stmt.run(
                    role.userrole_name,
                    role.userrole_description,
                    role.userrole_manageusers,
                    role.userrole_managebooks,
                    role.userrole_readbooks,
                    role.userrole_viewbooks,
                    now,
                    now
                );
            });

            db.run("COMMIT", (err) => {
                stmt.finalize();
                if (err) reject(err);
                else {
                    console.log('User roles seeded successfully.');
                    resolve();
                }
            });
        });
    });
};

if (require.main === module) {
    seedUserRoles(defaultDb).catch(console.error);
}

module.exports = seedUserRoles;
