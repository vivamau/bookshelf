const {
    buildFtsQuery,
    buildSearchScope,
    normalizeFreeText,
    parseIdList
} = require('../../routes/search');

describe('search query helpers', () => {
    test('normalizes sanitized filenames and builds safe prefix terms', () => {
        expect(normalizeFreeText('  Build_Your__Own  ')).toBe('Build Your Own');
        expect(buildFtsQuery('Build_Your__Own!')).toBe('"Build"* AND "Your"* AND "Own"*');
    });

    test('drops FTS operators and punctuation from user input', () => {
        expect(buildFtsQuery('dune OR (archive)')).toBe('"dune"* AND "OR"* AND "archive"*');
    });

    test('deduplicates and validates id filters', () => {
        expect(parseIdList('2,2,-1,nope,5')).toEqual([2, 5]);
    });

    test('builds parameterized filters without interpolating user values', () => {
        const scope = buildSearchScope({
            q: 'open source',
            format: 'PDF,EPUB',
            language: '3',
            authorName: 'Ada%'
        });

        expect(scope.where).toContain('BookSearch MATCH ?');
        expect(scope.where).toContain('UPPER(f.format_name) IN (?, ?)');
        expect(scope.where).not.toContain('Ada');
        expect(scope.params).toEqual([
            '"open"* AND "source"*',
            'PDF',
            'EPUB',
            3,
            '%Ada\\%%'
        ]);
    });
});
