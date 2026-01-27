const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
    // Collect token from various sources
    let token = req.body.token || req.query.token || req.headers['x-access-token'] || req.headers['authorization']?.split(' ')[1];

    // Fallback: Check Cookies (manually parse since cookie-parser might not be installed)
    if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {});
        token = cookies.token;
    }

    if (!token) {
        return res.status(403).send('A token is required for authentication');
    }

    try {
        const decoded = jwt.verify(token, process.env.TOKEN_KEY || 'default_secret_key'); 
        req.user = decoded;
    } catch (err) {
        return res.status(401).send('Invalid Token');
    }
    return next();
};

module.exports = verifyToken;
