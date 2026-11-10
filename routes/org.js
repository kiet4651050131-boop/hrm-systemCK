const express = require('express');
const { db, audit } = require('../db');
const { auth, need } = require('../middleware');

// Tạo router CRUD đơn giản cho phòng ban / chức danh
function makeRouter(table, fk, label) {
  const r = express.Router();
  r.use(auth);
  r.get('/', (req, res) => res.json(db.prepare(`SELECT id, name FROM ${table} ORDER BY name`).all()));
  r.post('/', need('admin', 'hr'), (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên' });
    if (db.prepare(`SELECT 1 FROM ${table} WHERE name = ?`).get(name)) return res.status(409).json({ error: `${label} đã tồn tại` });
    const info = db.prepare(`INSERT INTO ${table}(name) VALUES (?)`).run(name);
    audit(req.user, `Thêm ${label.toLowerCase()} ${name}`);
    res.status(201).json({ id: info.lastInsertRowid, name });
  });
  r.delete('/:id', need('admin', 'hr'), (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
    if (db.prepare(`SELECT 1 FROM employees WHERE ${fk} = ?`).get(row.id)) return res.status(409).json({ error: 'Đang có nhân viên thuộc mục này, không thể xóa' });
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    audit(req.user, `Xóa ${label.toLowerCase()} ${row.name}`);
    res.json({ ok: true });
  });
  return r;
}

module.exports = {
  departments: makeRouter('departments', 'department_id', 'Phòng ban'),
  positions: makeRouter('positions', 'position_id', 'Chức danh'),
};
