const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const db = require('./config/db');

const migrationsPath = path.resolve(__dirname, 'migrations');

db.serialize(() => {
    // Create migrations table
    db.run(`CREATE TABLE IF NOT EXISTS Migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        applied_at INTEGER
    )`);

    // Get applied migrations
    db.all("SELECT name FROM Migrations", (err, rows) => {
        if (err) {
            console.error("Error reading migrations:", err);
            return;
        }
        const appliedMigrations = new Set(rows.map(row => row.name));
        
        fs.readdir(migrationsPath, (err, files) => {
            if (err) {
                console.error("Error reading migrations directory:", err);
                return;
            }
            
            const migrationFiles = files.filter(f => f.endsWith('.sql')).sort();
            
            migrationFiles.forEach(file => {
                if (!appliedMigrations.has(file)) {
                    const filePath = path.join(migrationsPath, file);
                    const sql = fs.readFileSync(filePath, 'utf8');
                    console.log(`Applying migration: ${file}`);
                    db.exec(sql, (err) => {
                        if (err) {
                            console.error(`Error applying migration ${file}:`, err);
                        } else {
                            db.run("INSERT INTO Migrations (name, applied_at) VALUES (?, ?)", [file, Date.now()], (err) => {
                                if (err) console.error("Error recording migration:", err);
                                else console.log(`Migration ${file} applied successfully.`);
                            });
                        }
                    });
                } else {
                   // console.log(`Skipping applied migration: ${file}`);
                }
            });
        });
    });
});
