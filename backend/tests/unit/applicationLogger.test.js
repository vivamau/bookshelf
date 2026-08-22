const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    ApplicationLogger,
    redactSensitiveData,
    resolveLogFile
} = require('../../utils/applicationLogger');

describe('application logger', () => {
    let tempDirectory;
    let logFile;

    beforeEach(() => {
        tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-log-'));
        logFile = path.join(tempDirectory, 'application.log');
    });

    afterEach(() => {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    });

    test('writes structured error details while redacting secrets', () => {
        const logger = new ApplicationLogger({
            logFile,
            enabled: true,
            mirrorConsole: false
        });
        const error = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });

        logger.error('auth.login.database_error', error, {
            requestId: 'request-123',
            username: 'reader1',
            password: 'do-not-log',
            authorization: 'Bearer secret'
        });

        const entry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
        expect(entry).toMatchObject({
            level: 'ERROR',
            event: 'auth.login.database_error',
            message: 'database is locked',
            error: { message: 'database is locked', code: 'SQLITE_BUSY' },
            context: {
                requestId: 'request-123',
                username: 'reader1',
                password: '[REDACTED]',
                authorization: '[REDACTED]'
            }
        });
        expect(entry.error.stack).toContain('database is locked');
    });

    test('rotates a full log and retains the previous entries', () => {
        const logger = new ApplicationLogger({
            logFile,
            maxBytes: 250,
            archiveCount: 2,
            enabled: true,
            mirrorConsole: false
        });

        logger.warn('first.error', 'x'.repeat(180));
        logger.warn('second.error', 'y'.repeat(180));

        expect(fs.existsSync(`${logFile}.1`)).toBe(true);
        expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toContain('first.error');
        expect(fs.readFileSync(logFile, 'utf8')).toContain('second.error');
    });

    test('redacts nested credentials and resolves relative paths from backend', () => {
        expect(redactSensitiveData({
            profile: { apiKey: 'secret', name: 'Test' },
            cookie: 'token=value'
        })).toEqual({
            profile: { apiKey: '[REDACTED]', name: 'Test' },
            cookie: '[REDACTED]'
        });
        expect(resolveLogFile('logs/custom.log')).toBe(
            path.resolve(__dirname, '../../logs/custom.log')
        );
    });
});
