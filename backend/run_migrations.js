const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const defaultDb = require('./config/db');

const migrationsPath = path.resolve(__dirname, 'migrations');

const runMigrations = (dbInstance) => {
    const db = dbInstance || defaultDb;

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create migrations table
            db.run(`CREATE TABLE IF NOT EXISTS Migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                applied_at INTEGER
            )`, (err) => {
                if (err) return reject(err);
            });

            // Get applied migrations
            db.all("SELECT name FROM Migrations", (err, rows) => {
                if (err) {
                    console.error("Error reading migrations:", err);
                    return reject(err);
                }
                const appliedMigrations = new Set(rows.map(row => row.name));

                fs.readdir(migrationsPath, (err, files) => {
                    if (err) {
                        console.error("Error reading migrations directory:", err);
                        return reject(err);
                    }

                    const migrationFiles = files.filter(f => f.endsWith('.sql')).sort();

                    // Execute migrations sequentially using promises
                    let migrationChain = Promise.resolve();

                    migrationFiles.forEach(file => {
                        if (!appliedMigrations.has(file)) {
                            migrationChain = migrationChain.then(() => {
                                return new Promise((res, rej) => {
                                    const filePath = path.join(migrationsPath, file);
                                    const sql = fs.readFileSync(filePath, 'utf8');
                                    console.log(`Applying migration: ${file}`);

                                    db.exec(sql, (err) => {
                                        if (err) {
                                            if (err.message.includes('duplicate column name')) {
                                                console.log(`Migration ${file} partially applied (duplicate column), recording as applied.`);
                                                db.run("INSERT INTO Migrations (name, applied_at) VALUES (?, ?)", [file, Date.now()], (e) => {
                                                    if (e) rej(e);
                                                    else res();
                                                });
                                            } else {
                                                console.error(`Error applying migration ${file}:`, err);
                                                rej(err);
                                            }
                                        } else {
                                            db.run("INSERT INTO Migrations (name, applied_at) VALUES (?, ?)", [file, Date.now()], (e) => {
                                                if (e) {
                                                    console.error("Error recording migration:", e);
                                                    rej(e);
                                                } else {
                                                    console.log(`Migration ${file} applied successfully.`);
                                                    res();
                                                }
                                            });
                                        }
                                    });
                                });
                            });
                        }
                    });

                    migrationChain.then(() => {
                        resolve();
                    }).catch(error => {
                        reject(error);
                    });
                });
            });
        });
    });
};

if (require.main === module) {
    runMigrations(defaultDb).catch(err => {
        console.error("Migration failed:", err);
        process.exit(1);
    });
}

module.exports = runMigrations;
