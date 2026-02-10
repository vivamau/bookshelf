const Unrar = require('node-unrar-js');
console.log('Unrar exports:', Unrar);
console.log('Type of createExtractorFromFile:', typeof Unrar.createExtractorFromFile);

async function test() {
    try {
        // Just checking API presence
        if (typeof Unrar.createExtractorFromFile === 'function') {
            console.log('API seems present');
        } else {
            console.error('API missing!');
        }
    } catch (e) {
        console.error(e);
    }
}
test();
