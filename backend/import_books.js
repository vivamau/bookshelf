const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

const DB_PATH = path.join(__dirname, 'data', 'booksshelf.db');
const BOOKS_DIR = path.join(__dirname, 'books');
const COVERS_DIR = path.join(__dirname, 'covers');

if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR);
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

const cleanDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("DELETE FROM BooksGeneres");
            db.run("DELETE FROM Generes");
            db.run("DELETE FROM BooksAuthors");
            db.run("DELETE FROM Authors");
            db.run("DELETE FROM BooksUsers");
            db.run("DELETE FROM Books");
            db.run("DELETE FROM Publishers");
            db.run("DELETE FROM Languages");
            db.run("DELETE FROM Formats", (err) => {
                if (err) return reject(err);
                
                try {
                    const files = fs.readdirSync(COVERS_DIR);
                    for (const file of files) {
                        fs.unlinkSync(path.join(COVERS_DIR, file));
                    }
                    console.log('Cleaned covers directory.');
                    resolve();
                } catch (e) {
                    console.error("Error cleaning covers dir:", e);
                    resolve(); 
                }
            });
        });
    });
};

const getOrCreateFormat = (formatName) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT ID FROM Formats WHERE format_name = ?", [formatName], (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row.ID);
            } else {
                const now = Date.now();
                db.run("INSERT INTO Formats (format_name, format_create_date, format_update_date) VALUES (?, ?, ?)", [formatName, now, now], function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                });
            }
        });
    });
};

const getOrCreateLanguage = (langCode) => {
    return new Promise((resolve, reject) => {
        const codeText = getText(langCode);
        if (!codeText) return resolve(null);
        let code = codeText.toLowerCase().trim().split('-')[0]; // Simplify "en-US" to "en"
        
        db.get("SELECT ID FROM Languages WHERE language_name = ?", [code], (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row.ID);
            } else {
                const now = Date.now();
                db.run("INSERT INTO Languages (language_name, language_create_date, language_update_date) VALUES (?, ?, ?)", 
                    [code, now, now], 
                    function (err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    }
                );
            }
        });
    });
};

const getOrCreateGenere = (genereTitle) => {
    return new Promise((resolve, reject) => {
        const title = genereTitle.trim();
        db.get("SELECT ID FROM Generes WHERE genere_title = ?", [title], (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row.ID);
            } else {
                const now = Date.now();
                db.run("INSERT INTO Generes (genere_title, genere_create_date, genere_update_date) VALUES (?, ?, ?)", [title, now, now], function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                });
            }
        });
    });
};

const linkBookToGenere = (bookId, genereId) => {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        db.run("INSERT INTO BooksGeneres (book_id, genere_id, booksgeneres_create_date) VALUES (?, ?, ?)", [bookId, genereId, now], function(err) {
            if (err) return reject(err);
            resolve();
        });
    });
};

const getPublisherWebsite = async (publisherName) => {
    try {
        const wikiUrl = await searchWikipedia(publisherName);
        if (!wikiUrl) return null;

        console.log(`    (Found Wiki: ${wikiUrl})`);

        const response = await axios.get(wikiUrl, {
            headers: { 'User-Agent': 'BookshelfApp/1.0 (test@example.com)' }
        });
        const html = response.data;
        
        const websiteRegex = /<th[^>]*>Website<\/th>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>/i;
        const match = html.match(websiteRegex);
        
        if (match && match[1]) {
            return match[1];
        }
        
        const officialRegex = /<a[^>]*href="([^"]+)"[^>]*>Official website<\/a>/i;
        const matchOfficial = html.match(officialRegex);
        if (matchOfficial && matchOfficial[1]) {
            return matchOfficial[1];
        }

        return null; 
    } catch (e) {
        console.error("Error fetching publisher website:", e.message);
        return null;
    }
}

const getOrCreatePublisher = (publisherName) => {
    return new Promise(async (resolve, reject) => {
        if (!publisherName) return resolve(null);
        const name = publisherName.trim();
        
        db.get("SELECT ID FROM Publishers WHERE publisher_name = ?", [name], async (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row.ID);
            } else {
                console.log(`Searching Website for Publisher: ${name}`);
                const website = await getPublisherWebsite(name);
                if (website) console.log(`  -> Found Website: ${website}`);

                const now = Date.now();
                db.run("INSERT INTO Publishers (publisher_name, publisher_website, publisher_create_date, publisher_update_date) VALUES (?, ?, ?, ?)", 
                    [name, website, now, now], 
                    function (err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    }
                );
            }
        });
    });
};

