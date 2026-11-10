const router = require('express').Router();
const { db } = require('../db');
const { auth } = require('../middleware');
const L = require('../lib');

router.use(auth);

router.get('/', (req, res) => {
  const u = req.user;
  const t = L.today();
  const s = L.scopeSql(u);
  const me = L.meEmp(u);
  const active = `e.status != 'Nghỉ việc'${s.sql}`;
  const out = { role: u.role, today: t };

  // Quy mô nhân sự trong phạm vi được xem (nhân viên thường chỉ thấy mình nên bỏ qua)
  if (u.role !== 'employee') {
    out.headcount = db.prepare(`SELECT COUNT(*) c FROM employees e WHERE ${active}`).get(...s.args).c;
    out.by_department = db.prepare(`SELECT COALESCE(d.name,'Chưa phân bổ') name, COUNT(*) count FROM employees e LEFT JOIN departments d ON d.id = e.department_id
      WHERE ${active} GROUP BY d.id ORDER BY count DESC`).all(...s.args);
    out.by_status = db.prepare(`SELECT e.status name, COUNT(*) count FROM employees e WHERE 1=1${s.sql} GROUP BY e.status ORDER BY count DESC`).all(...s.args);
    out.present_today = db.prepare(`SELECT COUNT(*) c FROM attendances a JOIN employees e ON e.id = a.employee_id WHERE a.date = ? AND a.check_in IS NOT NULL AND ${active}`).get(t, ...s.args).c;
    out.on_leave_today = db.prepare(`SELECT COUNT(DISTINCT r.employee_id) c FROM leave_requests r JOIN employees e ON e.id = r.employee_id
      WHERE r.status = 'Đã duyệt' AND r.from_date <= ? AND r.to_date >= ? AND ${active}`).get(t, t, ...s.args).c;
    const d30 = L.fmtDate(new Date(Date.now() - 30 * 86400000));
    out.new_hires_30d = db.prepare(`SELECT COUNT(*) c FROM employees e WHERE e.start_date >= ? AND e.start_date != '' AND ${active}`).get(d30, ...s.args).c;
  }

  // Số đơn nghỉ đang chờ chính người dùng này xử lý (hoặc đơn đang chờ của mình)
  if (L.isHr(u)) out.pending_for_me = db.prepare("SELECT COUNT(*) c FROM leave_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'Chờ HR' AND e.email != ?").get(u.email).c;
  else if (u.role === 'manager' && me && me.department_id) out.pending_for_me = db.prepare("SELECT COUNT(*) c FROM leave_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'Chờ quản lý' AND e.department_id = ? AND e.id != ?").get(me.department_id, me.id).c;
  if (me) {
    out.my_pending = db.prepare("SELECT COUNT(*) c FROM leave_requests WHERE employee_id = ? AND status IN ('Chờ quản lý','Chờ HR')").get(me.id).c;
    const a = db.prepare('SELECT check_in, check_out FROM attendances WHERE employee_id = ? AND date = ?').get(me.id, t);
    out.my_today = { check_in: a ? a.check_in : null, check_out: a ? a.check_out : null };
    const st = L.getSettings();
    const q = (statuses) => db.prepare(`SELECT COALESCE(SUM(r.days),0) s FROM leave_requests r JOIN leave_types lt ON lt.id = r.type_id WHERE r.employee_id = ? AND lt.uses_quota = 1
      AND r.from_date LIKE ? AND r.status IN (${statuses.map(() => '?').join(',')})`).get(me.id, `${t.slice(0, 4)}-%`, ...statuses).s;
    out.my_leave = { quota: Number(st.annual_leave_days), used: q(['Đã duyệt']), pending: q(['Chờ quản lý', 'Chờ HR']) };
    out.my_leave.remaining = out.my_leave.quota - out.my_leave.used - out.my_leave.pending;
  }

  // Chi phí lương 6 kỳ đã chốt gần nhất (chỉ HR/Admin)
  if (L.isHr(u)) {
    out.payroll_trend = db.prepare(`SELECT p.month, COUNT(s.id) headcount, SUM(s.gross) gross, SUM(s.net) net FROM payroll_periods p JOIN payslips s ON s.period_id = p.id
      WHERE p.status = 'Đã chốt' GROUP BY p.id ORDER BY p.month DESC LIMIT 6`).all().reverse();
  }
  res.json(out);
});

module.exports = router;
