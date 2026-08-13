const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    filterBooksWithAvailableFiles,
    normalizeBookPath,
    resolveBookFilePath
} = require('../../utils/bookFileResolver');

describe('book file resolver', () => {
    let booksDirectory;

    beforeEach(() => {
        booksDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-files-'));
        fs.mkdirSync(path.join(booksDirectory, 'fiction'));
        fs.writeFileSync(path.join(booksDirectory, 'fiction', 'available.epub'), 'epub data');
    });

    afterEach(() => {
        fs.rmSync(booksDirectory, { recursive: true, force: true });
    });

    test('filters stale database records out of an EPUB catalog', () => {
        const books = [
            { ID: 1, book_filename: 'fiction/available.epub' },
            { ID: 2, book_filename: 'missing.epub' },
            { ID: 3, book_filename: 'manual.pdf' }
        ];

        expect(filterBooksWithAvailableFiles(books, booksDirectory)).toEqual([books[0]]);
    });

    test('resolves nested files and rejects paths outside the books directory', () => {
        expect(resolveBookFilePath(booksDirectory, 'fiction/available.epub'))
            .toBe(path.join(booksDirectory, 'fiction', 'available.epub'));
        expect(resolveBookFilePath(booksDirectory, '../available.epub')).toBeNull();
    });

    test('normalizes Windows separators and Unicode paths', () => {
        expect(normalizeBookPath('fiction\\cafe\u0301.epub')).toBe('fiction/café.epub');
    });
});
