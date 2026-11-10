const router = require('express').Router();
const { db, audit, recordHistory, notifyUser } = require('../db');
const { auth, need } = require('../middleware');
const L = require('../lib');
const { notifyWorkflowEmail } = require('../mailer');

router.use(auth);

const HR = need('admin', 'hr');
const period = (id) => db.prepare('SELECT * FROM payroll_periods WHERE id = ?').get(id);

/* ----- Thiết lập lương từng nhân viên (chỉ Admin/HR) ----- */
router.get('/salary', HR, (req, res) => {
  res.json(db.prepare(`SELECT e.id AS employee_id, e.code, e.name, e.status, d.name AS department,
    COALESCE(s.base_salary,0) base_salary, COALESCE(s.allowance,0) allowance, COALESCE(s.exempt_allowance,0) exempt_allowance,
    COALESCE(s.dependents,0) dependents, COALESCE(s.insured,1) insured, COALESCE(s.insured_salary,0) insured_salary,
    CASE WHEN s.employee_id IS NULL THEN 0 ELSE 1 END configured
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN employee_salary s ON s.employee_id = e.id
    ORDER BY e.code`).all());
});

const money = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 10 ** 10 ? Number(v) : null);
router.put('/salary/:employeeId', HR, (req, res) => {
  const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.employeeId);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  const b = req.body || {};
  const base = money(b.base_salary), allow = money(b.allowance || 0), ex = money(b.exempt_allowance || 0), ins = money(b.insured_salary || 0);
  const dep = Number(b.dependents || 0);
  if (base === null || allow === null || ex === null || ins === null) return res.status(400).json({ error: 'Số tiền phải là số nguyên không âm' });
  if (!Number.isInteger(dep) || dep < 0 || dep > 20) return res.status(400).json({ error: 'Số người phụ thuộc không hợp lệ' });
  if (ex > allow) return res.status(400).json({ error: 'Phụ cấp miễn thuế không được lớn hơn tổng phụ cấp' });
  const previous = db.prepare('SELECT * FROM employee_salary WHERE employee_id = ?').get(e.id) || null;
  const next = {
    base_salary: base, allowance: allow, exempt_allowance: ex, dependents: dep,
    insured: b.insured === false || b.insured === 0 || b.insured === '0' ? 0 : 1,
    insured_salary: ins,
  };
  db.prepare(`INSERT INTO employee_salary(employee_id, base_salary, allowance, exempt_allowance, dependents, insured, insured_salary) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(employee_id) DO UPDATE SET base_salary=excluded.base_salary, allowance=excluded.allowance, exempt_allowance=excluded.exempt_allowance,
    dependents=excluded.dependents, insured=excluded.insured, insured_salary=excluded.insured_salary`)
    .run(e.id, next.base_salary, next.allowance, next.exempt_allowance, next.dependents, next.insured, next.insured_salary);
  const salaryFields = {
    base_salary: 'Lương cơ bản', allowance: 'Phụ cấp', exempt_allowance: 'Phụ cấp miễn thuế',
    dependents: 'Người phụ thuộc', insured: 'Tham gia bảo hiểm', insured_salary: 'Mức lương đóng bảo hiểm',
  };
  const changes = {};
  Object.keys(salaryFields).forEach((key) => {
    const oldValue = previous ? previous[key] : null;
    if (!previous || Number(oldValue) !== Number(next[key])) {
      changes[salaryFields[key]] = { old: oldValue, new: next[key] };
    }
  });
  recordHistory(e, req.user, 'salary', changes);
  audit(req.user, `Cập nhật thiết lập lương ${e.code}`);
  res.json({ ok: true });
});

