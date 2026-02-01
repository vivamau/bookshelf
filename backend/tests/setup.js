const db = require('../config/db');
const runMigrations = require('../run_migrations');
const seedUsers = require('../seed_users');

const setupTestDb = async () => {
    try {
        await runMigrations(db);
        await seedUserRoles(db);
        await seedUsers(db);
    } catch (error) {
        console.error("Failed to setup test DB:", error);
        throw error;
    }
};

module.exports = { setupTestDb, db };
