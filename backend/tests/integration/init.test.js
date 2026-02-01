const { setupTestDb, db } = require('../setup');
const seedUsers = require('../../seed_users');

// Mock console.log to keep test output clean
global.console = {
  ...console,
  log: jest.fn(),
};

jest.setTimeout(30000);

describe('Database Initialization Flow', () => {
    
    beforeAll(async () => {
       // Reset DB state if possible - but for SQLITE :memory: it resets on connection.
       // Here we assume setupTestDb is running fresh
    });

    afterAll((done) => {
        db.close(done);
    });

    test('Step 1: Migrations - Users table should exist', async () => {
        await setupTestDb(); // Runs migrations + roles
        
        return new Promise((resolve, reject) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='Users'", (err, row) => {
                if (err) reject(err);
                try {
                    expect(row).toBeDefined();
                    expect(row.name).toBe('Users');
                    resolve();
                } catch(e) { reject(e); }
            });
        });
    });

    test('Step 2: Seed Roles - UserRoles should be populated', async () => {
        return new Promise((resolve, reject) => {
            db.all("SELECT * FROM UserRoles", (err, rows) => {
                if (err) reject(err);
                try {
                    expect(rows.length).toBeGreaterThan(0);
                    expect(rows.find(r => r.userrole_name === 'librarian')).toBeDefined();
                    expect(rows.find(r => r.userrole_name === 'reader')).toBeDefined();
                    resolve();
                } catch(e) { reject(e); }
            });
        });
    });

    test('Step 3: Seed Users - Default users should be created only if empty', async () => {
        // Initial user seed
        await seedUsers(db);

        // Verify users exist
        await new Promise((resolve, reject) => {
            db.all("SELECT user_username FROM Users", (err, rows) => {
                if (err) reject(err);
                try {
                    const usernames = rows.map(r => r.user_username);
                    expect(usernames).toContain('admin');
                    expect(usernames).toContain('reader1');
                    resolve();
                } catch(e) { reject(e); }
            });
        });

        // Verification of idempotency: Run seed again, should not error or duplicate
        // Note: The logic in seed_users.js checks for COUNT > 0, so it should just return.
        await seedUsers(db); 
         
         // Count should remain the same (3 default users)
         await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM Users", (err, row) => {
                 if(err) reject(err);
                 try {
                     expect(row.count).toBe(3);
                     resolve();
                 } catch(e) { reject(e); }
            });
         });
    });
});
