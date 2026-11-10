// Hàm dùng chung cho chấm công, nghỉ phép, lương
const { db } = require('./db');

/* ---------- Ngày giờ (theo múi giờ của server, mặc định Asia/Ho_Chi_Minh) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s) => new Date(`${s}T00:00:00`);
const today = () => fmtDate(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && fmtDate(parseD(s)) === s;
const validTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const validMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
const curMonth = () => today().slice(0, 7);
const isPayrollLocked = (month) => !!db.prepare("SELECT 1 FROM payroll_periods WHERE month = ? AND status = 'Đã chốt'").get(month);
const hasLockedPayrollInRange = (from, to) => !!db.prepare(`
  SELECT 1 FROM payroll_periods
  WHERE status = 'Đã chốt' AND month BETWEEN substr(?,1,7) AND substr(?,1,7)
  LIMIT 1
`).get(from, to);
const isOnApprovedFullDayLeave = (employeeId, date) => !!db.prepare(`
  SELECT 1 FROM leave_requests
  WHERE employee_id = ? AND status = 'Đã duyệt' AND half = 0 AND from_date <= ? AND to_date >= ?
`).get(employeeId, date, date);
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return { from: `${m}-01`, to: `${m}-${pad(new Date(y, mo, 0).getDate())}` };
};
function eachDay(from, to) {
  const out = [];
  for (let d = parseD(from); fmtDate(d) <= to; d.setDate(d.getDate() + 1)) out.push(fmtDate(d));
  return out;
}
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hoursBetween = (a, b) => (a && b ? (toMin(b) - toMin(a)) / 60 : null);
const round2 = (n) => Math.round(n * 100) / 100;
const csvCell = (value) => {
  let text = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/* ---------- Cấu hình, ngày lễ, ngày làm việc ---------- */
function getSettings() {
  const o = {};
  db.prepare('SELECT key, value FROM settings').all().forEach((r) => { o[r.key] = r.value; });
  return o;
}
const holidays = (from, to) =>
  new Set(db.prepare('SELECT date FROM holidays WHERE date BETWEEN ? AND ?').all(from, to).map((r) => r.date));
function isWorkday(s, st, hol) {
  const w = parseD(s).getDay();
  return !hol.has(s) && w !== 0 && (w !== 6 || st.work_saturday === '1');
}
const workdays = (from, to, st, hol) => eachDay(from, to).filter((d) => isWorkday(d, st, hol));

function nextEmployeeCode() {
  let n = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM employees').get().n;
  while (db.prepare('SELECT 1 FROM employees WHERE code = ?').get('NV' + String(n).padStart(3, '0'))) n++;
  return 'NV' + String(n).padStart(3, '0');
}

/* ---------- Phạm vi xem hồ sơ ---------- */
const isHr = (u) => u.role === 'admin' || u.role === 'hr';
const meEmp = (u) => db.prepare('SELECT * FROM employees WHERE email = ?').get(u.email);
// Nhân viên = chỉ mình; quản lý = cùng phòng ban + mình; HR/Admin = tất cả
function scopeSql(u, alias = 'e') {
  if (isHr(u)) return { sql: '', args: [] };
  const m = meEmp(u);
  if (!m) return { sql: ' AND 1=0', args: [] };
  if (u.role === 'manager' && m.department_id) {
    return { sql: ` AND (${alias}.department_id = ? OR ${alias}.id = ?)`, args: [m.department_id, m.id] };
  }
  return { sql: ` AND ${alias}.id = ?`, args: [m.id] };
}
function canSeeEmp(u, id) {
  const s = scopeSql(u);
  return db.prepare(`SELECT e.* FROM employees e WHERE e.id = ?${s.sql}`).get(id, ...s.args);
}

/* ---------- Bảng công tháng ---------- */
// Quy ước: đi làm đủ >= 4 giờ = 1 công, < 4 giờ = 0,5 công; có check-in mà thiếu check-out vẫn tính 1 công nhưng bị đánh dấu.
function summarize(emp, month, st) {
  const { from, to } = monthRange(month);
  const hol = holidays(from, to);
  const wdList = workdays(from, to, st, hol);
  const wd = new Set(wdList);
  const att = new Map(
    db.prepare('SELECT * FROM attendances WHERE employee_id = ? AND date BETWEEN ? AND ?').all(emp.id, from, to).map((a) => [a.date, a]),
  );
  const leave = new Map();
  db.prepare(`SELECT r.from_date, r.to_date, r.half, t.paid, t.name tname FROM leave_requests r JOIN leave_types t ON t.id = r.type_id
    WHERE r.employee_id = ? AND r.status = 'Đã duyệt' AND r.from_date <= ? AND r.to_date >= ?`).all(emp.id, to, from).forEach((r) => {
    workdays(r.from_date > from ? r.from_date : from, r.to_date < to ? r.to_date : to, st, hol).forEach((d) =>
      leave.set(d, { frac: r.half ? 0.5 : 1, paid: !!r.paid, type: r.tname }));
  });

  const t = today();
  const start = emp.start_date || '';
  const s = { std_days: wdList.length, present: 0, paid_leave: 0, unpaid_leave: 0, absent: 0, late: 0, missing_checkout: 0 };
  const days = eachDay(from, to).map((d) => {
    const a = att.get(d) || null;
    const l = leave.get(d) || null;
    const row = { date: d, dow: parseD(d).getDay(), workday: wd.has(d), holiday: hol.has(d), check_in: a ? a.check_in : null, check_out: a ? a.check_out : null, note: a ? a.note : '', leave: l, hours: null, status: '' };
    if (a) row.hours = hoursBetween(a.check_in, a.check_out);
    if (!row.workday) {
      row.status = row.holiday ? 'Ngày lễ' : (a && a.check_in ? 'Làm ngày nghỉ' : 'Nghỉ cuối tuần');
      return row;
    }
    if (start && d < start) { row.status = 'Chưa vào làm'; return row; }
    let credit = 0;
    if (a && a.check_in) {
      if (a.check_out) credit = row.hours >= 4 ? 1 : 0.5;
      else { credit = 1; s.missing_checkout++; row.missing = true; }
    }
    const lf = l ? l.frac : 0;
    const present = Math.min(credit, 1 - lf);
    s.present += present;
    if (l) { if (l.paid) s.paid_leave += lf; else s.unpaid_leave += lf; }
    if (a && a.check_in && present > 0 && a.check_in > st.work_start) { s.late++; row.late = true; }
    if (d < t) s.absent += Math.max(0, 1 - present - lf);
    if (d > t && !l && !a) row.status = '';
    else if (l && present === 0) row.status = l.paid ? `Nghỉ phép (${l.type})` : 'Nghỉ không lương';
    else if (present > 0) row.status = row.missing ? 'Thiếu check-out' : (row.late ? 'Đi muộn' : 'Đi làm');
    else if (d < t) row.status = 'Vắng';
    return row;
  });
  ['present', 'paid_leave', 'unpaid_leave', 'absent'].forEach((k) => { s[k] = round2(s[k]); });
  return { summary: s, days };
}

