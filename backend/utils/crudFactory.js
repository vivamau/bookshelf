const express = require('express');

const createCrudRouter = (tableName, db, primaryKey = 'ID', allowedMethods = ['GET', 'POST', 'PUT', 'DELETE']) => {
    const router = express.Router();

    // GET all
    if (allowedMethods.includes('GET')) {
        router.get('/', (req, res) => {
            const sql = `SELECT * FROM ${tableName}`;
            db.all(sql, [], (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ data: rows });
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
            const columns = Object.keys(req.body).join(', ');
            const placeholders = Object.keys(req.body).map(() => '?').join(', ');
            const values = Object.values(req.body);
            
            const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`; 
            
            db.run(sql, values, function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ data: { id: this.lastID, ...req.body } });
            });
        });
    }

    // PUT (Update)
    if (allowedMethods.includes('PUT')) {
        router.put('/:id', (req, res) => {
            const updates = Object.keys(req.body).map(key => `${key} = ?`).join(', ');
            const values = [...Object.values(req.body), req.params.id];

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
