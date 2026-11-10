const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, audit } = require('../db');
const { sign, auth, wrap, EMAIL_RE } = require('../middleware');
const L = require('../lib');
const { getMailConfig, sendEmail, escapeHtml } = require('../mailer');

// Giới hạn đăng nhập sai: 10 lần / 15 phút cho mỗi IP + email
const fails = new Map();
const LIMIT = 10, WINDOW = 15 * 60 * 1000;
function tooMany(key) {
  const now = Date.now();
  const a = (fails.get(key) || []).filter((t) => now - t < WINDOW);
  fails.set(key, a);
  return a.length >= LIMIT;
}

const usersCount = () => db.prepare('SELECT COUNT(*) c FROM users').get().c;
const CLOSED = 'Đăng ký tự do đã đóng. Vui lòng liên hệ Admin hoặc HR để được cấp tài khoản.';
const RESET_MESSAGE = 'Nếu địa chỉ email thuộc một tài khoản, hướng dẫn khôi phục sẽ được gửi đến email đó.';
const RESET_TOKEN_TTL = 30 * 60 * 1000;
const resetRequests = new Map();

function takeResetRequest(ip) {
  const now = Date.now();
  const requests = (resetRequests.get(ip) || []).filter((time) => now - time < WINDOW);
  if (requests.length >= 5) {
    resetRequests.set(ip, requests);
    return false;
  }
  requests.push(now);
  resetRequests.set(ip, requests);
  return true;
}

// Giao diện hỏi để biết có hiện nút "Đăng ký" không: chỉ mở khi hệ thống chưa có tài khoản nào
router.get('/status', (req, res) => res.json({ registrationOpen: usersCount() === 0 }));

router.post('/forgot-password', wrap(async (req, res) => {
  if (!takeResetRequest(req.ip)) {
    return res.status(429).json({ error: 'Bạn đã yêu cầu quá nhiều lần, vui lòng thử lại sau 15 phút' });
  }
  const config = getMailConfig();
  if (!config) return res.status(503).json({ error: 'Chức năng email khôi phục chưa được cấu hình đầy đủ' });

  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (!user) return res.json({ message: RESET_MESSAGE });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + RESET_TOKEN_TTL;
  db.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ?').run(Date.now());
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_reset_tokens(token_hash, user_id, expires_at) VALUES (?,?,?)')
    .run(tokenHash, user.id, expiresAt);

  const link = `${config.appUrl}/?reset=${token}`;
  try {
    await sendEmail(config, {
      to: user.email,
      subject: 'Khôi phục mật khẩu HRM',
      text: `Xin chào ${user.name},\n\nĐể đặt lại mật khẩu, mở liên kết sau trong vòng 30 phút:\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
      html: `<p>Xin chào ${escapeHtml(user.name)},</p><p>Để đặt lại mật khẩu, hãy mở liên kết sau trong vòng 30 phút:</p><p><a href="${link}">Đặt lại mật khẩu</a></p><p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
    });
  } catch (error) {
    db.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    console.error('Không gửi được email khôi phục mật khẩu:', error.message);
    return res.status(503).json({ error: 'Không gửi được email khôi phục. Vui lòng thử lại hoặc liên hệ Admin.' });
  }
  res.json({ message: RESET_MESSAGE });
}));

router.post('/reset-password', wrap(async (req, res) => {
  const body = req.body || {};
  const token = String(body.token || '');
  const password = String(body.password || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'Liên kết khôi phục không hợp lệ hoặc đã hết hạn' });
  if (password.length < 8) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 8 ký tự' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = db.prepare(`
    SELECT t.user_id, t.expires_at, u.email
    FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
  `).get(tokenHash);
  if (!reset || reset.expires_at <= Date.now()) {
    if (reset) db.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
    return res.status(400).json({ error: 'Liên kết khôi phục không hợp lệ hoặc đã hết hạn' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const email = db.transaction(() => {
    const current = db.prepare('SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?').get(tokenHash);
    if (!current || current.expires_at <= Date.now()) return null;
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(passwordHash, current.user_id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(current.user_id);
    return reset.email;
  })();
  if (!email) return res.status(400).json({ error: 'Liên kết khôi phục không hợp lệ hoặc đã hết hạn' });
  audit({ email }, 'Khôi phục mật khẩu qua email');
  res.json({ ok: true, message: 'Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.' });
}));

// Chỉ dùng để tạo tài khoản Admin đầu tiên. Sau đó Admin/HR tạo tài khoản ở POST /api/users
router.post('/register', wrap(async (req, res) => {
  if (usersCount() > 0) return res.status(403).json({ error: CLOSED });
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập họ tên' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
  if (password.length < 8) return res.status(400).json({ error: 'Mật khẩu tối thiểu 8 ký tự' });

  const hash = await bcrypt.hash(password, 10);
  const tx = db.transaction(() => {
    if (usersCount() > 0) return false; // có người đăng ký trước trong lúc chờ mã hóa mật khẩu
    db.prepare("INSERT INTO users(email, name, password_hash, role, must_change_password) VALUES (?,?,?, 'admin', 0)").run(email, name, hash);
    if (!db.prepare('SELECT 1 FROM employees WHERE email = ?').get(email)) {
      db.prepare("INSERT INTO employees(code, name, email, status) VALUES (?,?,?, 'Chờ cập nhật')").run(L.nextEmployeeCode(), name, email);
    }
    return true;
  });
  if (!tx()) return res.status(403).json({ error: CLOSED });
  audit({ email }, 'Tạo tài khoản Admin đầu tiên');
  res.status(201).json({ ok: true, role: 'admin' });
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const key = req.ip + '|' + email;
  if (tooMany(key)) return res.status(429).json({ error: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = u && (await bcrypt.compare(String(req.body.password || ''), u.password_hash));
  if (!ok) {
    fails.get(key).push(Date.now());
    return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  }
  fails.delete(key);
  audit(u, 'Đăng nhập');
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name, role: u.role, must_change_password: u.must_change_password } });
}));

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

router.post('/change-password', auth, wrap(async (req, res) => {
  const { current, next } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(String(current || ''), u.password_hash))) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
  const nextPassword = String(next || '');
  if (nextPassword.length < 8) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 8 ký tự' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await bcrypt.hash(nextPassword, 10), u.id);
  audit(u, 'Đổi mật khẩu');
  res.json({ ok: true });
}));

module.exports = router;
