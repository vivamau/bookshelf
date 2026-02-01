const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/booksshelf.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
};

const cleanDescriptions = () => {
    db.all("SELECT ID, book_summary FROM Books", [], (err, rows) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }

        console.log(`Checking ${rows.length} books...`);
        let updatedCount = 0;

        db.serialize(() => {
            rows.forEach(row => {
                if (row.book_summary) {
                    const cleaned = stripHtml(row.book_summary);
                    if (cleaned !== row.book_summary) {
                        db.run("UPDATE Books SET book_summary = ? WHERE ID = ?", [cleaned, row.ID]);
                        updatedCount++;
                    }
                }
            });
            console.log(`Scan completed. Updated ${updatedCount} books with cleaned descriptions.`);
            db.close();
        });
    });
};

cleanDescriptions();
