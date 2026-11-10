const router = require('express').Router();
const { db, audit, recordHistory } = require('../db');
const { auth, need, EMAIL_RE } = require('../middleware');
const L = require('../lib');

router.use(auth);

const SELECT = `SELECT e.id, e.code, e.name, e.email, e.phone, e.department_id, e.position_id, e.status, e.start_date,
  d.name AS department, p.name AS position
  FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN positions p ON p.id = e.position_id`;
const STATUSES = ['Thử việc', 'Chính thức', 'Nghỉ việc', 'Chờ cập nhật'];

const isMng = (u) => u.role === 'admin' || u.role === 'hr';
const me = (u) => db.prepare('SELECT * FROM employees WHERE email = ?').get(u.email);
const validPhone = (value) => {
  const phone = String(value || '').trim();
  if (!phone) return true;
  const digits = phone.replace(/\D/g, '');
  return /^[+()\d.\-\s]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
};

// Phạm vi xem: nhân viên = chỉ mình; quản lý = cùng phòng ban + mình; HR/Admin = tất cả
function scopeSql(u) {
  if (isMng(u)) return { sql: '', args: [] };
  const m = me(u);
  if (!m) return { sql: ' AND 1=0', args: [] };
  if (u.role === 'manager' && m.department_id) return { sql: ' AND (e.department_id = ? OR e.id = ?)', args: [m.department_id, m.id] };
  return { sql: ' AND e.id = ?', args: [m.id] };
}

function canSee(u, id) {
  const s = scopeSql(u);
  return db.prepare(`${SELECT} WHERE e.id = ?${s.sql}`).get(id, ...s.args);
}

router.get('/export', (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'Bạn không đủ quyền xuất danh sách nhân viên' });
  const scope = scopeSql(req.user);
  let sql = `${SELECT} WHERE 1=1${scope.sql}`;
  const args = [...scope.args];
  if (req.query.department_id) {
    const departmentId = Number(req.query.department_id);
    if (!Number.isInteger(departmentId) || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId)) {
      return res.status(400).json({ error: 'Phòng ban không hợp lệ' });
    }
    sql += ' AND e.department_id = ?';
    args.push(departmentId);
  }
  const employees = db.prepare(sql + ' ORDER BY e.code').all(...args);
  const rows = [
    ['Mã nhân viên', 'Họ tên', 'Email', 'Số điện thoại', 'Phòng ban', 'Chức danh', 'Trạng thái', 'Ngày vào làm'],
    ...employees.map((employee) => [
      employee.code, employee.name, employee.email, employee.phone, employee.department,
      employee.position, employee.status, employee.start_date,
    ]),
  ];
  audit(req.user, `Xuất danh sách nhân viên: ${employees.length}`);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="danh-sach-nhan-vien.csv"',
  });
  res.send('\uFEFF' + rows.map((row) => row.map(L.csvCell).join(',')).join('\r\n'));
});

router.get('/', (req, res) => {
  const s = scopeSql(req.user);
  let sql = `${SELECT} WHERE 1=1${s.sql}`;
  const args = [...s.args];
  if (req.query.q) {
    sql += ' AND (e.name LIKE ? OR e.code LIKE ? OR e.email LIKE ?)';
    const k = `%${req.query.q}%`;
    args.push(k, k, k);
  }
  if (req.query.department_id) { sql += ' AND e.department_id = ?'; args.push(req.query.department_id); }
  res.json(db.prepare(sql + ' ORDER BY e.code').all(...args));
});

function validate(b, id) {
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  if (!name) return 'Vui lòng nhập họ tên';
  if (!code) return 'Vui lòng nhập mã nhân viên';
  if (!EMAIL_RE.test(email)) return 'Email không hợp lệ';
  if (!validPhone(b.phone)) return 'Số điện thoại không hợp lệ (7–15 chữ số)';
  if (b.start_date && !L.validDate(String(b.start_date))) return 'Ngày vào làm không hợp lệ';
  if (b.status && !STATUSES.includes(b.status)) return 'Trạng thái không hợp lệ';
  if (db.prepare('SELECT 1 FROM employees WHERE (email = ? OR code = ?) AND id != ?').get(email, code, id || 0)) return 'Mã hoặc email bị trùng';
  if (b.department_id && !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(b.department_id)) return 'Phòng ban không tồn tại';
  if (b.position_id && !db.prepare('SELECT 1 FROM positions WHERE id = ?').get(b.position_id)) return 'Chức danh không tồn tại';
  return null;
}

