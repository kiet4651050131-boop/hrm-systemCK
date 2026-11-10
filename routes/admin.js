const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, audit } = require('../db');
const { auth, need, wrap, EMAIL_RE } = require('../middleware');
const L = require('../lib');

router.use(auth);

const ROLES = ['admin', 'hr', 'manager', 'employee'];

// ----- Tài khoản (chỉ Admin) -----
router.get('/users', need('admin'), (req, res) =>
  res.json(db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY id').all()));

// Tạo tài khoản cho nhân viên (thay cho đăng ký tự do).
// Admin tạo được mọi vai trò; HR chỉ tạo tài khoản Nhân viên. Không gửi mật khẩu thì hệ thống sinh mật khẩu tạm.
router.post('/users', need('admin', 'hr'), wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const role = b.role || 'employee';
  const given = b.password == null || b.password === '' ? null : String(b.password);
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập họ tên' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
  if (req.user.role === 'hr' && role !== 'employee') return res.status(403).json({ error: 'HR chỉ được tạo tài khoản Nhân viên' });
  if (given !== null && given.length < 8) return res.status(400).json({ error: 'Mật khẩu tối thiểu 8 ký tự' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Email đã có tài khoản' });

  const temp = given === null ? crypto.randomBytes(6).toString('base64url') : null;
  const hash = await bcrypt.hash(given === null ? temp : given, 10);
  const id = db.transaction(() => {
    const info = db.prepare('INSERT INTO users(email, name, password_hash, role, must_change_password) VALUES (?,?,?,?,1)').run(email, name, hash, role);
    // Hồ sơ nhân viên đã có sẵn (vd. import CSV) thì liên kết theo email, chưa có thì tạo mới
    if (!db.prepare('SELECT 1 FROM employees WHERE email = ?').get(email)) {
      db.prepare("INSERT INTO employees(code, name, email, status) VALUES (?,?,?, 'Chờ cập nhật')").run(L.nextEmployeeCode(), name, email);
    }
    return Number(info.lastInsertRowid);
  })();
  audit(req.user, `Tạo tài khoản ${email} (${role})`);
  res.status(201).json({ id, ...(temp ? { temporaryPassword: temp } : {}) });
}));

router.put('/users/:id/role', need('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Không thể đổi vai trò của chính mình' });
  if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, u.id);
  audit(req.user, `Đổi vai trò ${u.email} thành ${req.body.role}`);
  res.json({ ok: true });
});

// Đặt lại mật khẩu: sinh mật khẩu tạm ngẫu nhiên, trả về cho Admin chuyển cho nhân viên
router.post('/users/:id/reset-password', need('admin'), wrap(async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Hãy dùng chức năng đổi mật khẩu' });
  const temp = crypto.randomBytes(6).toString('base64url');
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await bcrypt.hash(temp, 10), u.id);
  audit(req.user, `Đặt lại mật khẩu ${u.email}`);
  res.json({ temporaryPassword: temp });
}));

router.delete('/users/:id', need('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  audit(req.user, `Xóa tài khoản ${u.email}`);
  res.json({ ok: true });
});

// ----- Nhật ký thao tác (Admin, HR) -----
router.get('/logs', need('admin', 'hr'), (req, res) =>
  res.json(db.prepare('SELECT at, user_email, action FROM audit_logs ORDER BY id DESC LIMIT 300').all()));

module.exports = router;
