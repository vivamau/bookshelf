const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    ApplicationLogger,
    createDailyLogExport,
    getDailyLogRange,
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

    test('exports one local calendar day across active and rotated logs', async () => {
        const lines = [
            { timestamp: '2026-08-21T21:59:59.999Z', event: 'too-early' },
            { timestamp: '2026-08-21T22:00:00.000Z', event: 'day-start' },
            { timestamp: '2026-08-22T12:00:00.000Z', event: 'midday' },
            { timestamp: '2026-08-22T22:00:00.000Z', event: 'next-day' }
        ];
        fs.writeFileSync(`${logFile}.1`, `${JSON.stringify(lines[0])}\n${JSON.stringify(lines[1])}\n`);
        fs.writeFileSync(logFile, `${JSON.stringify(lines[2])}\nmalformed\n${JSON.stringify(lines[3])}\n`);

        const dailyExport = await createDailyLogExport({
            logFile,
            date: '2026-08-22',
            timezoneOffsetMinutes: -120,
            archiveCount: 1
        });

        expect(dailyExport.entryCount).toBe(2);
        expect(dailyExport.content).toContain('day-start');
        expect(dailyExport.content).toContain('midday');
        expect(dailyExport.content).not.toContain('too-early');
        expect(dailyExport.content).not.toContain('next-day');
        expect(dailyExport.content.indexOf('day-start')).toBeLessThan(
            dailyExport.content.indexOf('midday')
        );
    });

    test('rejects impossible dates and unsafe timezone offsets', () => {
        expect(() => getDailyLogRange('2026-02-30', 0)).toThrow(TypeError);
        expect(() => getDailyLogRange('2026-08-22', 900)).toThrow(TypeError);
    });

    test('supports daylight-saving changes between local midnights', () => {
        const range = getDailyLogRange('2026-03-29', -60, -120);
        expect(range.end - range.start).toBe(23 * 60 * 60 * 1000);
    });
});
