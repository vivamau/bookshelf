const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

const BOOKS_DIR = path.join(__dirname, '..', 'books');
const COVERS_DIR = path.join(__dirname, '..', 'covers');
const EXTRACTED_DIR = path.join(__dirname, '..', 'extracted');

if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR);
}

if (!fs.existsSync(EXTRACTED_DIR)) {
    fs.mkdirSync(EXTRACTED_DIR);
}

const getOrCreateFormat = (db, formatName) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT ID FROM Formats WHERE format_name = ?", [formatName], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row.ID);
            
            const now = Date.now();
            db.run("INSERT INTO Formats (format_name, format_create_date) VALUES (?, ?)", 
                [formatName, now], 
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
    });
};

const getOrCreateLanguage = (db, langCode) => {
    return new Promise((resolve, reject) => {
        const langName = langCode.toUpperCase();
        db.get("SELECT ID FROM Languages WHERE language_name = ?", [langName], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row.ID);
            
            const now = Date.now();
            db.run("INSERT INTO Languages (language_name, language_create_date) VALUES (?, ?)", 
                [langName, now], 
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
    });
};

const getOrCreatePublisher = (db, publisherName) => {
    return new Promise((resolve, reject) => {
        if (!publisherName) return resolve(null);
        
        db.get("SELECT ID FROM Publishers WHERE publisher_name = ?", [publisherName], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row.ID);
            
            const now = Date.now();
            db.run("INSERT INTO Publishers (publisher_name, publisher_create_date) VALUES (?, ?)", 
                [publisherName, now], 
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
    });
};

const getOrCreateAuthor = (db, firstName, lastName) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT ID FROM Authors WHERE author_name = ? AND author_lastname = ?", 
            [firstName, lastName], 
            (err, row) => {
                if (err) return reject(err);
                if (row) return resolve(row.ID);
                
                const now = Date.now();
                const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}${lastName}`;
                db.run("INSERT INTO Authors (author_name, author_lastname, author_avatar, author_create_date) VALUES (?, ?, ?, ?)", 
                    [firstName, lastName, avatarUrl, now], 
                    function(err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    }
                );
            }
        );
    });
};

const processBook = async (db, filename, formatId) => {
    return new Promise(async (resolve) => {
        try {
            console.log(`\nProcessing: ${filename}`);
            
            // Check if book already exists
            const existingBook = await new Promise((res, rej) => {
                db.get("SELECT ID FROM Books WHERE book_filename = ?", [filename], (err, row) => {
                    if (err) rej(err);
                    else res(row);
                });
            });
            
            if (existingBook) {
                console.log(`  -> Already exists, skipping`);
                return resolve();
            }
            
            const filePath = path.join(BOOKS_DIR, filename);
            const zip = new AdmZip(filePath);
            const zipEntries = zip.getEntries();

            let opfEntry = zipEntries.find(e => e.entryName.endsWith('.opf'));
            if (!opfEntry) {
                console.log('  -> No OPF file found, skipping');
                return resolve();
            }

            const opfContent = opfEntry.getData().toString('utf8');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(opfContent);

            const metadata = result.package.metadata[0];
            const title = metadata['dc:title'] ? metadata['dc:title'][0] : filename;
            const creators = metadata['dc:creator'] || [];
            const publisher = metadata['dc:publisher'] ? metadata['dc:publisher'][0] : null;
            const date = metadata['dc:date'] ? metadata['dc:date'][0] : null;
            const language = metadata['dc:language'] ? metadata['dc:language'][0] : 'en';
            const description = metadata['dc:description'] ? metadata['dc:description'][0] : null;
            const isbn = metadata['dc:identifier'] ? 
                (Array.isArray(metadata['dc:identifier']) ? 
                    metadata['dc:identifier'].find(id => typeof id === 'string' && id.includes('isbn')) || metadata['dc:identifier'][0] 
                    : metadata['dc:identifier']) 
                : null;

            console.log(`  Title: ${title}`);

            // Extract cover
            let coverFilename = null;
            const manifest = result.package.manifest ? result.package.manifest[0].item : [];
            const coverItem = manifest.find(item => 
                item.$.id === 'cover-image' || 
                item.$.id === 'cover' ||
                (item.$['media-type'] && item.$['media-type'].startsWith('image/') && item.$.href.includes('cover'))
            );

            if (coverItem) {
                const coverHref = coverItem.$.href;
                const opfDir = path.dirname(opfEntry.entryName);
                const coverPath = path.join(opfDir, coverHref).replace(/\\/g, '/');
                const coverEntry = zipEntries.find(e => e.entryName === coverPath);

                if (coverEntry) {
                    const ext = path.extname(coverHref);
                    coverFilename = `${path.basename(filename, '.epub')}${ext}`;
                    const coverOutputPath = path.join(COVERS_DIR, coverFilename);
                    fs.writeFileSync(coverOutputPath, coverEntry.getData());
                    console.log(`  -> Cover extracted: ${coverFilename}`);
                }
            }

            // Get or create related entities
            const languageId = await getOrCreateLanguage(db, language);
            const publisherId = await getOrCreatePublisher(db, publisher);

            // Find spine
            const spine = result.package.spine ? result.package.spine[0] : null;
            const spineData = spine ? JSON.stringify(spine.itemref.map(ref => ref.$)) : null;

            // Find entry point (first content file)
            let entryPoint = null;
            if (spine && spine.itemref && spine.itemref.length > 0) {
                const firstItemRef = spine.itemref[0].$;
                const firstItem = manifest.find(item => item.$.id === firstItemRef.idref);
                if (firstItem) {
                    entryPoint = firstItem.$.href;
                }
            }

            const now = Date.now();
            
            // Insert book
            const bookId = await new Promise((res, rej) => {
                db.run(`INSERT INTO Books (
                    book_title, book_isbn, book_summary, book_cover_img, 
                    book_date, book_create_date, book_filename, 
                    book_format_id, language_id, book_publisher_id,
                    book_entry_point, book_spine
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [title, isbn, description, coverFilename, date, now, filename, 
                     formatId, languageId, publisherId, entryPoint, spineData],
                    function(err) {
                        if (err) rej(err);
                        else res(this.lastID);
                    }
                );
            });

            console.log(`  -> Book ID: ${bookId}`);

            // Process authors
            for (const creator of creators) {
                const authorName = typeof creator === 'string' ? creator : creator._;
                const parts = authorName.split(' ');
                const firstName = parts.slice(0, -1).join(' ') || authorName;
                const lastName = parts[parts.length - 1] || '';

                const authorId = await getOrCreateAuthor(db, firstName, lastName);
                
                try {
                    await new Promise((res, rej) => {
                        db.run("INSERT INTO BooksAuthors (book_id, author_id, bookauthor_create_date) VALUES (?, ?, ?)",
                            [bookId, authorId, now],
                            function(err) {
                                if (err) {
                                    console.error(`  -> ERROR linking book ${bookId} to author ${authorId}:`, err);
                                    rej(err);
                                } else {
                                    console.log(`  -> Linked to Author: ${firstName} ${lastName} (ID: ${authorId})`);
                                    res();
                                }
                            }
                        );
                    });
                } catch (err) {
                    console.error(`  -> Failed to create book-author relationship:`, err);
                }
            }

            // Extract EPUB content
            const extractPath = path.join(EXTRACTED_DIR, path.basename(filename, '.epub'));
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }
            zip.extractAllTo(extractPath, true);
            console.log(`  -> Extracted to: ${extractPath}`);

            resolve();

        } catch (err) {
            console.error(`Error processing ${filename}:`, err);
            resolve();
        }
    });
};

const scanLibrary = async (db) => {
    try {
        console.log('Starting library scan...');
        
        const formatId = await getOrCreateFormat(db, 'EPUB');
        const files = fs.readdirSync(BOOKS_DIR).filter(f => f.toLowerCase().endsWith('.epub'));
        
        console.log(`Found ${files.length} epub files.`);
        
        let newBooks = 0;
        for (const file of files) {
            const existingBook = await new Promise((res, rej) => {
                db.get("SELECT ID FROM Books WHERE book_filename = ?", [file], (err, row) => {
                    if (err) rej(err);
                    else res(row);
                });
            });
            
            if (!existingBook) {
                await processBook(db, file, formatId);
                newBooks++;
            }
        }
        
        console.log(`Scan complete. Added ${newBooks} new books.`);
        return { success: true, newBooks, totalFiles: files.length };
    } catch (err) {
        console.error('Error during library scan:', err);
        throw err;
    }
};

module.exports = { scanLibrary };
