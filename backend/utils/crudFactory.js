const express = require('express');

const createCrudRouter = (tableName, db, primaryKey = 'ID', allowedMethods = ['GET', 'POST', 'PUT', 'DELETE']) => {
    const router = express.Router();

    const getValidColumns = (cb) => {
        db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
            if (err) return cb(err);
            cb(null, rows.map(r => r.name));
        });
    };

    // GET all
    if (allowedMethods.includes('GET')) {
        router.get('/', (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 1000; // Default to 1000 if not specified
            const offset = (page - 1) * limit;

            const countSql = `SELECT COUNT(*) as total FROM ${tableName}`;
            const sql = `SELECT * FROM ${tableName} LIMIT ? OFFSET ?`;

            db.get(countSql, [], (err, countRow) => {
                if (err) return res.status(500).json({ error: err.message });
                
                db.all(sql, [limit, offset], (err, rows) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ 
                        data: rows,
                        total: countRow.total,
                        page: page,
                        limit: limit
                    });
                });
            });
        });

        // GET by ID
        router.get('/:id', (req, res) => {
            const sql = `SELECT * FROM ${tableName} WHERE ${primaryKey} = ?`;
            db.get(sql, [req.params.id], (err, row) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                if (!row) {
                    return res.status(404).json({ error: 'Record not found' });
                }
                res.json({ data: row });
            });
        });
    }

    // POST (Create)
    if (allowedMethods.includes('POST')) {
        router.post('/', (req, res) => {
            getValidColumns((err, validColumns) => {
                if (err) return res.status(500).json({ error: err.message });

                const data = {};
                Object.keys(req.body).forEach(key => {
                    if (validColumns.includes(key)) {
                        data[key] = req.body[key];
                    }
                });

                if (Object.keys(data).length === 0) {
                     return res.status(400).json({ error: 'No valid columns provided' });
                }

                const columns = Object.keys(data).join(', ');
                const placeholders = Object.keys(data).map(() => '?').join(', ');
                const values = Object.values(data);

                const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;

                db.run(sql, values, function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(201).json({ data: { id: this.lastID, ...data } });
                });
            });
        });
    }

    // PUT (Update)
    if (allowedMethods.includes('PUT')) {
        router.put('/:id', (req, res) => {
            getValidColumns((err, validColumns) => {
                if (err) return res.status(500).json({ error: err.message });

                const data = {};
                Object.keys(req.body).forEach(key => {
                    if (validColumns.includes(key)) {
                        data[key] = req.body[key];
                    }
                });

                if (Object.keys(data).length === 0) {
                     return res.status(400).json({ error: 'No valid columns provided' });
                }

                const updates = Object.keys(data).map(key => `${key} = ?`).join(', ');
                const values = [...Object.values(data), req.params.id];

                const sql = `UPDATE ${tableName} SET ${updates} WHERE ${primaryKey} = ?`;

                db.run(sql, values, function(err) {
                    if (err) {
                    return res.status(500).json({ error: err.message });
                    }
                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'Record not found' });
                    }
                    res.json({ message: 'Record updated', changes: this.changes });
                });
            });
        });
    }

    // DELETE
    if (allowedMethods.includes('DELETE')) {
        router.delete('/:id', (req, res) => {
            const sql = `DELETE FROM ${tableName} WHERE ${primaryKey} = ?`;
            db.run(sql, [req.params.id], function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Record not found' });
                }
                res.json({ message: 'Record deleted', changes: this.changes });
            });
        });
    }

    return router;
};

module.exports = createCrudRouter;
