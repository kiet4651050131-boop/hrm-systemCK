const router = require('express').Router();
const { db } = require('../db');
const { auth } = require('../middleware');
const L = require('../lib');

router.use(auth);

function getData(user, month, departmentId) {
  const { from, to } = L.monthRange(month);
  const scope = L.scopeSql(user);
  let filter = `1=1${scope.sql}`;
  const args = [...scope.args];
  if (departmentId) {
    filter += ' AND e.department_id = ?';
    args.push(departmentId);
  }
  const employees = db.prepare(`SELECT e.*, d.name AS department FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id WHERE ${filter} ORDER BY e.code`).all(...args);
  const active = employees.filter((employee) => employee.status !== 'Nghỉ việc');
  const byDepartment = {};
  const byStatus = {};
  active.forEach((employee) => {
    const department = employee.department || 'Chưa phân bổ';
    byDepartment[department] = (byDepartment[department] || 0) + 1;
  });
  employees.forEach((employee) => {
    byStatus[employee.status] = (byStatus[employee.status] || 0) + 1;
  });
  const attendance = { present: 0, paid_leave: 0, unpaid_leave: 0, absent: 0, late: 0, missing_checkout: 0 };
  active.forEach((employee) => {
    const summary = L.summarize(employee, month, L.getSettings()).summary;
    Object.keys(attendance).forEach((key) => { attendance[key] += summary[key] || 0; });
  });

  const leave = db.prepare(`SELECT r.status, COUNT(*) AS requests, COALESCE(SUM(r.days),0) AS days
    FROM leave_requests r JOIN employees e ON e.id = r.employee_id
    WHERE r.from_date <= ? AND r.to_date >= ? AND ${filter}
    GROUP BY r.status ORDER BY r.status`).all(to, from, ...args);
  const overtime = db.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(o.hours),0) AS hours
    FROM overtime_requests o JOIN employees e ON e.id = o.employee_id
    WHERE o.date BETWEEN ? AND ? AND o.status = 'Đã duyệt' AND ${filter}`)
    .get(from, to, ...args);
  let payroll = [];
  if (L.isHr(user)) {
    let payrollSql = `SELECT s.department, COUNT(*) AS headcount, SUM(s.gross) AS gross, SUM(s.net) AS net
      FROM payslips s JOIN payroll_periods p ON p.id = s.period_id
      WHERE p.month = ? AND p.status = 'Đã chốt'`;
    const payrollArgs = [month];
    if (departmentId) { payrollSql += ' AND s.department = (SELECT name FROM departments WHERE id = ?)'; payrollArgs.push(departmentId); }
    payroll = db.prepare(payrollSql + ' GROUP BY s.department ORDER BY s.department').all(...payrollArgs);
  }
  return {
    month,
    headcount: active.length,
    by_department: Object.entries(byDepartment).map(([name, count]) => ({ name, count })),
    by_status: Object.entries(byStatus).map(([name, count]) => ({ name, count })),
    attendance,
    overtime,
    leave,
    payroll,
  };
}

function params(req, res) {
  const month = String(req.query.month || L.curMonth());
  if (!L.validMonth(month)) {
    res.status(400).json({ error: 'Tháng không hợp lệ (YYYY-MM)' });
    return null;
  }
  let departmentId = null;
  if (req.query.department_id) {
    departmentId = Number(req.query.department_id);
    if (!Number.isInteger(departmentId) || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId)) {
      res.status(400).json({ error: 'Phòng ban không hợp lệ' });
      return null;
    }
  }
  return { month, departmentId };
}

router.get('/', (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'Bạn không đủ quyền xem báo cáo HR' });
  const query = params(req, res);
  if (!query) return;
  res.json(getData(req.user, query.month, query.departmentId));
});

const csvCell = (value) => {
  let text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

router.get('/export', (req, res) => {
  if (req.user.role === 'employee') return res.status(403).json({ error: 'Bạn không đủ quyền xuất báo cáo HR' });
  const query = params(req, res);
  if (!query) return;
  const report = getData(req.user, query.month, query.departmentId);
  const rows = [
    ['Báo cáo HR', query.month],
    [],
    ['Nhân sự', 'Số lượng'],
    ...report.by_department.map((row) => [row.name, row.count]),
    [],
    ['Trạng thái nhân sự', 'Số lượng'],
    ...report.by_status.map((row) => [row.name, row.count]),
    [],
    ['Chấm công', 'Số ngày'],
    ...Object.entries(report.attendance).map(([name, count]) => [name, count]),
    [],
    ['Tăng ca đã duyệt', 'Số đề nghị', 'Số giờ'],
    ['Tổng', report.overtime.requests, report.overtime.hours],
    [],
    ['Đơn nghỉ', 'Số đơn', 'Số ngày'],
    ...report.leave.map((row) => [row.status, row.requests, row.days]),
  ];
  if (L.isHr(req.user)) {
    rows.push([], ['Bảng lương đã chốt', 'Số phiếu', 'Tổng thu nhập', 'Thực nhận']);
    report.payroll.forEach((row) => rows.push([row.department || 'Chưa phân bổ', row.headcount, row.gross, row.net]));
  }
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="bao-cao-hr-${query.month}.csv"`,
  });
  res.send('\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
});

module.exports = router;
