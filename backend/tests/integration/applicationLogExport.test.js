const fs = require('fs');
const os = require('os');
const path = require('path');

const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookshelf-export-'));
process.env.APPLICATION_LOG_FILE = path.join(logDirectory, 'application.log');

const request = require('supertest');
const { setupTestDb, db } = require('../setup');
const app = require('../../index');

describe('daily application log export', () => {
    let librarianCookie;
    let guestCookie;

    beforeAll(async () => {
        await setupTestDb();
        const librarianLogin = await request(app)
            .post('/login')
            .send({ username: 'admin', password: 'adminpassword' });
        librarianCookie = librarianLogin.headers['set-cookie'][0].split(';')[0];

        const guestLogin = await request(app)
            .post('/login')
            .send({ username: 'guest1', password: 'guestpassword' });
        guestCookie = guestLogin.headers['set-cookie'][0].split(';')[0];

        fs.writeFileSync(`${process.env.APPLICATION_LOG_FILE}.1`, [
            JSON.stringify({ timestamp: '2026-08-22T08:00:00.000Z', event: 'archived-error' }),
            JSON.stringify({ timestamp: '2026-08-21T08:00:00.000Z', event: 'previous-day' })
        ].join('\n'));
        fs.writeFileSync(process.env.APPLICATION_LOG_FILE, [
            JSON.stringify({ timestamp: '2026-08-22T12:00:00.000Z', event: 'current-error' }),
            JSON.stringify({ timestamp: '2026-08-23T08:00:00.000Z', event: 'next-day' })
        ].join('\n'));
    });

    afterAll((done) => {
        fs.rmSync(logDirectory, { recursive: true, force: true });
        db.close((error) => done(error));
    });

    test('lets a librarian download one day from active and archived logs', async () => {
        const response = await request(app)
            .get('/api/settings/logs/export')
            .query({ date: '2026-08-22', timezoneOffsetMinutes: 0 })
            .set('Cookie', librarianCookie);

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('application/x-ndjson');
        expect(response.headers['content-disposition']).toContain('bookshelf-errors-2026-08-22.jsonl');
        expect(response.headers['x-log-entry-count']).toBe('2');
        expect(response.text).toContain('archived-error');
        expect(response.text).toContain('current-error');
        expect(response.text).not.toContain('previous-day');
        expect(response.text).not.toContain('next-day');
    });

    test('lets a librarian view entries filtered to an hourly range', async () => {
        const response = await request(app)
            .get('/api/settings/logs')
            .query({
                startTimestamp: Date.parse('2026-08-22T10:00:00.000Z'),
                endTimestamp: Date.parse('2026-08-22T13:00:00.000Z'),
                limit: 500
            })
            .set('Cookie', librarianCookie);

        expect(response.statusCode).toBe(200);
        expect(response.body.data).toEqual({
            entries: [expect.objectContaining({ event: 'current-error' })],
            total: 1,
            truncated: false
        });
    });

    test('rejects non-librarians and invalid dates', async () => {
        const forbiddenResponse = await request(app)
            .get('/api/settings/logs/export')
            .query({ date: '2026-08-22', timezoneOffsetMinutes: 0 })
            .set('Cookie', guestCookie);
        expect(forbiddenResponse.statusCode).toBe(403);

        const forbiddenViewerResponse = await request(app)
            .get('/api/settings/logs')
            .query({ startTimestamp: 0, endTimestamp: 1000 })
            .set('Cookie', guestCookie);
        expect(forbiddenViewerResponse.statusCode).toBe(403);

        const invalidDateResponse = await request(app)
            .get('/api/settings/logs/export')
            .query({ date: '2026-02-30', timezoneOffsetMinutes: 0 })
            .set('Cookie', librarianCookie);
        expect(invalidDateResponse.statusCode).toBe(400);
    });
});
