const router = require('express').Router();
const { db, audit, notifyUser } = require('../db');
const { auth } = require('../middleware');
const L = require('../lib');
const { notifyWorkflowEmail } = require('../mailer');

router.use(auth);

const PENDING = ['Chờ quản lý', 'Chờ HR'];
const SELECT = `SELECT o.*, e.code, e.name, e.email, e.department_id, d.name AS department
  FROM overtime_requests o JOIN employees e ON e.id = o.employee_id
  LEFT JOIN departments d ON d.id = e.department_id`;
const getRequest = (id) => db.prepare(`${SELECT} WHERE o.id = ?`).get(id);

function canDecide(user, request) {
  if (request.email === user.email || !PENDING.includes(request.status)) return false;
  if (L.isHr(user)) return request.status === 'Chờ HR';
  if (user.role !== 'manager' || request.status !== 'Chờ quản lý') return false;
  const manager = L.meEmp(user);
  return !!manager && !!manager.department_id && manager.department_id === request.department_id;
}

function notifyRole(role, title, message) {
  const users = role === 'hr'
    ? db.prepare("SELECT id, email FROM users WHERE role IN ('admin','hr')").all()
    : db.prepare('SELECT id, email FROM users WHERE role = ?').all(role);
  users.forEach((user) => {
    notifyUser(user.id, title, message, '/overtime');
  });
  notifyWorkflowEmail(users.map((user) => user.email), title, `${message}\nĐăng nhập hệ thống để xử lý đề nghị tăng ca.`);
}

router.get('/', (req, res) => {
  const scope = L.scopeSql(req.user);
  const rows = db.prepare(`${SELECT} WHERE 1=1${scope.sql}
    ORDER BY CASE WHEN o.status IN ('Chờ quản lý','Chờ HR') THEN 0 ELSE 1 END, o.date DESC, o.id DESC LIMIT 500`)
    .all(...scope.args);
  res.json(rows.map((request) => ({
    ...request,
    email: undefined,
    can_decide: canDecide(req.user, request),
    can_cancel: L.isHr(req.user) ? PENDING.includes(request.status)
      : request.email === req.user.email && PENDING.includes(request.status),
  })));
});

router.post('/', (req, res) => {
  const employee = L.meEmp(req.user);
  if (!employee) return res.status(404).json({ error: 'Tài khoản chưa có hồ sơ nhân viên' });
  if (employee.status === 'Nghỉ việc') return res.status(403).json({ error: 'Hồ sơ đã ở trạng thái nghỉ việc' });
  const date = String((req.body || {}).date || '');
  const hours = Number((req.body || {}).hours);
  const reason = String((req.body || {}).reason || '').trim().slice(0, 500);
  if (!L.validDate(date)) return res.status(400).json({ error: 'Ngày tăng ca không hợp lệ' });
  if (L.isPayrollLocked(date.slice(0, 7))) return res.status(409).json({ error: `Kỳ lương tháng ${date.slice(0, 7)} đã chốt, không thể tạo đề nghị tăng ca` });
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 12 || Math.round(hours * 2) !== hours * 2) {
    return res.status(400).json({ error: 'Số giờ tăng ca phải từ 0,5 đến 12 và theo bước 0,5 giờ' });
  }
  if (!reason) return res.status(400).json({ error: 'Vui lòng nêu lý do tăng ca' });

  const manager = db.prepare(`SELECT 1 FROM users u JOIN employees e ON e.email = u.email
    WHERE u.role = 'manager' AND e.department_id = ? AND e.id != ? LIMIT 1`)
    .get(employee.department_id || 0, employee.id);
  const status = manager ? 'Chờ quản lý' : 'Chờ HR';
  const result = db.prepare(`INSERT INTO overtime_requests(employee_id, date, hours, reason, status)
    VALUES (?,?,?,?,?)`).run(employee.id, date, hours, reason, status);
  audit(req.user, `Tạo đề nghị tăng ca #${result.lastInsertRowid} (${date}, ${hours} giờ)`);

  if (manager) {
    const managers = db.prepare(`SELECT u.id, u.email FROM users u JOIN employees e ON e.email = u.email
      WHERE u.role = 'manager' AND e.department_id = ? AND e.id != ?`)
      .all(employee.department_id, employee.id);
    const message = `${employee.name} đề nghị tăng ca ${hours} giờ ngày ${date}.`;
    managers.forEach((user) => notifyUser(user.id, 'Đề nghị tăng ca cần duyệt', message, '/overtime'));
    notifyWorkflowEmail(managers.map((user) => user.email), 'Đề nghị tăng ca cần duyệt', `${message}\nĐăng nhập hệ thống để xử lý đề nghị tăng ca.`);
  } else notifyRole('hr', 'Đề nghị tăng ca cần xử lý', `${employee.name} đề nghị tăng ca ${hours} giờ ngày ${date}.`);
  res.status(201).json({ id: Number(result.lastInsertRowid), status });
});