const searchWikipedia = async (authorName) => {
    try {
        const query = encodeURIComponent(authorName);
        const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${query}&limit=1&namespace=0&format=json`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'BookshelfApp/1.0 (test@example.com)' }
        });
        if (response.data && response.data[3] && response.data[3].length > 0) {
            return response.data[3][0];
        }
        return null;
    } catch (error) {
        console.error(`Error searching Wikipedia for ${authorName}:`, error.message);
        return null;
    }
};

const getOrCreateAuthor = (rawName, fileAs) => {
    return new Promise(async (resolve, reject) => {
        if (!rawName) return resolve(null);
        
        let name = '';
        let surname = '';

        if (fileAs && fileAs.includes(',')) {
            const parts = fileAs.split(',');
            surname = parts[0].trim();
            name = parts[1].trim();
        } else {
            let cleanName = rawName.replace(/\[.*?\]/g, '').trim();
            const parts = cleanName.split(' ');
            if (parts.length > 1) {
                surname = parts.pop();
                name = parts.join(' ');
            } else {
                name = cleanName; 
            }
        }

        if (!name && !surname) {
             return resolve(null);
        }

        const fullName = `${name} ${surname}`.trim();

        db.get("SELECT ID FROM Authors WHERE author_name = ? AND author_lastname = ?", [name, surname], async (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row.ID);
            } else {
                console.log(`Searching Wikipedia for: ${fullName}`);
                const wikiUrl = await searchWikipedia(fullName);
                if (wikiUrl) console.log(`  -> Found Wiki: ${wikiUrl}`);
                
                const now = Date.now();
                db.run("INSERT INTO Authors (author_name, author_lastname, author_wiki, author_create_date, author_update_date) VALUES (?, ?, ?, ?, ?)", 
                    [name, surname, wikiUrl, now, now], 
                    function (err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    }
                );
            }
        });
    });
};

const linkBookToAuthor = (bookId, authorId) => {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        db.run("INSERT INTO BooksAuthors (book_id, author_id, bookauthor_create_date) VALUES (?, ?, ?)", [bookId, authorId, now], function(err) {
            if (err) return reject(err);
            resolve();
        });
    });
};

const insertBook = (book, formatId, publisherId, languageId) => {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        const title = book.metadata.title || path.basename(book.filename, '.epub');
        let isbn = book.metadata.ISBN || book.metadata.isbn || '';
        if (!isbn && book.metadata['dcterms:identifier']) {
             isbn = book.metadata['dcterms:identifier'];
        }
        const summary = book.metadata.summary || book.metadata.description || '';
        
        let bookDate = null;
        if (book.metadata.date) {
            const dateStr = String(book.metadata.date);
            const parsed = Date.parse(dateStr);
            if (!isNaN(parsed)) {
                bookDate = parsed;
            } else {
                const match = dateStr.match(/\d{4}/);
                if (match) { 
                    bookDate = new Date(match[0], 0, 1).getTime();
                }
            }
        }

        db.run(`INSERT INTO Books (book_title, book_isbn, book_summary, book_date, book_format_id, book_publisher_id, language_id, book_filename, book_entry_point, book_spine, book_create_date, book_update_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [title, isbn, summary, bookDate, formatId, publisherId, languageId, book.filename, book.metadata.entryPoint, JSON.stringify(book.metadata.spine), now, now], 
                function(err) {
                    if (err) return reject(err);
                    console.log(`Inserted book: ${title}`);
                    resolve(this.lastID);
                }
        );
    });
}; 

const getText = (node) => {
    if (!node) return null;
    if (Array.isArray(node)) return getText(node[0]);
    if (typeof node === 'string') return node;
    if (node['_']) return node['_'];
    return null;
};

