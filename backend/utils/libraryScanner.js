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
        } else if (file.toLowerCase().endsWith('.epub') || file.toLowerCase().endsWith('.pdf')) {
            // Store relative path from baseDir
            filelist.push(path.relative(baseDir, filePath));
        }
    });
    return filelist;
};

const processBook = async (db, filename, formatId, onProgress, options = {}) => {
    const { forceRefreshCovers = false } = options;
    return new Promise(async (resolve) => {
        try {
            if (onProgress) onProgress(filename);
            console.log(`\nProcessing: ${filename}`);
            
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

            if (!result || !result.package || !result.package.metadata) {
                console.log('  -> Invalid OPF structure, skipping');
                return resolve(false);
            }

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
            
            let isbn = null;
            if (metadata['dc:identifier']) {
                const identifiers = Array.isArray(metadata['dc:identifier']) ? metadata['dc:identifier'] : [metadata['dc:identifier']];
                const isbnIdentifier = identifiers.find(id => {
                    const val = typeof id === 'string' ? id : (id._ || '');
                    return val.toLowerCase().includes('isbn');
                }) || identifiers[0];
                isbn = typeof isbnIdentifier === 'string' ? isbnIdentifier : (isbnIdentifier._ || null);
            }
            const date = getText(metadata['dc:date']);

            // SMART DUPLICATE CHECK: Search by filename OR ISBN OR (Title AND Date)
            const existingBook = await new Promise((res) => {
                let sql = "SELECT ID FROM Books WHERE book_filename = ?";
                let params = [filename];
                
                if (isbn && isbn.length > 5) {
                    sql += " OR book_isbn = ?";
                    params.push(isbn);
                }
                
                if (title) {
                    sql += " OR (book_title = ? AND book_date = ?)";
                    params.push(title, date);
                }
                
                db.get(sql, params, (err, row) => {
                    res(row);
                });
            });
            
            if (existingBook) {
                console.log(`  -> Duplicate/Existing book found (ID: ${existingBook.ID}). Updating metadata...`);
            }

            console.log(`  Title: ${title}`);
            
            // Deduplicate creators by name
            const rawCreators = metadata['dc:creator'] || [];
            const creators = [];
            const seenCreators = new Set();
            
            for (const c of rawCreators) {
                const name = (typeof c === 'string' ? c : c._ || '').trim();
                if (name && !seenCreators.has(name.toLowerCase())) {
                    seenCreators.add(name.toLowerCase());
                    creators.push(c);
                }
            }
            const publisher = getText(metadata['dc:publisher']);
            const language = getText(metadata['dc:language']) || 'en';
            const description = getText(metadata['dc:description']);
            console.log(`  Title: ${title}`);

            // Use a unique name for folders/files to avoid collisions in subdirs
            // Replace slashes with underscores for a flat unique filename
            const uniqueBaseName = filename.replace(/[/\\]/g, '_').replace(/\.epub$/i, '');

            // Extract cover
            let coverFilename = null;
            const manifest = result.package.manifest ? result.package.manifest[0].item : [];
            const coverItem = manifest.find(item => {
                const id = item.$.id ? item.$.id.toLowerCase() : '';
                const href = item.$.href ? item.$.href.toLowerCase() : '';
                const mediaType = item.$['media-type'] ? item.$['media-type'].toLowerCase() : '';
                
                const isImage = mediaType.startsWith('image/') || 
                               href.endsWith('.jpg') || 
                               href.endsWith('.jpeg') || 
                               href.endsWith('.png') || 
                               href.endsWith('.webp');
                
                return isImage && (id === 'cover-image' || id === 'cover' || href.includes('cover'));
            });

            if (coverItem) {
                const coverHref = coverItem.$.href;
                const opfDir = path.dirname(opfEntry.entryName);
                const coverPath = path.join(opfDir, coverHref).replace(/\\/g, '/');
                const coverEntry = zipEntries.find(e => e.entryName === coverPath);

                if (coverEntry) {
                    const ext = path.extname(coverHref);
                    coverFilename = `${uniqueBaseName}${ext}`;
                    const coverOutputPath = path.join(COVERS_DIR, coverFilename);
                    
                    if (!forceRefreshCovers && existingBook && fs.existsSync(coverOutputPath)) {
                        console.log(`  -> Cover already exists: ${coverFilename}`);
                    } else {
                        fs.writeFileSync(coverOutputPath, coverEntry.getData());
                        console.log(`  -> Cover extracted (forced or new): ${coverFilename}`);
                    }
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
            const isNew = !existingBook;
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

            console.log(`  -> Book ID: ${bookId} (${isNew ? 'NEW' : 'UPDATED'})`);

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
                } catch (e) {
                    // Ignore duplicate link errors
                }
            }

            // Extract content if new or missing
             if (isNew || forceRefreshCovers) {
                // If it is new, we might want to extract content (not doing here for now to save time/space)
                // But generally we do. For now let's just mark as new.
             }

            resolve({ isNew, bookId });

        } catch (err) {
            console.error(`Error processing book ${filename}:`, err);
            resolve({ isNew: false, bookId: null, error: err.message });
        }
    });
};