router.put('/:id/decide', (req, res) => {
  const request = getRequest(req.params.id);
  if (!request) return res.status(404).json({ error: 'Không tìm thấy đề nghị tăng ca' });
  if (!canDecide(req.user, request)) return res.status(403).json({ error: 'Bạn không có quyền xử lý đề nghị này ở bước hiện tại' });
  if (L.isPayrollLocked(request.date.slice(0, 7))) return res.status(409).json({ error: 'Kỳ lương tháng này đã chốt, không thể duyệt hoặc từ chối đề nghị' });
  const action = req.body && req.body.action;
  if (action !== 'approve' && action !== 'reject') return res.status(400).json({ error: 'Hành động không hợp lệ' });
  const status = action === 'reject' ? 'Từ chối'
    : request.status === 'Chờ quản lý' ? 'Chờ HR' : 'Đã duyệt';
  const note = String((req.body && req.body.note) || '').trim().slice(0, 300);
  db.prepare('UPDATE overtime_requests SET status = ?, manager_note = ?, decided_by = ? WHERE id = ?')
    .run(status, note, req.user.email, request.id);
  audit(req.user, `Đề nghị tăng ca #${request.id} của ${request.code}: ${request.status} → ${status}`);

  if (status === 'Chờ HR') {
    notifyRole('hr', 'Đề nghị tăng ca cần xác nhận', `${request.name}: ${request.date}, ${request.hours} giờ đã được quản lý duyệt.`);
    const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(request.email);
    if (owner) notifyUser(owner.id, 'Đề nghị tăng ca đã qua bước quản lý', `Đề nghị ngày ${request.date} đang chờ HR xác nhận.`, '/overtime');
  } else {
    const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(request.email);
    const message = `${request.date}, ${request.hours} giờ${note ? ` · ${note}` : ''}`;
    if (owner) notifyUser(owner.id, `Đề nghị tăng ca ${status.toLowerCase()}`, message, '/overtime');
    notifyWorkflowEmail([request.email], `Đề nghị tăng ca ${status.toLowerCase()}`, `${message}\nĐăng nhập hệ thống để xem kết quả.`);
  }
  res.json({ ok: true, status });
});

router.put('/:id/cancel', (req, res) => {
  const request = getRequest(req.params.id);
  if (!request) return res.status(404).json({ error: 'Không tìm thấy đề nghị tăng ca' });
  const allowed = PENDING.includes(request.status)
    && (L.isHr(req.user) || request.email === req.user.email);
  if (!allowed) return res.status(403).json({ error: 'Không thể hủy đề nghị này' });
  if (L.isPayrollLocked(request.date.slice(0, 7))) return res.status(409).json({ error: 'Kỳ lương tháng này đã chốt, không thể hủy đề nghị' });
  db.prepare("UPDATE overtime_requests SET status = 'Đã hủy', decided_by = ? WHERE id = ?")
    .run(req.user.email, request.id);
  audit(req.user, `Hủy đề nghị tăng ca #${request.id} của ${request.code}`);
  if (request.email !== req.user.email) {
    const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(request.email);
    if (owner) notifyUser(owner.id, 'Đề nghị tăng ca đã bị hủy', `Đề nghị ngày ${request.date} đã được HR hủy.`, '/overtime');
  }
  res.json({ ok: true });
});

module.exports = router;
