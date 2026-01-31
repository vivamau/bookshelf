const db = require('../config/db');
const runMigrations = require('../run_migrations');
const seedUserRoles = require('../seed_userroles');

const setupTestDb = async () => {
    try {
        await runMigrations(db);
        await seedUserRoles(db);
    } catch (error) {
        console.error("Failed to setup test DB:", error);
        throw error;
    }
};

module.exports = { setupTestDb, db };
