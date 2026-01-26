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

const walkSync = (dir, filelist = [], baseDir = dir) => {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            filelist = walkSync(filePath, filelist, baseDir);
        } else if (file.toLowerCase().endsWith('.epub')) {
            // Store relative path from baseDir
            filelist.push(path.relative(baseDir, filePath));
        }
    });
    return filelist;
};

const processBook = async (db, filename, formatId, onProgress) => {
    return new Promise(async (resolve) => {
        try {
            if (onProgress) onProgress(filename);
            console.log(`\nProcessing: ${filename}`);
            
            // Check if book already exists
            const existingBook = await new Promise((res, rej) => {
                db.get("SELECT ID FROM Books WHERE book_filename = ?", [filename], (err, row) => {
                    if (err) rej(err);
                    else res(row);
                });
            });
            
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

            const getText = (field) => {
                if (!field || !field[0]) return null;
                const val = field[0];
                if (typeof val === 'string') return val;
                if (typeof val === 'object' && val._) return val._;
                if (typeof val === 'object' && val.$ && val._ === undefined) return null; // Attribute only
                return val.toString();
            };

            const metadata = result.package.metadata[0];
            const title = getText(metadata['dc:title']) || path.basename(filename, '.epub');
            const creators = metadata['dc:creator'] || [];
            const publisher = getText(metadata['dc:publisher']);
            const date = getText(metadata['dc:date']);
            const language = getText(metadata['dc:language']) || 'en';
            const description = getText(metadata['dc:description']);
            
            let isbn = null;
            if (metadata['dc:identifier']) {
                const identifiers = Array.isArray(metadata['dc:identifier']) ? metadata['dc:identifier'] : [metadata['dc:identifier']];
                const isbnIdentifier = identifiers.find(id => {
                    const val = typeof id === 'string' ? id : (id._ || '');
                    return val.toLowerCase().includes('isbn');
                }) || identifiers[0];
                isbn = typeof isbnIdentifier === 'string' ? isbnIdentifier : (isbnIdentifier._ || null);
            }

            console.log(`  Title: ${title}`);

            // Use a unique name for folders/files to avoid collisions in subdirs
            // Replace slashes with underscores for a flat unique filename
            const uniqueBaseName = filename.replace(/[/\\]/g, '_').replace(/\.epub$/i, '');

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
                    coverFilename = `${uniqueBaseName}${ext}`;
                    const coverOutputPath = path.join(COVERS_DIR, coverFilename);
                    fs.writeFileSync(coverOutputPath, coverEntry.getData());
                    console.log(`  -> Cover extracted: ${coverFilename}`);
                }
            }

            // Get or create related entities
            const languageId = await getOrCreateLanguage(db, language);
            const publisherId = await getOrCreatePublisher(db, publisher);

            const opfDir = path.dirname(opfEntry.entryName);

            // Find spine and map to HREFs (absolute relative to zip root)
            const spine = result.package.spine ? result.package.spine[0] : null;
            const spineHrefs = [];
            if (spine && spine.itemref) {
                spine.itemref.forEach(ref => {
                    const idref = ref.$.idref;
                    const item = manifest.find(item => item.$.id === idref);
                    if (item && item.$.href) {
                        // Resolve path relative to OPF and normalize slashes
                        const fullPath = path.join(opfDir, item.$.href).replace(/\\/g, '/');
                        spineHrefs.push(fullPath);
                    }
                });
            }
            console.log(`  Spine: ${spineHrefs.length} chapters found. First: ${spineHrefs[0]}`);
            const spineData = JSON.stringify(spineHrefs);

            // Find entry point (first content file)
            let entryPoint = null;
            if (spine && spine.itemref && spine.itemref.length > 0) {
                const firstItemRef = spine.itemref[0].$;
                const firstItem = manifest.find(item => item.$.id === firstItemRef.idref);
                if (firstItem && firstItem.$.href) {
                    entryPoint = path.join(opfDir, firstItem.$.href).replace(/\\/g, '/');
                }
            }

            const now = Date.now();
            
            // Insert or Update book
            const bookId = await new Promise((res, rej) => {
                if (existingBook) {
                    db.run(`UPDATE Books SET 
                        book_title = ?, book_isbn = ?, book_summary = ?, book_cover_img = ?, 
                        book_date = ?, book_update_date = ?, 
                        book_format_id = ?, language_id = ?, book_publisher_id = ?,
                        book_entry_point = ?, book_spine = ?
                        WHERE ID = ?`,
                        [title, isbn, description, coverFilename, date, now, 
                         formatId, languageId, publisherId, entryPoint, spineData, existingBook.ID],
                        function(err) {
                            if (err) rej(err);
                            else res(existingBook.ID);
                        }
                    );
                } else {
                    db.run(`INSERT INTO Books (
                        book_title, book_isbn, book_summary, book_cover_img, 
                        book_date, book_create_date, book_update_date, book_filename, 
                        book_format_id, language_id, book_publisher_id,
                        book_entry_point, book_spine
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [title, isbn, description, coverFilename, date, now, now, filename, 
                         formatId, languageId, publisherId, entryPoint, spineData],
                        function(err) {
                            if (err) rej(err);
                            else res(this.lastID);
                        }
                    );
                }
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
                    // Check if link already exists
                    const linkExists = await new Promise((res) => {
                        db.get("SELECT ID FROM BooksAuthors WHERE book_id = ? AND author_id = ?", [bookId, authorId], (err, row) => {
                            res(!!row);
                        });
                    });

                    if (!linkExists) {
                        await new Promise((res, rej) => {
                            db.run("INSERT INTO BooksAuthors (book_id, author_id, bookauthor_create_date) VALUES (?, ?, ?)",
                                [bookId, authorId, now],
                                function(err) {
                                    if (err) rej(err);
                                    else {
                                        console.log(`  -> Linked to Author: ${firstName} ${lastName} (ID: ${authorId})`);
                                        res();
                                    }
                                }
                            );
                        });
                    }
                } catch (err) {
                    console.error(`  -> Failed to create book-author relationship:`, err);
                }
            }

            // Extract EPUB content
            const extractPath = path.join(EXTRACTED_DIR, uniqueBaseName);
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

const scanLibrary = async (db, onProgress) => {
    try {
        console.log('Starting recursive library scan...');
        
        const formatId = await getOrCreateFormat(db, 'EPUB');
        const files = walkSync(BOOKS_DIR);
        
        console.log(`Found ${files.length} epub files across all directories.`);
        
        let newBooks = 0;
        for (const file of files) {
            await processBook(db, file, formatId, (msg) => {
                if (onProgress) onProgress(`Processing: ${msg}`, newBooks + 1, files.length);
            });
            newBooks++;
        }
        
        console.log(`Scan complete. processed ${newBooks} total files.`);
        return { success: true, newBooks, totalFiles: files.length };
    } catch (err) {
        console.error('Error during library scan:', err);
        throw err;
    }
};

module.exports = { scanLibrary };
