const bcrypt = require('bcryptjs');
const db = require('../config/db');

const opdsAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Bookshelf OPDS"');
        return res.status(401).send('Authentication required');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const username = auth[0];
    const password = auth[1];

    const sql = `
        SELECT u.*, r.userrole_name, r.userrole_manageusers, r.userrole_managebooks, r.userrole_readbooks, r.userrole_viewbooks 
        FROM Users u
        LEFT JOIN UserRoles r ON u.userrole_id = r.ID
        WHERE u.user_username = ?
    `;

    db.get(sql, [username], async (err, user) => {
        if (err) {
            console.error("DB Error during OPDS auth:", err);
            return res.status(500).send("Server error");
        }
        if (!user) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Bookshelf OPDS"');
            return res.status(401).send("Invalid Credentials");
        }

        const validPass = await bcrypt.compare(password, user.user_password);
        if (!validPass) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Bookshelf OPDS"');
            return res.status(401).send("Invalid Credentials");
        }

        req.user = {
            user_id: user.ID,
            username: user.user_username,
            userrole_manageusers: user.userrole_manageusers,
            userrole_managebooks: user.userrole_managebooks,
            userrole_readbooks: user.userrole_readbooks,
            userrole_viewbooks: user.userrole_viewbooks
        };
        next();
    });
};

module.exports = opdsAuth;
