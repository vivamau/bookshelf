const { getDisplayBaseName, normalizeDisplayText } = require('../../utils/libraryScanner');

describe('library scanner display metadata', () => {
    test('turns sanitized filename separators back into readable spaces', () => {
        expect(getDisplayBaseName('Build_Your__Own_AI.pdf')).toBe('Build Your Own AI');
    });

    test('uses only the basename when deriving a display title', () => {
        expect(getDisplayBaseName('../unsafe/Readable_Title.epub')).toBe('Readable Title');
    });

    test('normalizes repeated separators and whitespace', () => {
        expect(normalizeDisplayText('  Ursula__Le   Guin ')).toBe('Ursula Le Guin');
    });
});