/* ----- Kỳ lương ----- */
router.get('/periods', (req, res) => {
  if (L.isHr(req.user)) {
    return res.json(db.prepare(`SELECT p.*, COUNT(s.id) headcount, COALESCE(SUM(s.gross),0) total_gross, COALESCE(SUM(s.net),0) total_net
      FROM payroll_periods p LEFT JOIN payslips s ON s.period_id = p.id GROUP BY p.id ORDER BY p.month DESC`).all());
  }
  const me = L.meEmp(req.user);
  if (!me) return res.json([]);
  res.json(db.prepare(`SELECT p.id, p.month, p.status, p.locked_at FROM payroll_periods p JOIN payslips s ON s.period_id = p.id
    WHERE s.employee_id = ? AND p.status = 'Đã chốt' ORDER BY p.month DESC`).all(me.id));
});

router.post('/periods', HR, (req, res) => {
  const month = String((req.body || {}).month || '');
  if (!L.validMonth(month)) return res.status(400).json({ error: 'Tháng không hợp lệ (YYYY-MM)' });
  if (db.prepare('SELECT 1 FROM payroll_periods WHERE month = ?').get(month)) return res.status(409).json({ error: `Kỳ lương ${month} đã tồn tại` });
  const info = db.prepare('INSERT INTO payroll_periods(month, created_by) VALUES (?, ?)').run(month, req.user.email);
  audit(req.user, `Tạo kỳ lương ${month}`);
  res.status(201).json({ id: info.lastInsertRowid });
});

// Phiếu lương: HR/Admin xem tất cả; người khác chỉ xem phiếu của mình khi kỳ đã chốt
router.get('/periods/:id/payslips', (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  if (L.isHr(req.user)) return res.json({ period: p, payslips: db.prepare('SELECT * FROM payslips WHERE period_id = ? ORDER BY employee_code').all(p.id) });
  const me = L.meEmp(req.user);
  if (!me || p.status !== 'Đã chốt') return res.status(404).json({ error: 'Không tìm thấy phiếu lương' });
  res.json({ period: { id: p.id, month: p.month, status: p.status }, payslips: db.prepare('SELECT * FROM payslips WHERE period_id = ? AND employee_id = ?').all(p.id, me.id) });
});

/* ----- Thưởng / phạt / tạm ứng theo kỳ (chỉ sửa được khi kỳ còn Nháp; bấm Tính lương lại để áp dụng) ----- */
const ADJ_TYPES = { bonus: 'Thưởng', penalty: 'Phạt', advance: 'Tạm ứng' };

router.get('/periods/:id/adjustments', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  res.json(db.prepare(`SELECT a.id, a.employee_id, e.code, e.name, a.type, a.amount, a.note, a.created_by, a.created_at
    FROM payroll_adjustments a JOIN employees e ON e.id = a.employee_id WHERE a.period_id = ? ORDER BY e.code, a.id`).all(p.id));
});

router.post('/periods/:id/adjustments', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  if (p.status !== 'Nháp') return res.status(400).json({ error: 'Kỳ lương đã chốt, không thể thêm khoản điều chỉnh' });
  const b = req.body || {};
  const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(b.employee_id);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  if (!ADJ_TYPES[b.type]) return res.status(400).json({ error: 'Loại khoản không hợp lệ (thưởng, phạt hoặc tạm ứng)' });
  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10 ** 9) return res.status(400).json({ error: 'Số tiền phải là số nguyên dương' });
  const note = String(b.note || '').trim().slice(0, 200);
  if (b.type !== 'advance' && !note) return res.status(400).json({ error: 'Vui lòng ghi lý do thưởng/phạt' });
  const info = db.prepare('INSERT INTO payroll_adjustments(period_id, employee_id, type, amount, note, created_by) VALUES (?,?,?,?,?,?)')
    .run(p.id, e.id, b.type, amount, note, req.user.email);
  audit(req.user, `${ADJ_TYPES[b.type]} ${amount} cho ${e.code} kỳ ${p.month}`);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.delete('/periods/:id/adjustments/:adjId', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  if (p.status !== 'Nháp') return res.status(400).json({ error: 'Kỳ lương đã chốt, không thể xóa khoản điều chỉnh' });
  const a = db.prepare('SELECT a.*, e.code FROM payroll_adjustments a JOIN employees e ON e.id = a.employee_id WHERE a.id = ? AND a.period_id = ?').get(req.params.adjId, p.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy khoản điều chỉnh' });
  db.prepare('DELETE FROM payroll_adjustments WHERE id = ?').run(a.id);
  audit(req.user, `Xóa ${ADJ_TYPES[a.type]} ${a.amount} của ${a.code} kỳ ${p.month}`);
  res.json({ ok: true });
});

