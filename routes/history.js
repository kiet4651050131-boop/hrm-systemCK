const router = require('express').Router();
const { db } = require('../db');
const { auth } = require('../middleware');
const L = require('../lib');

router.use(auth);

router.get('/', (req, res) => {
  const requestedId = req.query.employee_id ? Number(req.query.employee_id) : null;
  const employee = L.meEmp(req.user);
  let allowedIds = null;
  if (!L.isHr(req.user)) {
    if (!employee) return res.json([]);
    if (req.user.role === 'employee') allowedIds = [employee.id];
    else {
      const scope = L.scopeSql(req.user);
      allowedIds = db.prepare(`SELECT e.id FROM employees e WHERE 1=1${scope.sql}`)
        .all(...scope.args).map((row) => row.id);
    }
    if (requestedId && !allowedIds.includes(requestedId)) return res.status(404).json({ error: 'Không tìm thấy lịch sử' });
  }
  let sql = 'SELECT * FROM employee_history WHERE 1=1';
  const args = [];
  if (requestedId) { sql += ' AND employee_id = ?'; args.push(requestedId); }
  else if (allowedIds) {
    if (!allowedIds.length) return res.json([]);
    sql += ` AND employee_id IN (${allowedIds.map(() => '?').join(',')})`;
    args.push(...allowedIds);
  }
  if (!L.isHr(req.user)) sql += " AND entity != 'salary'";
  const rows = db.prepare(sql + ' ORDER BY id DESC LIMIT 200').all(...args);
  res.json(rows.map((row) => ({ ...row, changes: JSON.parse(row.changes) })));
});

module.exports = router;
