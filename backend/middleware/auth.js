const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
    // Collect token from various sources, prioritizing secure methods (Cookie/Header) over URL/Body
    let token = null;

    // 1. Check Cookies (HttpOnly - Safest)
    if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {});
        token = cookies.token;
    }

    // 2. Check Headers (Standard Bearer/Access-Token)
    if (!token) {
        token = req.headers['x-access-token'] || req.headers['authorization']?.split(' ')[1];
    }

    // 3. Fallback: Body or Query (Least secure)
    if (!token) {
        token = req.body.token || req.query.token;
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
