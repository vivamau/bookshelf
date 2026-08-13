const fs = require('fs');
const path = require('path');

const normalizeBookPath = (value = '') => String(value)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .normalize('NFC');

const isInsideDirectory = (directory, candidate) => {
    const relativePath = path.relative(path.resolve(directory), path.resolve(candidate));
    return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const resolveBookFilePath = (booksDirectory, storedFilename) => {
    if (!storedFilename) return null;

    const normalizedFilename = normalizeBookPath(storedFilename);
    const candidates = [
        normalizedFilename,
        normalizedFilename.normalize('NFD')
    ];

    for (const filename of [...new Set(candidates)]) {
        const candidate = path.resolve(booksDirectory, filename);
        if (!isInsideDirectory(booksDirectory, candidate)) continue;

        try {
            if (fs.statSync(candidate).isFile()) return candidate;
        } catch (_error) {
            // The catalog intentionally ignores database records with missing files.
        }
    }

    return null;
};

const listAvailableBookPaths = (booksDirectory, extension = '.epub') => {
    const availablePaths = new Set();
    const normalizedExtension = extension.toLowerCase();

    const visit = (directory) => {
        let entries;
        try {
            entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch (_error) {
            return;
        }

        entries.forEach((entry) => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith(normalizedExtension)) {
                availablePaths.add(normalizeBookPath(path.relative(booksDirectory, entryPath)));
            }
        });
    };

    visit(booksDirectory);
    return availablePaths;
};

const filterBooksWithAvailableFiles = (books, booksDirectory, extension = '.epub') => {
    const availablePaths = listAvailableBookPaths(booksDirectory, extension);
    return books.filter((book) => availablePaths.has(normalizeBookPath(book.book_filename)));
};

module.exports = {
    filterBooksWithAvailableFiles,
    listAvailableBookPaths,
    normalizeBookPath,
    resolveBookFilePath
};