const parseXml = (xmlString) => {
    return new Promise((resolve, reject) => {
        const parser = new xml2js.Parser();
        parser.parseString(xmlString, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

const getArrayOrSingle = (val) => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
};

const extractMetadata = async (zip) => {
    try {
        const containerEntry = zip.getEntry('META-INF/container.xml');
        if (!containerEntry) throw new Error('Missing META-INF/container.xml');
        
        const containerXml = containerEntry.getData().toString('utf8');
        const containerData = await parseXml(containerXml);
        
        const rootFiles = containerData.container.rootfiles[0].rootfile;
        const fullPath = rootFiles[0]['$']['full-path'];
        
        const opfEntry = zip.getEntry(fullPath);
        if (!opfEntry) throw new Error(`Missing OPF file: ${fullPath}`);
        
        const opfXml = opfEntry.getData().toString('utf8');
        const opfData = await parseXml(opfXml);
        
        const metadata = opfData.package.metadata[0];
        const manifest = opfData.package.manifest[0].item;
        
        const result = {
            title: getText(metadata['dc:title']),
            creator: metadata['dc:creator'] ? metadata['dc:creator'].map(c => getText(c)) : [],
            creatorFileAs: metadata['dc:creator'] ? metadata['dc:creator'].map(c => typeof c === 'object' && c['$'] ? c['$']['opf:file-as'] : null).find(x => x) : null,
            description: getText(metadata['dc:description']),
            publisher: getText(metadata['dc:publisher']),
            language: getText(metadata['dc:language']),
            subject: metadata['dc:subject'] ? metadata['dc:subject'].map(s => getText(s)) : [],
            date: getText(metadata['dc:date']),
            identifier: metadata['dc:identifier'] ? getText(metadata['dc:identifier']) : null,
            coverImage: null
        };
        
        // Find cover
        let coverId = null;
        if (metadata.meta) {
            const coverMeta = metadata.meta.find(m => m['$'].name === 'cover');
            if (coverMeta) coverId = coverMeta['$'].content;
        }
        
        const opfDir = path.dirname(fullPath);
        if (coverId && manifest) {
            const coverItem = manifest.find(item => item['$'].id === coverId);
            if (coverItem) result.coverImage = path.join(opfDir, coverItem['$'].href);
        }
        
        // Find spine (all pages in order)
        const spine = opfData.package.spine[0].itemref;
        
        if (spine && spine.length > 0) {
            result.spine = spine.map(ref => {
                const item = manifest.find(i => i['$'].id === ref['$'].idref);
                return item ? path.join(opfDir, item['$'].href) : null;
            }).filter(x => x);
            
            result.entryPoint = result.spine[0];
        }

        return result;
    } catch (e) {
        console.error("Error parsing EPUB:", e);
        return {};
    }
};

const processBook = (filename, formatId) => {
    return new Promise(async (resolve, reject) => {
        const filePath = path.join(BOOKS_DIR, filename);
        
        try {
            const zip = new AdmZip(filePath);
            const metadata = await extractMetadata(zip);
            
            const publisherId = await getOrCreatePublisher(metadata.publisher);
            const languageId = await getOrCreateLanguage(metadata.language);

            const bookMock = {
                metadata: {
                    title: metadata.title,
                    ISBN: metadata.identifier,
                    description: metadata.description,
                    date: metadata.date,
                    subject: metadata.subject,
                    creator: metadata.creator,
                    creatorFileAs: metadata.creatorFileAs,
                    entryPoint: metadata.entryPoint,
                    spine: metadata.spine
                },
                filename: filename
            };

            const bookId = await insertBook(bookMock, formatId, publisherId, languageId);

            if (metadata.coverImage) {
                // Extract cover
                 const coverEntry = zip.getEntry(metadata.coverImage);
                 if (coverEntry) {
                    const data = coverEntry.getData();
                    const ext = path.extname(metadata.coverImage) || '.jpg';
                    const coverFilename = `${bookId}${ext}`;
                     const coverPath = path.join(COVERS_DIR, coverFilename);
                     
                     fs.writeFileSync(coverPath, data);
                     
                     db.run("UPDATE Books SET book_cover_img = ? WHERE ID = ?", [coverFilename, bookId]);
                     console.log(`  -> Saved cover: ${coverFilename}`);
                 }
            }
            
            // Generes/Subjects
            if (metadata.subject && metadata.subject.length > 0) {
                 for (const subject of metadata.subject) {
                     const genereId = await getOrCreateGenere(subject);
                     await linkBookToGenere(bookId, genereId);
                 }
            }

            // Authors
              if (metadata.creator) {
                    let authorsList = Array.isArray(metadata.creator) ? metadata.creator : [metadata.creator];
                    for (const authName of authorsList) {
                        const authorId = await getOrCreateAuthor(authName, metadata.creatorFileAs);
                        if (authorId) {
                            await linkBookToAuthor(bookId, authorId);
                        }
                    }
                }

            // Extract the whole EPUB for preview
            const extractPath = path.join(__dirname, 'extracted', String(bookId));
            if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });
            zip.extractAllTo(extractPath, true);
            console.log(`  -> Extracted to: ${extractPath}`);

            resolve();

        } catch (err) {
            console.error(`Error processing ${filename}:`, err);
            resolve();
        }
    });
};

const main = async () => {
    try {
        console.log('Cleaning existing data...');
        await cleanDb();
        
        const formatId = await getOrCreateFormat('EPUB');
        console.log(`EPUB Format ID: ${formatId}`);

        const files = fs.readdirSync(BOOKS_DIR).filter(f => f.toLowerCase().endsWith('.epub'));
        
        console.log(`Found ${files.length} epub files.`);

        for (const file of files) {
            await processBook(file, formatId);
        }

        console.log('All books processed.');
    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        db.close();
    }
};

main();