/* ---------- Lương ---------- */
function parseBrackets(str) {
  const parts = String(str || '').split(';').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Biểu thuế trống');
  let prev = 0;
  const out = parts.map((p, i) => {
    const [lim, rate] = p.split(':').map((x) => x.trim());
    const r = Number(rate);
    if (!(r >= 0 && r <= 100)) throw new Error(`Thuế suất không hợp lệ ở bậc ${i + 1}`);
    if (lim === '*') {
      if (i !== parts.length - 1) throw new Error('Dấu * (bậc cuối) phải nằm cuối cùng');
      return { upto: Infinity, rate: r };
    }
    const n = Number(lim);
    if (!(n > prev)) throw new Error(`Mức thu nhập ở bậc ${i + 1} phải lớn hơn bậc trước`);
    prev = n;
    return { upto: n, rate: r };
  });
  if (out[out.length - 1].upto !== Infinity) throw new Error('Bậc cuối phải có dạng *:thuế_suất (ví dụ *:35)');
  return out;
}
function calcTax(taxable, brackets) {
  let tax = 0, prev = 0;
  for (const b of brackets) {
    if (taxable <= prev) break;
    tax += ((Math.min(taxable, b.upto) - prev) * b.rate) / 100;
    prev = b.upto;
  }
  return Math.round(tax);
}
// Lương = (lương cơ bản + phụ cấp) x ngày công tính lương / ngày công chuẩn.
// Bảo hiểm tính theo mức lương đóng BHXH cố định hằng tháng (không theo ngày công).
// adj = { bonus, penalty, advance }:
//  - Thưởng: cộng vào thu nhập, chịu thuế TNCN (không tính bảo hiểm).
//  - Phạt, tạm ứng: trừ vào thực nhận sau thuế, không làm giảm thu nhập tính thuế.
function calcPayslip(sal, sm, st, adj = {}, overtime = {}) {
  const ratio = sm.std_days > 0 ? Math.min(1, (sm.present + sm.paid_leave) / sm.std_days) : 1;
  const baseEarned = Math.round(sal.base_salary * ratio);
  const allowEarned = Math.round(sal.allowance * ratio);
  const bonus = Math.round(adj.bonus || 0), penalty = Math.round(adj.penalty || 0), advance = Math.round(adj.advance || 0);
  const overtimeHours = round2(overtime.hours || 0), overtimePay = Math.round(overtime.pay || 0);
  const gross = baseEarned + allowEarned + bonus + overtimePay;
  let insurance = 0;
  if (sal.insured) {
    const b = sal.insured_salary || sal.base_salary;
    insurance = Math.round(
      (Math.min(b, Number(st.cap_bhxh)) * Number(st.bhxh_rate)) / 100 +
      (Math.min(b, Number(st.cap_bhxh)) * Number(st.bhyt_rate)) / 100 +
      (Math.min(b, Number(st.cap_bhtn)) * Number(st.bhtn_rate)) / 100,
    );
  }
  const exempt = Math.min(Math.round(sal.exempt_allowance * ratio), allowEarned);
  const taxable = Math.max(0, gross - exempt - insurance - Number(st.personal_deduction) - sal.dependents * Number(st.dependent_deduction));
  const tax = calcTax(taxable, parseBrackets(st.tax_brackets));
  return {
    base_salary: sal.base_salary, allowance: sal.allowance, gross, insurance, dependents: sal.dependents,
    taxable, tax, bonus, penalty, advance, overtime_hours: overtimeHours, overtime_pay: overtimePay,
    net: gross - insurance - tax - penalty - advance,
  };
}

module.exports = {
  today, nowHM, fmtDate, parseD, validDate, validTime, validMonth, curMonth, monthRange, eachDay, workdays, holidays, isWorkday,
  isPayrollLocked, hasLockedPayrollInRange, isOnApprovedFullDayLeave,
  csvCell,
  getSettings, nextEmployeeCode, isHr, meEmp, scopeSql, canSeeEmp, summarize, parseBrackets, calcTax, calcPayslip, hoursBetween, round2,
};
