const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // SQLite có sẵn trong Node >= 22.13, không cần biên dịch

const file = process.env.DB_FILE || path.join(__dirname, 'data', 'hrm.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

const raw = new DatabaseSync(file);
raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Lớp bọc nhỏ để giữ cách dùng prepare / exec / transaction như cũ
const db = {
  prepare: (sql) => raw.prepare(sql),
  exec: (sql) => raw.exec(sql),
  transaction: (fn) => (...args) => {
    raw.exec('BEGIN');
    try { const r = fn(...args); raw.exec('COMMIT'); return r; }
    catch (e) { raw.exec('ROLLBACK'); throw e; }
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','hr','manager','employee')),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
  position_id INTEGER REFERENCES positions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'Thử việc',
  start_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  user_email TEXT NOT NULL,
  action TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employee_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  employee_code TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  entity TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  changes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_history_employee ON employee_history(employee_id, id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
`);

// Existing accounts must choose a new password once after upgrading.
{
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('must_change_password')) {
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1))');
  }
}

// ----- Chấm công, nghỉ phép, lương -----
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attendances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'web',
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendances(date);
CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  paid INTEGER NOT NULL DEFAULT 1,
  uses_quota INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type_id INTEGER NOT NULL REFERENCES leave_types(id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  half INTEGER NOT NULL DEFAULT 0,
  days REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Chờ HR' CHECK (status IN ('Chờ quản lý','Chờ HR','Đã duyệt','Từ chối','Đã hủy')),
  manager_note TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id, status);
CREATE TABLE IF NOT EXISTS employee_salary (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  base_salary INTEGER NOT NULL DEFAULT 0,
  allowance INTEGER NOT NULL DEFAULT 0,
  exempt_allowance INTEGER NOT NULL DEFAULT 0,
  dependents INTEGER NOT NULL DEFAULT 0,
  insured INTEGER NOT NULL DEFAULT 1,
  insured_salary INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payroll_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Nháp' CHECK (status IN ('Nháp','Đã chốt')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  locked_at TEXT
);
CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_code TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  std_days REAL NOT NULL,
  paid_days REAL NOT NULL,
  present_days REAL NOT NULL,
  paid_leave_days REAL NOT NULL,
  unpaid_leave_days REAL NOT NULL,
  absent_days REAL NOT NULL,
  base_salary INTEGER NOT NULL,
  allowance INTEGER NOT NULL,
  gross INTEGER NOT NULL,
  insurance INTEGER NOT NULL,
  dependents INTEGER NOT NULL,
  taxable INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  net INTEGER NOT NULL,
  bonus INTEGER NOT NULL DEFAULT 0,
  penalty INTEGER NOT NULL DEFAULT 0,
  advance INTEGER NOT NULL DEFAULT 0,
  overtime_hours REAL NOT NULL DEFAULT 0,
  overtime_pay INTEGER NOT NULL DEFAULT 0,
  UNIQUE (period_id, employee_id)
);
-- Thưởng / phạt / tạm ứng nhập theo từng kỳ lương, giữ nguyên khi tính lại
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bonus','penalty','advance')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_adj_period ON payroll_adjustments(period_id, employee_id);
CREATE TABLE IF NOT EXISTS overtime_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  hours REAL NOT NULL CHECK (hours > 0 AND hours <= 12),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Chờ HR' CHECK (status IN ('Chờ quản lý','Chờ HR','Đã duyệt','Từ chối','Đã hủy')),
  manager_note TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_overtime_date_status ON overtime_requests(date, status);
`);

// Nâng cấp CSDL cũ (tạo trước khi có thưởng/phạt/tạm ứng)
{
  const cols = db.prepare('PRAGMA table_info(payslips)').all().map((c) => c.name);
  ['bonus', 'penalty', 'advance', 'overtime_hours', 'overtime_pay'].forEach((c) => {
    if (!cols.includes(c)) db.exec(`ALTER TABLE payslips ADD COLUMN ${c} ${c === 'overtime_hours' ? 'REAL' : 'INTEGER'} NOT NULL DEFAULT 0`);
  });
}

// Giá trị mặc định (theo quy định từ 01/7/2026), Admin/HR chỉnh được ở tab Cấu hình
const DEFAULT_SETTINGS = {
  work_start: '08:30',          // giờ bắt đầu làm việc, check-in sau giờ này tính đi muộn
  work_saturday: '0',           // 1 = thứ Bảy là ngày làm việc
  annual_leave_days: '12',      // số ngày phép năm
  overtime_rate: '1.5',         // hệ số tăng ca mẫu; cần đối chiếu quy định/chính sách thực tế
  bhxh_rate: '8',               // % người lao động đóng
  bhyt_rate: '1.5',
  bhtn_rate: '1',
  cap_bhxh: '50600000',         // trần lương đóng BHXH, BHYT = 20 x lương cơ sở 2,53 triệu
  cap_bhtn: '106200000',        // trần đóng BHTN = 20 x lương tối thiểu vùng (đang để vùng I: 5,31 triệu)
  personal_deduction: '15500000',
  dependent_deduction: '6200000',
  tax_brackets: '10000000:5;30000000:10;60000000:20;100000000:30;*:35',
};
{
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => ins.run(k, v));
  const lt = db.prepare('INSERT OR IGNORE INTO leave_types(name, paid, uses_quota) VALUES (?, ?, ?)');
  lt.run('Phép năm', 1, 1); lt.run('Nghỉ ốm', 1, 0); lt.run('Nghỉ không lương', 0, 0);
}

if (db.prepare('SELECT COUNT(*) c FROM departments').get().c === 0) {
  const d = db.prepare('INSERT INTO departments(name) VALUES (?)');
  ['Kinh doanh', 'Kỹ thuật', 'Hành chính'].forEach((n) => d.run(n));
  const p = db.prepare('INSERT INTO positions(name) VALUES (?)');
  ['Nhân viên', 'Trưởng nhóm', 'Giám đốc'].forEach((n) => p.run(n));
}

function audit(user, action) {
  db.prepare('INSERT INTO audit_logs(user_email, action) VALUES (?, ?)').run(user ? user.email : '-', action);
}

function recordHistory(employee, actor, entity, changes) {
  if (!changes || !Object.keys(changes).length) return;
  db.prepare(`INSERT INTO employee_history(employee_id, employee_code, employee_name, entity, actor_email, changes)
    VALUES (?,?,?,?,?,?)`).run(
    employee.id || null,
    employee.code || '',
    employee.name || '',
    entity,
    actor ? actor.email : '-',
    JSON.stringify(changes),
  );
}

function notifyUser(userId, title, message, href) {
  db.prepare('INSERT INTO notifications(user_id, title, message, href) VALUES (?,?,?,?)')
    .run(userId, title, message || '', href || '');
}

module.exports = { db, audit, recordHistory, notifyUser };
