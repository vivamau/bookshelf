const request = require('supertest');
const app = require('../../index');
const { setupTestDb, db } = require('../setup');

// Increase timeout for tests that involve DB setup
jest.setTimeout(30000);

beforeAll(async () => {
    await setupTestDb();
});

afterAll((done) => {
    // Ensure DB connection is closed
    db.close((err) => {
        done(err);
    });
});

describe('Auth Endpoints', () => {
    const testUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
    };

    it('POST /register should create a new user', async () => {
        const res = await request(app)
            .post('/register')
            .send(testUser);

        if (res.statusCode !== 201) {
            console.error('Register failed:', res.text);
        }
        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('token');
        expect(res.body.username).toEqual(testUser.username);
        expect(res.body.userrole_name).toEqual('guest'); // Default role
    });

    it('POST /login should login the created user', async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: testUser.username,
                password: testUser.password
            });

        if (res.statusCode !== 200) {
            console.error('Login failed:', res.text);
        }
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.username).toEqual(testUser.username);
    });

    it('POST /login should fail with wrong password', async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: testUser.username,
                password: 'wrongpassword'
            });

        expect(res.statusCode).toEqual(400);
    });

    it('POST /login should fail with non-existent user', async () => {
        const res = await request(app)
            .post('/login')
            .send({
                username: 'nonexistent',
                password: 'password123'
            });

        expect(res.statusCode).toEqual(400); // Or 401/404 depending on implementation. Code says 400 "Invalid Credentials" if user not found (db.get returns undefined)
    });
});