router.post('/', need('admin', 'hr'), (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const info = db.prepare(`INSERT INTO employees(code, name, email, phone, department_id, position_id, status, start_date) VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.code.trim(), b.name.trim(), b.email.trim().toLowerCase(), String(b.phone || ''), b.department_id || null, b.position_id || null, b.status || 'Thử việc', String(b.start_date || ''));
  const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
  recordHistory(created, req.user, 'employee', { profile: { old: null, new: {
    code: created.code, name: created.name, email: created.email, department_id: created.department_id,
    position_id: created.position_id, status: created.status, start_date: created.start_date,
  } } });
  audit(req.user, `Thêm nhân viên ${b.code}`);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const cur = canSee(req.user, req.params.id);
  if (!cur) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  if (isMng(req.user)) {
    const err = validate({ ...cur, ...req.body }, cur.id);
    if (err) return res.status(400).json({ error: err });
    const b = { ...cur, ...req.body };
    db.prepare(`UPDATE employees SET code=?, name=?, email=?, phone=?, department_id=?, position_id=?, status=?, start_date=? WHERE id=?`)
      .run(b.code.trim(), b.name.trim(), b.email.trim().toLowerCase(), String(b.phone || ''), b.department_id || null, b.position_id || null, b.status, String(b.start_date || ''), cur.id);
    const labels = {
      code: 'Mã nhân viên', name: 'Họ tên', email: 'Email', phone: 'Số điện thoại',
      department_id: 'Phòng ban', position_id: 'Chức danh', status: 'Trạng thái', start_date: 'Ngày vào làm',
    };
    const changes = {};
    Object.keys(labels).forEach((key) => {
      const oldValue = cur[key] == null ? '' : String(cur[key]);
      const newValue = b[key] == null ? '' : String(b[key]);
      if (oldValue !== newValue) changes[labels[key]] = { old: oldValue, new: newValue };
    });
    recordHistory(cur, req.user, 'employee', changes);
  } else if (cur.email === req.user.email) {
    // Nhân viên / quản lý chỉ được sửa số điện thoại của chính mình
    const phone = String(req.body.phone || '');
    if (!validPhone(phone)) return res.status(400).json({ error: 'Số điện thoại không hợp lệ (7–15 chữ số)' });
    db.prepare('UPDATE employees SET phone = ? WHERE id = ?').run(String(req.body.phone || ''), cur.id);
    recordHistory(cur, req.user, 'employee', cur.phone !== phone
      ? { 'Số điện thoại': { old: cur.phone, new: phone } } : {});
  } else {
    return res.status(403).json({ error: 'Bạn không đủ quyền sửa hồ sơ này' });
  }
  audit(req.user, `Sửa hồ sơ ${cur.code}`);
  res.json({ ok: true });
});

router.delete('/:id', need('admin', 'hr'), (req, res) => {
  const cur = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  if (db.prepare('SELECT 1 FROM payslips WHERE employee_id = ?').get(cur.id)) {
    return res.status(409).json({ error: 'Nhân viên đã có phiếu lương nên không thể xóa. Hãy chuyển trạng thái sang "Nghỉ việc"' });
  }
  recordHistory(cur, req.user, 'employee', { profile: { old: 'Đang làm việc', new: 'Đã xóa hồ sơ' } });
  db.prepare('DELETE FROM employees WHERE id = ?').run(cur.id);
  audit(req.user, `Xóa nhân viên ${cur.code}`);
  res.json({ ok: true });
});

// Import CSV: mã, họ tên, email, phòng ban, chức danh (mỗi dòng một người)
router.post('/import', need('admin', 'hr'), (req, res) => {
  const lines = String(req.body.csv || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: 'Chưa có dữ liệu' });
  if (lines.length > 2000) return res.status(400).json({ error: 'Tối đa 2000 dòng mỗi lần import' });
  const errors = [];
  let imported = 0;
  const ensure = (table, name) => {
    if (!name) return null;
    const f = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name);
    return f ? f.id : db.prepare(`INSERT INTO ${table}(name) VALUES (?)`).run(name).lastInsertRowid;
  };
  db.transaction(() => {
    lines.forEach((ln, i) => {
      const c = ln.split(/[,;\t]/).map((s) => s.trim());
      if (i === 0 && /email/i.test(ln)) return;
      const [code, name, email0, dept, pos] = c;
      const email = (email0 || '').toLowerCase();
      if (!code || !name || !email0) return errors.push(`Dòng ${i + 1}: thiếu mã, họ tên hoặc email`);
      if (!EMAIL_RE.test(email)) return errors.push(`Dòng ${i + 1}: email không hợp lệ`);
      if (db.prepare('SELECT 1 FROM employees WHERE email = ? OR code = ?').get(email, code)) return errors.push(`Dòng ${i + 1}: trùng mã hoặc email`);
      const info = db.prepare('INSERT INTO employees(code, name, email, department_id, position_id) VALUES (?,?,?,?,?)')
        .run(code, name, email, ensure('departments', dept), ensure('positions', pos));
      const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
      recordHistory(created, req.user, 'employee', { profile: { old: null, new: {
        code: created.code, name: created.name, email: created.email, department_id: created.department_id,
        position_id: created.position_id, status: created.status, start_date: created.start_date,
      } } });
      imported++;
    });
  })();
  audit(req.user, `Import CSV: ${imported} thành công, ${errors.length} lỗi`);
  res.json({ imported, errors });
});

module.exports = router;
