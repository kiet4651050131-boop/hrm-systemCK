const router = require('express').Router();
const { db, audit } = require('../db');
const { auth, need } = require('../middleware');
const L = require('../lib');

router.use(auth);

const getAtt = (empId, date) => db.prepare('SELECT * FROM attendances WHERE employee_id = ? AND date = ?').get(empId, date);

// Chấm công của chính mình hôm nay
router.get('/today', (req, res) => {
  const e = L.meEmp(req.user);
  if (!e) return res.json({ employee: false });
  const a = getAtt(e.id, L.today());
  res.json({ employee: true, date: L.today(), check_in: a ? a.check_in : null, check_out: a ? a.check_out : null });
});

router.get('/export', (req, res) => {
  const month = String(req.query.month || L.curMonth());
  if (!L.validMonth(month)) return res.status(400).json({ error: 'Tháng không hợp lệ (YYYY-MM)' });
  const scope = L.scopeSql(req.user);
  let sql = `SELECT e.*, d.name AS department FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id WHERE 1=1${scope.sql}`;
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
  const rows = [['Mã nhân viên', 'Họ tên', 'Phòng ban', 'Ngày', 'Giờ vào', 'Giờ ra', 'Số giờ', 'Trạng thái', 'Ghi chú']];
  const settings = L.getSettings();
  employees.forEach((employee) => {
    L.summarize(employee, month, settings).days.forEach((day) => {
      rows.push([
        employee.code, employee.name, employee.department, day.date, day.check_in, day.check_out,
        day.hours == null ? '' : day.hours.toFixed(2), day.status, day.note,
      ]);
    });
  });
  audit(req.user, `Xuất bảng chấm công ${month}: ${employees.length} nhân viên`);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="bang-cham-cong-${month}.csv"`,
  });
  res.send('\uFEFF' + rows.map((row) => row.map(L.csvCell).join(',')).join('\r\n'));
});

router.post('/check-in', (req, res) => {
  const e = L.meEmp(req.user);
  if (!e) return res.status(404).json({ error: 'Tài khoản chưa có hồ sơ nhân viên' });
  if (e.status === 'Nghỉ việc') return res.status(403).json({ error: 'Hồ sơ đã ở trạng thái nghỉ việc' });
  const d = L.today();
  if (L.isPayrollLocked(d.slice(0, 7))) return res.status(409).json({ error: 'Kỳ lương tháng này đã chốt, không thể chấm công bổ sung' });
  if (L.isOnApprovedFullDayLeave(e.id, d)) return res.status(400).json({ error: 'Bạn đã được duyệt nghỉ cả ngày hôm nay, không thể check-in' });
  const cur = getAtt(e.id, d);
  if (cur && cur.check_in) return res.status(400).json({ error: `Hôm nay bạn đã check-in lúc ${cur.check_in}` });
  if (cur) db.prepare('UPDATE attendances SET check_in = ? WHERE id = ?').run(L.nowHM(), cur.id);
  else db.prepare("INSERT INTO attendances(employee_id, date, check_in, source) VALUES (?,?,?, 'web')").run(e.id, d, L.nowHM());
  audit(req.user, `Check-in ${d}`);
  res.json({ ok: true, check_in: L.nowHM() });
});

router.post('/check-out', (req, res) => {
  const e = L.meEmp(req.user);
  if (!e) return res.status(404).json({ error: 'Tài khoản chưa có hồ sơ nhân viên' });
  const d = L.today();
  if (L.isPayrollLocked(d.slice(0, 7))) return res.status(409).json({ error: 'Kỳ lương tháng này đã chốt, không thể sửa chấm công' });
  const cur = getAtt(e.id, L.today());
  if (!cur || !cur.check_in) return res.status(400).json({ error: 'Bạn chưa check-in hôm nay' });
  if (cur.check_out) return res.status(400).json({ error: `Bạn đã check-out lúc ${cur.check_out}. Cần sửa hãy liên hệ HR` });
  db.prepare('UPDATE attendances SET check_out = ? WHERE id = ?').run(L.nowHM(), cur.id);
  audit(req.user, `Check-out ${L.today()}`);
  res.json({ ok: true, check_out: L.nowHM() });
});

// Bảng công tổng hợp của tất cả nhân viên trong phạm vi được xem
router.get('/month', (req, res) => {
  const month = req.query.month || L.curMonth();
  if (!L.validMonth(month)) return res.status(400).json({ error: 'Tháng không hợp lệ (định dạng YYYY-MM)' });
  const st = L.getSettings();
  const s = L.scopeSql(req.user);
  let sql = `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE 1=1${s.sql}`;
  const args = [...s.args];
  if (req.query.department_id) {
    const departmentId = Number(req.query.department_id);
    if (!Number.isInteger(departmentId) || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId)) {
      return res.status(400).json({ error: 'Phòng ban không hợp lệ' });
    }
    sql += ' AND e.department_id = ?';
    args.push(departmentId);
  }
  const emps = db.prepare(sql + ' ORDER BY e.code').all(...args);
  res.json(emps.map((e) => ({
    employee_id: e.id, code: e.code, name: e.name, department: e.department, status: e.status,
    ...L.summarize(e, month, st).summary,
  })));
});

// Chi tiết từng ngày của một nhân viên
router.get('/month/:employeeId', (req, res) => {
  const month = req.query.month || L.curMonth();
  if (!L.validMonth(month)) return res.status(400).json({ error: 'Tháng không hợp lệ (định dạng YYYY-MM)' });
  const e = L.canSeeEmp(req.user, req.params.employeeId);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  const r = L.summarize(e, month, L.getSettings());
  res.json({ employee: { id: e.id, code: e.code, name: e.name }, month, ...r });
});

// HR/Admin sửa tay một ngày công (để trống cả giờ vào và giờ ra = xóa)
router.put('/', need('admin', 'hr'), (req, res) => {
  const b = req.body || {};
  const e = db.prepare('SELECT * FROM employees WHERE id = ?').get(b.employee_id);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  if (!L.validDate(b.date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
  if (L.isPayrollLocked(b.date.slice(0, 7))) return res.status(409).json({ error: `Kỳ lương tháng ${b.date.slice(0, 7)} đã chốt, không thể sửa chấm công` });
  const ci = String(b.check_in || '').trim(), co = String(b.check_out || '').trim();
  if (ci && !L.validTime(ci)) return res.status(400).json({ error: 'Giờ vào không hợp lệ (HH:MM)' });
  if (co && !L.validTime(co)) return res.status(400).json({ error: 'Giờ ra không hợp lệ (HH:MM)' });
  if (co && !ci) return res.status(400).json({ error: 'Có giờ ra thì phải có giờ vào' });
  if (ci && co && co < ci) return res.status(400).json({ error: 'Giờ ra phải sau giờ vào' });
  if (!ci && !co) {
    db.prepare('DELETE FROM attendances WHERE employee_id = ? AND date = ?').run(e.id, b.date);
  } else {
    db.prepare(`INSERT INTO attendances(employee_id, date, check_in, check_out, note, source) VALUES (?,?,?,?,?, 'manual')
      ON CONFLICT(employee_id, date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out, note = excluded.note, source = 'manual'`)
      .run(e.id, b.date, ci || null, co || null, String(b.note || '').slice(0, 200));
  }
  audit(req.user, `Sửa công ${e.code} ngày ${b.date}`);
  res.json({ ok: true });
});

// Import file máy chấm công: mã NV, ngày, giờ vào, giờ ra (ngày dạng YYYY-MM-DD hoặc DD/MM/YYYY)
function normDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
}
function normTime(s) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(s || '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}
router.post('/import', need('admin', 'hr'), (req, res) => {
  const lines = String(req.body.csv || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: 'Chưa có dữ liệu' });
  if (lines.length > 5000) return res.status(400).json({ error: 'Tối đa 5000 dòng mỗi lần import' });
  const errors = [];
  let imported = 0;
  const up = db.prepare(`INSERT INTO attendances(employee_id, date, check_in, check_out, source) VALUES (?,?,?,?, 'import')
    ON CONFLICT(employee_id, date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out, source = 'import'`);
  db.transaction(() => {
    lines.forEach((ln, i) => {
      if (i === 0 && /m[ãa]|code|date|ng[àa]y/i.test(ln)) return;
      const [code, d0, ci0, co0] = ln.split(/[,;\t]/).map((x) => x.trim());
      const date = normDate(d0 || ''), ci = normTime(ci0), co = normTime(co0);
      const e = db.prepare('SELECT id FROM employees WHERE code = ?').get(code || '');
      if (!e) return errors.push(`Dòng ${i + 1}: không có mã nhân viên "${code}"`);
      if (!L.validDate(date)) return errors.push(`Dòng ${i + 1}: ngày không hợp lệ`);
      if (L.isPayrollLocked(date.slice(0, 7))) return errors.push(`Dòng ${i + 1}: kỳ lương tháng ${date.slice(0, 7)} đã chốt`);
      if (!ci) return errors.push(`Dòng ${i + 1}: thiếu hoặc sai giờ vào`);
      if (!L.validTime(ci) || (co && !L.validTime(co)) || (co0 && !co)) return errors.push(`Dòng ${i + 1}: giờ vào/ra không hợp lệ`);
      if (co && co < ci) return errors.push(`Dòng ${i + 1}: giờ ra trước giờ vào`);
      up.run(e.id, date, ci, co || null);
      imported++;
    });
  })();
  audit(req.user, `Import chấm công: ${imported} thành công, ${errors.length} lỗi`);
  res.json({ imported, errors });
});

module.exports = router;
