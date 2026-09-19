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
            // Check if ANY roles exist
            db.get("SELECT COUNT(*) as count FROM UserRoles", (err, row) => {
                if (err) return reject(err);
                if (row && row.count > 0) {
                     // console.log('User roles already seeded.');
                     return resolve();
                }

                const now = Date.now();
                const insertSql = `
                    INSERT INTO UserRoles (
                        userrole_name,
                        userrole_description,
                        userrole_manageusers,
                        userrole_managebooks,
                        userrole_readbooks,
                        userrole_viewbooks,
                        userrole_create_date,
                        userrole_update_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                db.run("BEGIN TRANSACTION", (beginError) => {
                    if (beginError) return reject(beginError);

                    const insertRole = (index) => {
                        if (index >= roles.length) {
                            return db.run("COMMIT", (commitError) => {
                                if (commitError) return reject(commitError);
                                console.log('User roles seeded successfully.');
                                resolve();
                            });
                        }

                        const role = roles[index];
                        return db.run(
                            insertSql,
                            [
                                role.userrole_name,
                                role.userrole_description,
                                role.userrole_manageusers,
                                role.userrole_managebooks,
                                role.userrole_readbooks,
                                role.userrole_viewbooks,
                                now,
                                now
                            ],
                            (insertError) => {
                                if (!insertError) return insertRole(index + 1);
                                return db.run('ROLLBACK', () => reject(insertError));
                            }
                        );
                    };

                    return insertRole(0);
                });
            });
        });
    });
};

if (require.main === module) {
    seedUserRoles(defaultDb).catch(console.error);
}

module.exports = seedUserRoles;