const processPdf = async (db, filename, formatId, onProgress) => {
    return new Promise(async (resolve) => {
        try {
            if (onProgress) onProgress(filename);
            console.log(`\nProcessing PDF: ${filename}`);
            
            // Simple metadata extraction from filename
            const baseName = path.basename(filename, '.pdf');
            // Try to guess title/author from filename if it contains common separators
            let title = baseName;
            let authorName = null;

            if (baseName.includes(' - ')) {
                const parts = baseName.split(' - ');
                title = parts[1].trim();
                authorName = parts[0].trim();
            } else if (baseName.includes(' (')) {
                const parts = baseName.split(' (');
                title = parts[0].trim();
                authorName = parts[1].replace(')', '').trim();
            }

            // SMART DUPLICATE CHECK for PDF
            const existingBook = await new Promise((res) => {
                db.get("SELECT ID FROM Books WHERE book_filename = ? OR book_title = ?", [filename, title], (err, row) => {
                    res(row);
                });
            });

            if (existingBook) {
                console.log(`  -> Duplicate found for "${title}", skipping`);
                return resolve({ isNew: false, bookId: existingBook.ID });
            }

            const now = Date.now();
            const languageId = await getOrCreateLanguage(db, 'EN'); // Default for PDF for now
            
            const bookId = await new Promise((res, rej) => {
                db.run(`INSERT INTO Books (
                    book_title, book_create_date, book_update_date, book_filename, 
                    book_format_id, language_id
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [title, now, now, filename, formatId, languageId],
                    function(err) {
                        if (err) rej(err);
                        else res(this.lastID);
                    }
                );
            });

            if (authorName) {
                const parts = authorName.split(' ');
                const firstName = parts.slice(0, -1).join(' ') || authorName;
                const lastName = parts[parts.length - 1] || '';
                const authorId = await getOrCreateAuthor(db, firstName, lastName);
                
                await new Promise((res, rej) => {
                    db.run("INSERT INTO BooksAuthors (book_id, author_id, bookauthor_create_date) VALUES (?, ?, ?)",
                        [bookId, authorId, now],
                        (err) => err ? rej(err) : res()
                    );
                });
            }

            console.log(`  -> PDF Book ID: ${bookId} (NEW)`);
            resolve({ isNew: true, bookId });

        } catch (err) {
            console.error(`Error processing PDF ${filename}:`, err);
            resolve({ isNew: false, bookId: null, error: err.message });
        }
    });
};

const scanLibrary = async (db, onProgress, options = {}) => {
    try {
        console.log('Starting recursive library scan...');
        
        const epubFormatId = await getOrCreateFormat(db, 'EPUB');
        const pdfFormatId = await getOrCreateFormat(db, 'PDF');
        const files = walkSync(BOOKS_DIR);
        
        console.log(`Found ${files.length} files across all directories.`);
        
        let processedCount = 0;
        let newBooksCount = 0;
        for (const file of files) {
            let isNew = false;
            if (file.toLowerCase().endsWith('.epub')) {
                const res = await processBook(db, file, epubFormatId, (msg) => {
                    if (onProgress) onProgress(`Processing: ${msg}`, processedCount + 1, files.length);
                }, options);
                isNew = res.isNew;
            } else if (file.toLowerCase().endsWith('.pdf')) {
                const res = await processPdf(db, file, pdfFormatId, (msg) => {
                    if (onProgress) onProgress(`Processing: ${msg}`, processedCount + 1, files.length);
                });
                isNew = res.isNew;
            }
            processedCount++;
            if (isNew) newBooksCount++;
        }
        
        console.log(`Scan complete. Processed ${processedCount} files. Found ${newBooksCount} new books.`);
        return { success: true, newBooks: newBooksCount, totalFiles: processedCount };
    } catch (err) {
        console.error('Error during library scan:', err);
        throw err;
    }
};

const refreshCovers = async (db, onProgress) => {
    try {
        console.log('Starting cover refresh...');
        const epubFormatId = await getOrCreateFormat(db, 'EPUB');
        const books = await new Promise((res) => {
            db.all("SELECT ID, book_filename FROM Books WHERE book_format_id = ?", [epubFormatId], (err, rows) => {
                res(rows || []);
            });
        });

        console.log(`Found ${books.length} books to refresh covers for.`);
        
        let processedCount = 0;
        for (const book of books) {
            await processBook(db, book.book_filename, epubFormatId, (msg) => {
                if (onProgress) onProgress(`Refreshing: ${msg}`, processedCount + 1, books.length);
            }, { forceRefreshCovers: true });
            processedCount++;
        }
        
        return { success: true, totalProcessed: processedCount };
    } catch (err) {
        console.error('Error during cover refresh:', err);
        throw err;
    }
};

const importFiles = async (db, onProgress) => {
    try {
        console.log('Starting import from external directories...');
        
        // Custom recursive walk that follows symlinks or just standard dirs
        // We reuse or adapt walkSync but for specific list of dirs
        
        const directories = await new Promise((resolve, reject) => {
            db.all("SELECT path FROM ScanDirectories", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.path));
            });
        });

        if (directories.length === 0) {
            console.log('No import directories configured.');
            return { success: true, importedCount: 0 };
        }

        console.log(`Checking ${directories.length} import directories...`);
        let importedCount = 0;

        for (const dir of directories) {
            try {
                if (onProgress) {
                    onProgress(`Scanning folder: ${dir}...`);
                    // Yield to event loop to allow flush
                    await new Promise(resolve => setTimeout(resolve, 1200));
                }

                if (!fs.existsSync(dir)) {
                    console.log(`Skipping missing directory: ${dir}`);
                    continue;
                }

                // We need a recursive walk for this dir
                const files = [];
                const getFiles = (d) => {
                    try {
                        const list = fs.readdirSync(d);
                        list.forEach(file => {
                            const fullPath = path.join(d, file);
                            const stat = fs.statSync(fullPath);
                            if (stat && stat.isDirectory()) {
                                getFiles(fullPath);
                            } else {
                                if (file.toLowerCase().endsWith('.epub') || file.toLowerCase().endsWith('.pdf')) {
                                    files.push(fullPath);
                                }
                            }
                        });
                    } catch (e) {
                         console.error(`Error reading dir ${d}:`, e.message);
                    }
                };
                getFiles(dir);

                for (const srcPath of files) {
                    const filename = path.basename(srcPath);
                    const destPath = path.join(BOOKS_DIR, filename);

                    // Duplicate check based on filename presence in destination
                    if (!fs.existsSync(destPath)) {
                        if (onProgress) onProgress(`Scanning folder: ${dir}\nImporting: ${filename}`);
                        console.log(`Importing ${filename} from ${dir}`);
                        fs.copyFileSync(srcPath, destPath);
                        importedCount++;
                    }
                }

            } catch (err) {
                console.error(`Error processing directory ${dir}:`, err.message);
            }
        }
        
        console.log(`Import complete. Copied ${importedCount} new files.`);
        return { success: true, importedCount };
    } catch (err) {
        console.error('Error during import:', err);
        throw err;
    }
};

const scanSingleFile = async (db, filename) => {
    try {
        if (filename.toLowerCase().endsWith('.epub')) {
             const epubFormatId = await getOrCreateFormat(db, 'EPUB');
             return await processBook(db, filename, epubFormatId, null);
        } else if (filename.toLowerCase().endsWith('.pdf')) {
             const pdfFormatId = await getOrCreateFormat(db, 'PDF');
             return await processPdf(db, filename, pdfFormatId, null);
        }
        return false;
    } catch (err) {
        console.error('Error scanning single file:', err);
        return false;
    }
};

module.exports = { scanLibrary, refreshCovers, importFiles, scanSingleFile };
