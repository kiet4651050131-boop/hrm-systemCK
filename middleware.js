const jwt = require('jsonwebtoken');
const { db } = require('./db');

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (process.env.NODE_ENV === 'production') throw new Error('Thiếu JWT_SECRET trong môi trường production');
  console.warn('[CẢNH BÁO] Chưa đặt JWT_SECRET, đang dùng khóa tạm cho môi trường dev.');
  SECRET = 'dev-only-secret-' + require('crypto').randomBytes(16).toString('hex');
}

const sign = (user) => jwt.sign({ id: user.id }, SECRET, { expiresIn: '8h' });

// Luôn đọc lại user từ CSDL để đổi vai trò / xóa tài khoản có hiệu lực ngay
function auth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const { id } = jwt.verify(m[1], SECRET);
    const user = db.prepare('SELECT id, email, name, role, must_change_password FROM users WHERE id = ?').get(id);
    if (!user) return res.status(401).json({ error: 'Tài khoản không còn tồn tại' });
    req.user = user;
    const allowedDuringPasswordChange = req.baseUrl === '/api/auth'
      && (req.path === '/me' || req.path === '/change-password');
    if (user.must_change_password && !allowedDuringPasswordChange) {
      return res.status(403).json({
        error: 'Bạn cần đổi mật khẩu trước khi tiếp tục',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  }
}

const need = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Bạn không đủ quyền thực hiện thao tác này' });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = { sign, auth, need, wrap, EMAIL_RE };
