require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh'; // ngày giờ chấm công theo giờ Việt Nam
const path = require('path');
const express = require('express');
require('./db');
const org = require('./routes/org');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/departments', org.departments);
app.use('/api/positions', org.positions);
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/overtime', require('./routes/overtime'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/history', require('./routes/history'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', require('./routes/config'));
app.use('/api', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));

app.use(express.static(path.join(__dirname, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
});

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log(`HRM chạy tại http://localhost:${port}`));
module.exports = app;
