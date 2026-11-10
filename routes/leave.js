const router = require('express').Router();
const { db, audit, notifyUser } = require('../db');
const { auth } = require('../middleware');
const L = require('../lib');
const { notifyWorkflowEmail } = require('../mailer');

router.use(auth);

const PENDING = ['Chờ quản lý', 'Chờ HR'];
const ACTIVE = ['Chờ quản lý', 'Chờ HR', 'Đã duyệt'];
const SEL = `SELECT r.id, r.employee_id, r.type_id, r.from_date, r.to_date, r.days, r.half, r.reason, r.status, r.manager_note, r.decided_by, r.created_at,
  e.code, e.name, e.email, e.department_id, d.name AS department, t.name AS type, t.paid
  FROM leave_requests r JOIN employees e ON e.id = r.employee_id JOIN leave_types t ON t.id = r.type_id
  LEFT JOIN departments d ON d.id = e.department_id`;

function canDecide(u, r) {
  if (r.email === u.email || !PENDING.includes(r.status)) return false;
  if (L.isHr(u)) return true;
  if (u.role === 'manager' && r.status === 'Chờ quản lý') {
    const m = L.meEmp(u);
    return !!m && !!m.department_id && m.department_id === r.department_id;
  }
  return false;
}
function canCancel(u, r) {
  if (L.isHr(u)) return ACTIVE.includes(r.status);
  return r.email === u.email && PENDING.includes(r.status);
}
const hasManager = (emp) => !!emp.department_id && !!db.prepare(
  "SELECT 1 FROM users u JOIN employees e ON e.email = u.email WHERE u.role = 'manager' AND e.department_id = ? AND e.id != ?",
).get(emp.department_id, emp.id);
const notifyHr = (title, message) => {
  const users = db.prepare("SELECT id, email FROM users WHERE role IN ('admin','hr')").all();
  users.forEach((user) => notifyUser(user.id, title, message, '/leave'));
  notifyWorkflowEmail(users.map((user) => user.email), title, `${message}\nĐăng nhập hệ thống để xử lý đơn nghỉ.`);
};

function balance(empId, year) {
  const st = L.getSettings();
  const q = (statuses) => db.prepare(`SELECT COALESCE(SUM(r.days),0) s FROM leave_requests r JOIN leave_types t ON t.id = r.type_id
    WHERE r.employee_id = ? AND t.uses_quota = 1 AND r.from_date LIKE ? AND r.status IN (${statuses.map(() => '?').join(',')})`)
    .get(empId, `${year}-%`, ...statuses).s;
  const quota = Number(st.annual_leave_days);
  const used = q(['Đã duyệt']), pending = q(PENDING);
  return { year: Number(year), quota, used, pending, remaining: quota - used - pending };
}

router.get('/types', (req, res) => res.json(db.prepare('SELECT id, name, paid, uses_quota FROM leave_types ORDER BY id').all()));

router.get('/balance', (req, res) => {
  let e = L.meEmp(req.user);
  if (req.query.employee_id && L.isHr(req.user)) e = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.query.employee_id);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy hồ sơ nhân viên' });
  res.json(balance(e.id, req.query.year || L.today().slice(0, 4)));
});

router.get('/', (req, res) => {
  const s = L.scopeSql(req.user);
  let sql = `${SEL} WHERE 1=1${s.sql}`;
  const args = [...s.args];
  if (req.query.status) { sql += ' AND r.status = ?'; args.push(req.query.status); }
  sql += " ORDER BY CASE WHEN r.status IN ('Chờ quản lý','Chờ HR') THEN 0 ELSE 1 END, r.from_date DESC, r.id DESC LIMIT 500";
  res.json(db.prepare(sql).all(...args).map((r) => ({ ...r, email: undefined, can_decide: canDecide(req.user, r), can_cancel: canCancel(req.user, r) })));
});

