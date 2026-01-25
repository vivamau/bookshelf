const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/booksshelf.db');

const userId = 1; // admin
const bookId = 1;

    const sql = `
        SELECT b.ID, b.book_title, b.book_isbn, b.book_summary, b.book_cover_img, 
               b.book_date, b.book_create_date, b.book_filename, b.book_entry_point, b.book_spine,
               l.language_name, 
               f.format_name, 
               p.publisher_name,
               bu.book_current_index,
               bu.book_progress_percentage,
               (SELECT COUNT(*) FROM BooksUsers WHERE book_id = b.ID) as readers_count,
               GROUP_CONCAT(a.ID || '::' || a.author_name || ' ' || a.author_lastname, '||') AS authors_data
        FROM Books b
        LEFT JOIN Languages l ON b.language_id = l.ID
        LEFT JOIN Formats f ON b.book_format_id = f.ID
        LEFT JOIN Publishers p ON b.book_publisher_id = p.ID
        LEFT JOIN BooksAuthors ba ON b.ID = ba.book_id
        LEFT JOIN Authors a ON ba.author_id = a.ID
        LEFT JOIN BooksUsers bu ON b.ID = bu.book_id AND bu.user_id = ?
        WHERE b.ID = ?
        GROUP BY b.ID
    `;

db.get(sql, [userId, bookId], (err, row) => {
    if (err) console.error(err);
    console.log(JSON.stringify(row, null, 2));
    db.close();
});