router.post('/periods/:id/calculate', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  if (p.status !== 'Nháp') return res.status(400).json({ error: 'Kỳ lương đã chốt, không thể tính lại' });
  const st = L.getSettings();
  const emps = db.prepare(`SELECT e.*, d.name AS dept_name FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.status != 'Nghỉ việc' ORDER BY e.code`).all();
  const skipped = [];
  let count = 0;
  const ins = db.prepare(`INSERT INTO payslips(period_id, employee_id, employee_code, employee_name, department, std_days, paid_days, present_days,
    paid_leave_days, unpaid_leave_days, absent_days, base_salary, allowance, gross, insurance, dependents, taxable, tax, net, bonus, penalty, advance,
    overtime_hours, overtime_pay)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const adjOf = {};
  db.prepare('SELECT employee_id, type, SUM(amount) s FROM payroll_adjustments WHERE period_id = ? GROUP BY employee_id, type').all(p.id)
    .forEach((r) => { (adjOf[r.employee_id] = adjOf[r.employee_id] || {})[r.type] = r.s; });
  const overtimeOf = {};
  db.prepare(`SELECT employee_id, SUM(hours) AS hours FROM overtime_requests
    WHERE status = 'Đã duyệt' AND substr(date,1,7) = ? GROUP BY employee_id`).all(p.month)
    .forEach((r) => { overtimeOf[r.employee_id] = r.hours; });
  const negative = [];
  db.transaction(() => {
    db.prepare('DELETE FROM payslips WHERE period_id = ?').run(p.id);
    emps.forEach((e) => {
      const sal = db.prepare('SELECT * FROM employee_salary WHERE employee_id = ?').get(e.id);
      if (!sal || sal.base_salary <= 0) return skipped.push(`${e.code} - ${e.name}`);
      const sm = L.summarize(e, p.month, st).summary;
      const overtimeHours = overtimeOf[e.id] || 0;
      const overtimePay = sm.std_days > 0
        ? Math.round((sal.base_salary / sm.std_days / 8) * overtimeHours * Number(st.overtime_rate || 1.5))
        : 0;
      const c = L.calcPayslip(sal, sm, st, adjOf[e.id] || {}, { hours: overtimeHours, pay: overtimePay });
      if (c.net < 0) negative.push(`${e.code} - ${e.name}`);
      ins.run(p.id, e.id, e.code, e.name, e.dept_name || '', sm.std_days, L.round2(sm.present + sm.paid_leave), sm.present, sm.paid_leave, sm.unpaid_leave, sm.absent,
        c.base_salary, c.allowance, c.gross, c.insurance, c.dependents, c.taxable, c.tax, c.net, c.bonus, c.penalty, c.advance,
        c.overtime_hours, c.overtime_pay);
      count++;
    });
  })();
  audit(req.user, `Tính lương kỳ ${p.month}: ${count} nhân viên, bỏ qua ${skipped.length}`);
  const { to } = L.monthRange(p.month);
  // Khoản điều chỉnh của người bị bỏ qua (chưa thiết lập lương / đã nghỉ việc) sẽ không vào phiếu nào
  const lost = Object.keys(adjOf).filter((id) => !db.prepare('SELECT 1 FROM payslips WHERE period_id = ? AND employee_id = ?').get(p.id, id)).length;
  res.json({ count, skipped, negative, unapplied_adjustments: lost, warning: to >= L.today() ? 'Tháng này chưa kết thúc nên ngày công chưa đầy đủ. Hãy tính lại sau khi hết tháng.' : '' });
});

router.post('/periods/:id/lock', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  if (p.status === 'Đã chốt') return res.status(400).json({ error: 'Kỳ lương đã được chốt' });
  if (!db.prepare('SELECT 1 FROM payslips WHERE period_id = ?').get(p.id)) return res.status(400).json({ error: 'Chưa có phiếu lương, hãy bấm Tính lương trước' });
  const locked = db.transaction(() => {
    const result = db.prepare("UPDATE payroll_periods SET status = 'Đã chốt', locked_at = datetime('now','localtime') WHERE id = ? AND status = 'Nháp'").run(p.id);
    return result.changes === 1 && L.isPayrollLocked(p.month);
  })();
  if (!locked) return res.status(409).json({ error: 'Kỳ lương đã được thay đổi, vui lòng tải lại và thử lại' });
  const employees = db.prepare(`SELECT DISTINCT u.id, u.email FROM payslips s
    JOIN employees e ON e.id = s.employee_id JOIN users u ON u.email = e.email WHERE s.period_id = ?`)
    .all(p.id);
  employees.forEach((employee) => {
    notifyUser(employee.id, 'Phiếu lương đã sẵn sàng', `Phiếu lương tháng ${p.month} đã được chốt.`, '/pay');
  });
  notifyWorkflowEmail(
    employees.map((employee) => employee.email),
    'Phiếu lương đã sẵn sàng',
    `Phiếu lương tháng ${p.month} đã được chốt. Đăng nhập hệ thống để xem phiếu lương.`,
  );
  audit(req.user, `Chốt kỳ lương ${p.month}`);
  res.json({ ok: true });
});

router.post('/periods/:id/unlock', need('admin'), (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  db.prepare("UPDATE payroll_periods SET status = 'Nháp', locked_at = NULL WHERE id = ?").run(p.id);
  audit(req.user, `Mở khóa kỳ lương ${p.month}`);
  res.json({ ok: true });
});

router.delete('/periods/:id', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  if (p.status !== 'Nháp') return res.status(400).json({ error: 'Chỉ xóa được kỳ lương ở trạng thái Nháp' });
  db.prepare('DELETE FROM payroll_periods WHERE id = ?').run(p.id);
  audit(req.user, `Xóa kỳ lương ${p.month}`);
  res.json({ ok: true });
});

// Xuất CSV (mở được bằng Excel, có BOM để không lỗi tiếng Việt)
const cell = L.csvCell;
router.get('/periods/:id/export', HR, (req, res) => {
  const p = period(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy kỳ lương' });
  const head = ['Mã NV', 'Họ tên', 'Phòng ban', 'Công chuẩn', 'Công tính lương', 'Nghỉ phép có lương', 'Nghỉ không lương', 'Vắng', 'Lương cơ bản', 'Phụ cấp', 'Tăng ca (giờ)', 'Tiền tăng ca', 'Thưởng', 'Tổng thu nhập', 'Bảo hiểm', 'Người phụ thuộc', 'Thu nhập tính thuế', 'Thuế TNCN', 'Phạt', 'Tạm ứng', 'Thực nhận'];
  const rows = db.prepare('SELECT * FROM payslips WHERE period_id = ? ORDER BY employee_code').all(p.id)
    .map((s) => [s.employee_code, s.employee_name, s.department, s.std_days, s.paid_days, s.paid_leave_days, s.unpaid_leave_days, s.absent_days, s.base_salary, s.allowance, s.overtime_hours, s.overtime_pay, s.bonus, s.gross, s.insurance, s.dependents, s.taxable, s.tax, s.penalty, s.advance, s.net]);
  audit(req.user, `Xuất bảng lương ${p.month}`);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bang-luong-${p.month}.csv"` });
  res.send('\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n'));
});

module.exports = router;