router.post('/', (req, res) => {
  const e = L.meEmp(req.user);
  if (!e) return res.status(404).json({ error: 'Tài khoản chưa có hồ sơ nhân viên' });
  if (e.status === 'Nghỉ việc') return res.status(403).json({ error: 'Hồ sơ đã ở trạng thái nghỉ việc' });
  const b = req.body || {};
  const type = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(b.type_id);
  if (!type) return res.status(400).json({ error: 'Vui lòng chọn loại nghỉ' });
  const from = String(b.from_date || ''), to = String(b.to_date || b.from_date || '');
  if (!L.validDate(from) || !L.validDate(to)) return res.status(400).json({ error: 'Ngày nghỉ không hợp lệ' });
  if (to < from) return res.status(400).json({ error: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu' });
  if (b.half && from !== to) return res.status(400).json({ error: 'Nghỉ nửa ngày chỉ áp dụng cho một ngày' });
  if (from.slice(0, 4) !== to.slice(0, 4)) return res.status(400).json({ error: 'Đơn nghỉ không được vắt qua năm, vui lòng tách thành hai đơn' });
  if (L.hasLockedPayrollInRange(from, to)) return res.status(409).json({ error: 'Khoảng nghỉ có ngày thuộc kỳ lương đã chốt, không thể tạo hoặc thay đổi đơn' });
  if (to > L.fmtDate(new Date(new Date().getFullYear() + 1, 11, 31))) return res.status(400).json({ error: 'Ngày nghỉ quá xa' });
  const half = b.half && from === to ? 1 : 0;
  const st = L.getSettings();
  const days = L.workdays(from, to, st, L.holidays(from, to)).length * (half ? 0.5 : 1);
  if (days === 0) return res.status(400).json({ error: 'Khoảng thời gian này không có ngày làm việc (cuối tuần hoặc ngày lễ)' });
  if (db.prepare(`SELECT 1 FROM leave_requests WHERE employee_id = ? AND status IN ('Chờ quản lý','Chờ HR','Đã duyệt') AND from_date <= ? AND to_date >= ?`).get(e.id, to, from)) {
    return res.status(400).json({ error: 'Bạn đã có đơn nghỉ trùng thời gian này' });
  }
  if (type.uses_quota) {
    const bal = balance(e.id, from.slice(0, 4));
    if (days > bal.remaining) return res.status(400).json({ error: `Số ngày phép còn lại năm ${bal.year} là ${bal.remaining}, không đủ cho đơn ${days} ngày` });
  }
  const status = req.user.role === 'employee' && hasManager(e) ? 'Chờ quản lý' : 'Chờ HR';
  const info = db.prepare('INSERT INTO leave_requests(employee_id, type_id, from_date, to_date, half, days, reason, status) VALUES (?,?,?,?,?,?,?,?)')
    .run(e.id, type.id, from, to, half, days, String(b.reason || '').slice(0, 500), status);
  audit(req.user, `Tạo đơn nghỉ #${info.lastInsertRowid} (${type.name}, ${from} → ${to}, ${days} ngày)`);
  if (status === 'Chờ quản lý') {
    const managers = db.prepare(`SELECT u.id, u.email FROM users u JOIN employees manager ON manager.email = u.email
      WHERE u.role = 'manager' AND manager.department_id = ? AND manager.id != ?`)
      .all(e.department_id, e.id);
    const message = `${e.name} gửi đơn ${type.name} từ ${from} đến ${to}.`;
    managers.forEach((user) => notifyUser(user.id, 'Đơn nghỉ cần duyệt', message, '/leave'));
    notifyWorkflowEmail(managers.map((user) => user.email), 'Đơn nghỉ cần duyệt', `${message}\nĐăng nhập hệ thống để xử lý đơn nghỉ.`);
  } else notifyHr('Đơn nghỉ cần xử lý', `${e.name} gửi đơn ${type.name} từ ${from} đến ${to}.`);
  res.status(201).json({ id: info.lastInsertRowid, status, days });
});

const find = (id) => db.prepare(`${SEL} WHERE r.id = ?`).get(id);

router.put('/:id/decide', (req, res) => {
  const r = find(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  if (!canDecide(req.user, r)) return res.status(403).json({ error: 'Bạn không có quyền xử lý đơn này ở bước hiện tại' });
  if (L.hasLockedPayrollInRange(r.from_date, r.to_date)) return res.status(409).json({ error: 'Đơn có ngày thuộc kỳ lương đã chốt, không thể duyệt hoặc từ chối' });
  const note = String((req.body || {}).note || '').slice(0, 300);
  let status;
  if (req.body && req.body.action === 'reject') status = 'Từ chối';
  else if (req.body && req.body.action === 'approve') status = r.status === 'Chờ quản lý' && !L.isHr(req.user) ? 'Chờ HR' : 'Đã duyệt';
  else return res.status(400).json({ error: 'Hành động không hợp lệ' });
  db.prepare('UPDATE leave_requests SET status = ?, manager_note = ?, decided_by = ? WHERE id = ?').run(status, note, req.user.email, r.id);
  audit(req.user, `Đơn nghỉ #${r.id} của ${r.code}: ${r.status} → ${status}`);
  const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(r.email);
  if (status === 'Chờ HR') {
    notifyHr('Đơn nghỉ cần HR xác nhận', `${r.name}: ${r.type}, ${r.from_date} đến ${r.to_date} đã được quản lý duyệt.`);
    if (owner) notifyUser(owner.id, 'Đơn nghỉ đã qua bước quản lý', `Đơn nghỉ ${r.from_date} đến ${r.to_date} đang chờ HR xác nhận.`, '/leave');
  } else if (owner) {
    const message = `${r.type}, ${r.from_date} đến ${r.to_date}${note ? ` · ${note}` : ''}`;
    notifyUser(owner.id, `Đơn nghỉ ${status.toLowerCase()}`, message, '/leave');
    notifyWorkflowEmail([r.email], `Đơn nghỉ ${status.toLowerCase()}`, `${message}\nĐăng nhập hệ thống để xem kết quả.`);
  }
  res.json({ ok: true, status });
});

router.put('/:id/cancel', (req, res) => {
  const r = find(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  if (!canCancel(req.user, r)) return res.status(403).json({ error: 'Không thể hủy đơn này' });
  if (L.hasLockedPayrollInRange(r.from_date, r.to_date)) return res.status(409).json({ error: 'Đơn có ngày thuộc kỳ lương đã chốt, không thể hủy' });
  db.prepare("UPDATE leave_requests SET status = 'Đã hủy', decided_by = ? WHERE id = ?").run(req.user.email, r.id);
  audit(req.user, `Hủy đơn nghỉ #${r.id} của ${r.code}`);
  if (L.isHr(req.user) && r.email !== req.user.email) {
    const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(r.email);
    if (owner) notifyUser(owner.id, 'Đơn nghỉ đã bị hủy', `Đơn từ ${r.from_date} đến ${r.to_date} đã được HR hủy.`, '/leave');
  }
  res.json({ ok: true });
});

module.exports = router;
