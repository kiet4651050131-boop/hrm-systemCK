// Kiem thu nhanh toan bo API (dung CSDL tam trong bo nho): npm test
process.env.DB_FILE = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'APP_URL']) {
  process.env[key] = '';
}
const assert = require('assert');
const net = require('node:net');
const { createApp } = require('./dist/app');
const L = require('./lib');

(async () => {
  const nestApp = await createApp();
  await nestApp.listen(0);
  const srv = nestApp.getHttpServer();
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const call = async (m, p, b, t) => {
    const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, d: await r.json().catch(() => ({})) };
  };
  let n = 0; const ok = (c, m) => { assert(c, m); n++; };
  const page = await fetch(`http://127.0.0.1:${srv.address().port}/`);
  ok(page.status === 200 && page.headers.get('content-type').includes('text/html'), 'NestJS host serves frontend');
  const invalidJson = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  ok(invalidJson.status === 400, 'invalid JSON stays a 400 response');
  const login = async (e) => {
    const result = await call('POST', '/auth/login', { email: e, password: 'secret1234' });
    if (result.d.user.must_change_password) {
      await call('POST', '/auth/change-password', { current: 'secret1234', next: 'secret1234' }, result.d.token);
    }
    return result.d.token;
  };
  ok(L.csvCell('=1+1') === "'=1+1", 'CSV escape cong thuc spreadsheet');

  // Dang ky tu do chi mo cho tai khoan Admin dau tien; sau do Admin/HR tao tai khoan
  ok((await call('GET', '/auth/status')).d.registrationOpen === true, 'chua co tai khoan: cho phep tao Admin dau tien');
  ok((await call('POST', '/auth/register', { name: 'X', email: 'bad', password: '123456' })).s === 400, 'email sai');
  ok((await call('POST', '/auth/register', { name: 'Admin', email: 'admin@cty.vn', password: 'secret1' })).s === 400, 'tu choi mat khau duoi 8 ky tu');
  const first = await call('POST', '/auth/register', { name: 'Admin', email: 'admin@cty.vn', password: 'secret1234' });
  ok(first.s === 201 && first.d.role === 'admin', 'user dau tien la admin');
  ok((await call('GET', '/auth/status')).d.registrationOpen === false, 'da co tai khoan: dong dang ky');
  ok((await call('POST', '/auth/register', { name: 'An', email: 'an@cty.vn', password: 'secret1234' })).s === 403, 'dang ky tu do da dong');
  const A = await login('admin@cty.vn');
  ok((await call('GET', '/missing', null, A)).s === 404, 'unknown API stays a JSON 404');

  // Admin / HR tao tai khoan
  const mk = (b, t = A) => call('POST', '/users', { password: 'secret1234', ...b }, t);
  ok((await mk({ name: 'An', email: 'an@cty.vn' })).s === 201, 'admin tao tai khoan nhan vien');
  ok((await mk({ name: 'Binh', email: 'binh@cty.vn' })).s === 201, 'admin tao tai khoan thu hai');
  ok((await mk({ name: 'Trung', email: 'an@cty.vn' })).s === 409, 'trung email');
  ok((await mk({ name: 'X', email: 'bad' })).s === 400, 'email tao tai khoan sai');
  ok((await mk({ name: 'X', email: 'x@cty.vn', role: 'boss' })).s === 400, 'vai tro sai');
  ok((await mk({ name: 'X', email: 'x@cty.vn', password: '1234567' })).s === 400, 'mat khau ngan');
  const gen = (await call('POST', '/users', { name: 'Gen', email: 'gen@cty.vn' }, A)).d;
  ok(gen.temporaryPassword && gen.temporaryPassword.length >= 8, 'khong gui mat khau thi sinh mat khau tam');
  const genLogin = await call('POST', '/auth/login', { email: 'gen@cty.vn', password: gen.temporaryPassword });
  ok(genLogin.s === 200 && genLogin.d.user.must_change_password === 1, 'dang nhap bang mat khau tam bat buoc doi');
  ok((await call('GET', '/employees', null, genLogin.d.token)).s === 403, 'bat buoc doi mat khau truoc khi dung API');
  ok((await call('POST', '/auth/change-password', { current: gen.temporaryPassword, next: 'short7' }, genLogin.d.token)).s === 400, 'khong cho doi mat khau ngan');
  ok((await call('POST', '/auth/change-password', { current: gen.temporaryPassword, next: 'private123' }, genLogin.d.token)).s === 200, 'doi duoc mat khau tam');
  ok((await call('GET', '/employees', null, genLogin.d.token)).s === 200, 'mo khoa API sau khi doi mat khau');
  await call('DELETE', '/users/' + gen.id, null, A);
  const hrAcc = (await mk({ name: 'Hoa', email: 'hoa@cty.vn', role: 'hr' })).d;
  ok(hrAcc.id, 'admin tao duoc tai khoan HR');
  const H = await login('hoa@cty.vn');
  ok((await mk({ name: 'Nhan vien moi', email: 'moi@cty.vn' }, H)).s === 201, 'HR tao tai khoan nhan vien');
  ok((await mk({ name: 'Admin 2', email: 'a2@cty.vn', role: 'admin' }, H)).s === 403, 'HR khong tao admin');
  ok((await mk({ name: 'Y', email: 'y@cty.vn' }, await login('an@cty.vn'))).s === 403, 'nhan vien khong tao tai khoan');
  // don dep de cac kiem tra phia duoi giu nguyen so luong: xoa tai khoan va ho so phat sinh them
  for (const em of ['hoa@cty.vn', 'moi@cty.vn']) {
    const u = (await call('GET', '/users', null, A)).d.find((x) => x.email === em);
    await call('DELETE', '/users/' + u.id, null, A);
    const emp = (await call('GET', '/employees?q=' + em, null, A)).d[0];
    await call('DELETE', '/employees/' + emp.id, null, A);
  }
  {
    const emp = (await call('GET', '/employees?q=gen@cty.vn', null, A)).d[0];
    if (emp) await call('DELETE', '/employees/' + emp.id, null, A);
  }
  ok((await call('POST', '/auth/login', { email: 'an@cty.vn', password: 'sai' })).s === 401, 'sai mat khau');
  ok((await call('GET', '/employees')).s === 401, 'khong token');
  const U1 = await login('an@cty.vn'), U2 = await login('binh@cty.vn');

  // Phan quyen xem ho so
  ok((await call('GET', '/employees', null, A)).d.length === 3, 'admin thay tat ca');
  const mine = (await call('GET', '/employees', null, U1)).d;
  ok(mine.length === 1 && mine[0].email === 'an@cty.vn', 'nhan vien chi thay minh');
  ok((await call('GET', '/users', null, U1)).s === 403, 'employee khong xem tai khoan');
  ok((await call('GET', '/logs', null, U1)).s === 403, 'employee khong xem nhat ky');
  ok((await call('POST', '/employees', { code: 'X', name: 'X', email: 'x@x.vn' }, U1)).s === 403, 'employee khong them');
  ok((await call('POST', '/employees', { code: 'BADPHONE', name: 'Test', email: 'badphone@cty.vn', phone: '123' }, A)).s === 400, 'tu choi SDT khong hop le');
  ok((await call('POST', '/employees', { code: 'BADDATE', name: 'Test', email: 'baddate@cty.vn', start_date: '2026-02-31' }, A)).s === 400, 'tu choi ngay vao lam khong hop le');

  // Co cau to chuc
  const dept = (await call('POST', '/departments', { name: 'Ke toan' }, A)).d;
  ok(dept.id, 'them phong ban');
  ok((await call('POST', '/departments', { name: 'ke toan' }, A)).s === 409, 'trung ten khong phan biet hoa thuong');
  ok((await call('POST', '/departments', { name: 'Y' }, U1)).s === 403, 'employee khong them phong ban');

  // CRUD nhan vien
  const add = await call('POST', '/employees', { code: 'NV100', name: 'Chau', email: 'chau@cty.vn', department_id: dept.id, status: 'Chính thức' }, A);
  ok(add.s === 201, 'them nhan vien');
  ok((await call('POST', '/employees', { code: 'NV100', name: 'D', email: 'd@cty.vn' }, A)).s === 400, 'trung ma');
  ok((await call('DELETE', '/departments/' + dept.id, null, A)).s === 409, 'khong xoa phong ban dang dung');
  ok((await call('PUT', '/employees/' + add.d.id, { name: 'Chau Nguyen' }, A)).s === 200, 'sua nhan vien');
  ok((await call('GET', '/employees?q=chau', null, A)).d[0].name === 'Chau Nguyen', 'tim kiem');
  ok((await call('GET', '/employees?department_id=' + dept.id, null, A)).d.length === 1, 'loc phong ban');

  // Nhan vien chi sua SDT cua minh
  ok((await call('PUT', '/employees/' + mine[0].id, { phone: '0901234567', name: 'Hack', status: 'Chính thức' }, U1)).s === 200);
  const after = (await call('GET', '/employees', null, U1)).d[0];
  ok(after.phone === '0901234567' && after.name === 'An' && after.status === 'Chờ cập nhật', 'chi doi duoc SDT');
  ok((await call('PUT', '/employees/' + mine[0].id, { phone: '123' }, U1)).s === 400, 'tu choi SDT khong hop le');
  ok((await call('PUT', '/employees/' + add.d.id, { phone: '1' }, U1)).s === 404, 'khong sua ho so nguoi khac');

  // Import CSV
  const imp = (await call('POST', '/employees/import', { csv: 'code,name,email,phong ban,chuc danh\nNV200,Dung,dung@cty.vn,Kỹ thuật,Nhân viên\nNV201,Em,sai-email,Kỹ thuật,\nNV200,Trung,t@cty.vn,,' }, A)).d;
  ok(imp.imported === 1 && imp.errors.length === 2, 'import co bao loi tung dong');

  // Quan ly
  const mgrId = (await call('GET', '/users', null, A)).d.find((u) => u.email === 'binh@cty.vn').id;
  ok((await call('PUT', `/users/${mgrId}/role`, { role: 'manager' }, A)).s === 200, 'doi vai tro');
  const me = (await call('GET', '/employees', null, U2)).d[0];
  await call('PUT', '/employees/' + me.id, { department_id: dept.id }, A);
  const seen = (await call('GET', '/employees', null, U2)).d.map((e) => e.email).sort();
  ok(seen.join() === 'binh@cty.vn,chau@cty.vn', 'quan ly thay cung phong ban');

  // ===== Cham cong =====
  await call('PUT', '/employees/' + mine[0].id, { department_id: dept.id }, A); // An cung phong ban voi quan ly Binh
  ok((await call('GET', '/attendance/today', null, U1)).d.check_in === null, 'chua check-in');
  ok((await call('POST', '/attendance/check-in', null, U1)).s === 200, 'check-in');
  ok((await call('POST', '/attendance/check-in', null, U1)).s === 400, 'khong check-in 2 lan');
  ok((await call('POST', '/attendance/check-out', null, U1)).s === 200, 'check-out');
  ok((await call('POST', '/attendance/check-out', null, U1)).s === 400, 'khong check-out 2 lan');
  ok((await call('PUT', '/attendance', { employee_id: mine[0].id, date: '2026-09-07', check_in: '08:00' }, U1)).s === 403, 'nhan vien khong sua cong');
  ok((await call('PUT', '/attendance', { employee_id: mine[0].id, date: '2026-09-07', check_in: '09:00', check_out: '08:00' }, A)).s === 400, 'gio ra truoc gio vao');
  ok((await call('GET', '/attendance/month/' + add.d.id + '?month=2026-09', null, U1)).s === 404, 'khong xem cong nguoi khac');
  ok((await call('GET', '/attendance/month?month=2026-13', null, A)).s === 400, 'thang sai');

  // ===== Ngay le & cau hinh =====
  ok((await call('POST', '/holidays', { date: '2026-09-02', name: 'Quoc khanh' }, U1)).s === 403, 'nhan vien khong them ngay le');
  ok((await call('POST', '/holidays', { date: '2026-09-02', name: 'Quoc khanh' }, A)).s === 201, 'them ngay le');
  ok((await call('POST', '/holidays', { date: '2026-09-02', name: 'Trung' }, A)).s === 409, 'trung ngay le');
  ok((await call('PUT', '/settings', { tax_brackets: '10:5;5:10;*:35' }, A)).s === 400, 'bieu thue sai thu tu');
  ok((await call('PUT', '/settings', { bhxh_rate: '150' }, A)).s === 400, 'ty le > 100');
  ok((await call('PUT', '/settings', { overtime_rate: '4' }, A)).s === 400, 'hệ số tăng ca ngoài phạm vi bị từ chối');
  ok((await call('GET', '/settings', null, U1)).s === 403, 'nhan vien khong xem cau hinh');

  // ===== Nghi phep =====
  const types = (await call('GET', '/leave/types', null, U1)).d;
  const annual = types.find((t) => t.name === 'Phép năm').id;
  const l1 = await call('POST', '/leave', { type_id: annual, from_date: '2027-03-01', to_date: '2027-03-02', reason: 'Viec rieng' }, U1);
  ok(l1.s === 201 && l1.d.status === 'Chờ quản lý' && l1.d.days === 2, 'don cua nhan vien vao buoc quan ly duyet');
  ok((await call('POST', '/leave', { type_id: annual, from_date: '2027-03-02', to_date: '2027-03-03' }, U1)).s === 400, 'trung thoi gian');
  ok((await call('POST', '/leave', { type_id: annual, from_date: '2027-03-06', to_date: '2027-03-07' }, U1)).s === 400, 'chi gom cuoi tuan');
  ok((await call('POST', '/leave', { type_id: annual, from_date: '2027-05-03', to_date: '2027-05-28' }, U1)).s === 400, 'vuot so ngay phep');
  ok((await call('POST', '/leave', { type_id: annual, from_date: '2027-12-30', to_date: '2028-01-04' }, U1)).s === 400, 'khong vat qua nam');
  ok((await call('PUT', `/leave/${l1.d.id}/decide`, { action: 'approve' }, U1)).s === 403, 'khong tu duyet don cua minh');
  ok((await call('GET', '/leave', null, U1)).d.length === 1, 'nhan vien chi thay don cua minh');
  const step1 = await call('PUT', `/leave/${l1.d.id}/decide`, { action: 'approve' }, U2);
  ok(step1.s === 200 && step1.d.status === 'Chờ HR', 'quan ly duyet -> cho HR');
  ok((await call('PUT', `/leave/${l1.d.id}/decide`, { action: 'approve' }, U2)).s === 403, 'quan ly khong duyet buoc HR');
  ok((await call('PUT', `/leave/${l1.d.id}/decide`, { action: 'approve' }, A)).d.status === 'Đã duyệt', 'HR duyet cuoi');
  const bal = (await call('GET', '/leave/balance?year=2027', null, U1)).d;
  ok(bal.quota === 12 && bal.used === 2 && bal.remaining === 10, 'so du phep');
  const l2 = await call('POST', '/leave', { type_id: annual, from_date: '2027-04-05', to_date: '2027-04-05', half: true }, U1);
  ok(l2.d.days === 0.5, 'nghi nua ngay');
  ok((await call('PUT', `/leave/${l2.d.id}/cancel`, null, U1)).s === 200, 'huy don cho duyet');
  ok((await call('PUT', `/leave/${l2.d.id}/decide`, { action: 'approve' }, A)).s === 403, 'khong duyet don da huy');
  const l3 = await call('POST', '/leave', { type_id: annual, from_date: '2027-06-01', to_date: '2027-06-01' }, U1);
  ok((await call('PUT', `/leave/${l3.d.id}/decide`, { action: 'reject', note: 'Ban viec' }, U2)).d.status === 'Từ chối', 'tu choi don');
  ok((await call('GET', '/leave/balance?year=2027', null, U1)).d.remaining === 10, 'don tu choi khong tru phep');

  // ===== Luong: du lieu thang 9/2026 (21 cong chuan sau khi tru le 2/9) =====
  const days = []; // cac ngay lam viec thang 9/2026
  for (let d = 1; d <= 30; d++) { const dt = new Date(2026, 8, d); if (dt.getDay() % 6 && d !== 2) days.push(`2026-09-${String(d).padStart(2, '0')}`); }
  ok(days.length === 21, 'thang 9/2026 co 21 ngay cong');
  const anCode = mine[0].code;
  // An: nghi phep co luong ngay thu 3, vang ngay thu 4, di lam 19 ngay con lai
  const lp = await call('POST', '/leave', { type_id: annual, from_date: days[2], to_date: days[2] }, U1);
  await call('PUT', `/leave/${lp.d.id}/decide`, { action: 'approve' }, U2);
  await call('PUT', `/leave/${lp.d.id}/decide`, { action: 'approve' }, A);
  const rows = days.filter((_, i) => i !== 2 && i !== 3).map((d) => `${anCode},${d},08:00,17:00`);
  days.forEach((d) => rows.push(`NV200,${d.split('-').reverse().join('/')},08:10:00,17:30:00`)); // Dung: du 21 ngay, dinh dang DD/MM/YYYY
  rows.push('NV999,2026-09-01,08:00,17:00', 'NV200,2026-09-01,xx,17:00');
  const impAtt = (await call('POST', '/attendance/import', { csv: 'ma,ngay,vao,ra\n' + rows.join('\n') }, A)).d;
  ok(impAtt.imported === 19 + 21 && impAtt.errors.length === 2, 'import cham cong bao loi tung dong');
  const empCsvResponse = await fetch(`${base}/employees/export`, { headers: { Authorization: 'Bearer ' + A } });
  const empCsv = await empCsvResponse.text();
  ok(empCsvResponse.status === 200 && empCsv.includes('NV200') && empCsv.includes('Mã nhân viên'), 'xuất CSV danh sách nhân viên');
  ok((await fetch(`${base}/employees/export`, { headers: { Authorization: 'Bearer ' + U1 } })).status === 403, 'nhân viên không xuất danh sách người khác');
  const managerCsv = await (await fetch(`${base}/employees/export`, { headers: { Authorization: 'Bearer ' + U2 } })).text();
  ok(managerCsv.includes(mine[0].code) && !managerCsv.includes('NV200'), 'CSV quản lý chỉ gồm nhân viên trong phạm vi phòng ban');
  const attCsvResponse = await fetch(`${base}/attendance/export?month=2026-09`, { headers: { Authorization: 'Bearer ' + A } });
  const attCsv = await attCsvResponse.text();
  ok(attCsvResponse.status === 200 && attCsv.includes('2026-09-01') && attCsv.includes('NV200'), 'xuất CSV chấm công theo tháng');
  const sum = (await call('GET', `/attendance/month/${mine[0].id}?month=2026-09`, null, A)).d.summary;
  ok(sum.std_days === 21 && sum.present === 19 && sum.paid_leave === 1 && sum.absent === 1 && sum.late === 0, 'tong hop bang cong cua An');
  const departmentAttendance = await call('GET', `/attendance/month?month=2026-09&department_id=${dept.id}`, null, U2);
  ok(departmentAttendance.s === 200 && departmentAttendance.d.length > 0 && departmentAttendance.d.every((row) => row.department === 'Ke toan'), 'lọc bảng công theo phòng ban mà vẫn giữ phạm vi quản lý');
  ok((await call('GET', `/attendance/month?month=2026-09&department_id=99999`, null, A)).s === 400, 'phòng ban lọc bảng công không hợp lệ bị từ chối');
  const dungId = (await call('GET', '/employees?q=NV200', null, A)).d[0].id;
  ok((await call('GET', `/attendance/month/${dungId}?month=2026-09`, null, A)).d.summary.late === 0, 'Dung 08:10 khong tre');
  const lockedLeave = await call('POST', '/leave', { type_id: annual, from_date: '2026-09-10', to_date: '2026-09-10', reason: 'Chờ duyệt' }, U1);
  ok(lockedLeave.s === 201, 'tạo trước đơn nghỉ chờ duyệt');
  const lockedOvertime = await call('POST', '/overtime', { date: '2026-09-11', hours: 2, reason: 'Chờ duyệt' }, U1);
  ok(lockedOvertime.s === 201, 'tạo trước đề nghị tăng ca chờ duyệt');

  ok((await call('PUT', `/payroll/salary/${mine[0].id}`, { base_salary: 20000000 }, U1)).s === 403, 'nhan vien khong dat luong');
  ok((await call('PUT', `/payroll/salary/${mine[0].id}`, { base_salary: -5 }, A)).s === 400, 'luong am');
  await call('PUT', `/payroll/salary/${mine[0].id}`, { base_salary: 20000000, allowance: 2000000, dependents: 1 }, A);
  await call('PUT', `/payroll/salary/${dungId}`, { base_salary: 40000000 }, A);
  ok((await call('GET', '/payroll/salary', null, U2)).s === 403, 'quan ly khong xem luong');

  const per = await call('POST', '/payroll/periods', { month: '2026-09' }, A);
  ok(per.s === 201 && (await call('POST', '/payroll/periods', { month: '2026-09' }, A)).s === 409, 'tao ky luong, khong trung');
  ok((await call('POST', `/payroll/periods/${per.d.id}/lock`, null, A)).s === 400, 'chua tinh thi khong chot');
  const calc = (await call('POST', `/payroll/periods/${per.d.id}/calculate`, null, A)).d;
  ok(calc.count === 2 && calc.skipped.length > 0, 'tinh luong 2 nguoi, bo qua nguoi chua dat luong');
  ok((await call('GET', '/payroll/periods', null, U1)).d.length === 0, 'ky nhap thi nhan vien chua thay');
  const slips = (await call('GET', `/payroll/periods/${per.d.id}/payslips`, null, A)).d.payslips;
  const sAn = slips.find((x) => x.employee_code === anCode), sDung = slips.find((x) => x.employee_code === 'NV200');
  // An: 22tr x 20/21 = 20.952.381; BH 10,5% x 20tr = 2.100.000; thu nhap tinh thue am -> thue 0
  ok(sAn.gross === 20952381 && sAn.insurance === 2100000 && sAn.tax === 0 && sAn.net === 18852381, 'phieu luong An');
  // Dung: du cong, 40tr; BH 4.200.000; tinh thue 40-4,2-15,5 = 20,3tr -> 5% x 10tr + 10% x 10,3tr = 1.530.000
  ok(sDung.gross === 40000000 && sDung.taxable === 20300000 && sDung.tax === 1530000 && sDung.net === 34270000, 'phieu luong Dung (thue luy tien)');
  ok((await call('POST', `/payroll/periods/${per.d.id}/lock`, null, A)).s === 200, 'chot ky luong');
  ok((await call('PUT', '/attendance', { employee_id: mine[0].id, date: '2026-09-07', check_in: '09:00', check_out: '17:00' }, A)).s === 409, 'khóa sửa công thuộc kỳ đã chốt');
  ok((await call('POST', '/attendance/import', { csv: `ma,ngay,vao,ra\n${anCode},2026-09-07,09:00,17:00` }, A)).d.errors.length === 1, 'khóa import công thuộc kỳ đã chốt');
  ok((await call('POST', '/leave', { type_id: annual, from_date: '2026-09-14', to_date: '2026-09-14' }, U1)).s === 409, 'khóa tạo đơn nghỉ thuộc kỳ đã chốt');
  ok((await call('PUT', `/leave/${lockedLeave.d.id}/decide`, { action: 'approve' }, U2)).s === 409, 'khóa duyệt đơn nghỉ thuộc kỳ đã chốt');
  ok((await call('PUT', `/leave/${lockedLeave.d.id}/cancel`, null, U1)).s === 409, 'khóa hủy đơn nghỉ thuộc kỳ đã chốt');
  ok((await call('POST', '/overtime', { date: '2026-09-14', hours: 2, reason: 'Tháng đã chốt' }, U1)).s === 409, 'khóa tạo tăng ca thuộc kỳ đã chốt');
  ok((await call('PUT', `/overtime/${lockedOvertime.d.id}/decide`, { action: 'approve' }, U2)).s === 409, 'khóa duyệt tăng ca thuộc kỳ đã chốt');
  ok((await call('PUT', `/overtime/${lockedOvertime.d.id}/cancel`, null, U1)).s === 409, 'khóa hủy tăng ca thuộc kỳ đã chốt');
  ok((await call('POST', `/payroll/periods/${per.d.id}/calculate`, null, A)).s === 400, 'ky da chot khong tinh lai');
  ok((await call('DELETE', `/payroll/periods/${per.d.id}`, null, A)).s === 400, 'ky da chot khong xoa');
  ok((await call('POST', `/payroll/periods/${per.d.id}/unlock`, null, U2)).s === 403, 'chi admin mo khoa');
  const myP = (await call('GET', '/payroll/periods', null, U1)).d;
  ok(myP.length === 1 && myP[0].total_net === undefined, 'nhan vien thay ky da chot, khong thay tong quy luong');
  const mySlips = (await call('GET', `/payroll/periods/${per.d.id}/payslips`, null, U1)).d.payslips;
  ok(mySlips.length === 1 && mySlips[0].employee_code === anCode, 'nhan vien chi thay phieu cua minh');
  ok((await call('GET', `/payroll/periods/${per.d.id}/payslips`, null, U2)).d.payslips.length === 0, 'quan ly khong thay phieu nguoi khac');
  const csv = await fetch(`${base}/payroll/periods/${per.d.id}/export`, { headers: { Authorization: 'Bearer ' + A } });
  const csvBuf = Buffer.from(await csv.arrayBuffer());
  ok(csv.status === 200 && csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF && csvBuf.toString('utf8').includes('NV200'), 'xuat CSV co BOM');
  ok((await fetch(`${base}/payroll/periods/${per.d.id}/export`, { headers: { Authorization: 'Bearer ' + U1 } })).status === 403, 'nhan vien khong xuat luong');
  ok((await call('DELETE', '/employees/' + dungId, null, A)).s === 409, 'khong xoa nhan vien da co phieu luong');

  // ===== Thuong / phat / tam ung =====
  const pid = per.d.id;
  const adjAdd = (b, t = A) => call('POST', `/payroll/periods/${pid}/adjustments`, b, t);
  ok((await adjAdd({ employee_id: dungId, type: 'bonus', amount: 5000000, note: 'KPI' })).s === 400, 'ky da chot khong them khoan dieu chinh');
  ok((await call('POST', `/payroll/periods/${pid}/unlock`, null, A)).s === 200, 'admin mo khoa ky');
  ok((await adjAdd({ employee_id: dungId, type: 'bonus', amount: 5000000, note: 'KPI' }, U1)).s === 403, 'nhan vien khong nhap thuong');
  ok((await adjAdd({ employee_id: dungId, type: 'bonus', amount: 5000000, note: 'KPI' }, U2)).s === 403, 'quan ly khong nhap thuong');
  ok((await adjAdd({ employee_id: dungId, type: 'bonus', amount: -1, note: 'x' })).s === 400, 'so tien am');
  ok((await adjAdd({ employee_id: dungId, type: 'bonus', amount: 1.5, note: 'x' })).s === 400, 'so tien le');
  ok((await adjAdd({ employee_id: dungId, type: 'gift', amount: 1000, note: 'x' })).s === 400, 'loai khong hop le');
  ok((await adjAdd({ employee_id: dungId, type: 'penalty', amount: 1000 })).s === 400, 'phat phai co ly do');
  ok((await adjAdd({ employee_id: 99999, type: 'bonus', amount: 1000, note: 'x' })).s === 404, 'nhan vien khong ton tai');
  ok((await call('POST', '/payroll/periods/99999/adjustments', { employee_id: dungId, type: 'bonus', amount: 1000, note: 'x' }, A)).s === 404, 'ky luong khong ton tai');
  ok((await adjAdd({ employee_id: dungId, type: 'bonus', amount: 5000000, note: 'Thuong KPI' })).s === 201, 'them thuong');
  const pen = await adjAdd({ employee_id: dungId, type: 'penalty', amount: 300000, note: 'Di muon' });
  ok(pen.s === 201, 'them phat');
  ok((await adjAdd({ employee_id: dungId, type: 'advance', amount: 1000000 })).s === 201 && (await adjAdd({ employee_id: dungId, type: 'advance', amount: 1000000 })).s === 201, 'tam ung khong can ly do, cong don nhieu lan');
  ok((await call('GET', `/payroll/periods/${pid}/adjustments`, null, U1)).s === 403, 'nhan vien khong xem khoan dieu chinh');
  ok((await call('GET', `/payroll/periods/${pid}/adjustments`, null, A)).d.length === 4, 'liet ke 4 khoan');
  await call('POST', `/payroll/periods/${pid}/calculate`, null, A);
  let sl = (await call('GET', `/payroll/periods/${pid}/payslips`, null, A)).d.payslips;
  let sD = sl.find((x) => x.employee_code === 'NV200');
  // Dung: 40tr + thuong 5tr = 45tr; BH 4,2tr; tinh thue 45 - 4,2 - 15,5 = 25,3tr -> 500.000 + 1.530.000 = 2.030.000
  // Thuc nhan = 45.000.000 - 4.200.000 - 2.030.000 - phat 300.000 - tam ung 2.000.000 = 36.470.000
  ok(sD.bonus === 5000000 && sD.penalty === 300000 && sD.advance === 2000000 && sD.gross === 45000000, 'phieu luong ghi thuong/phat/tam ung');
  ok(sD.insurance === 4200000 && sD.taxable === 25300000 && sD.tax === 2030000 && sD.net === 36470000, 'thuong chiu thue, phat va tam ung tru sau thue');
  ok(sl.find((x) => x.employee_code === anCode).net === 18852381, 'nguoi khac khong bi anh huong');
  // Phat + tam ung vuot thu nhap -> canh bao thuc nhan am
  const big = await adjAdd({ employee_id: mine[0].id, type: 'advance', amount: 30000000 });
  const calcNeg = (await call('POST', `/payroll/periods/${pid}/calculate`, null, A)).d;
  ok(calcNeg.negative.length === 1 && calcNeg.negative[0].includes(anCode), 'canh bao thuc nhan am');
  ok((await call('DELETE', `/payroll/periods/${pid}/adjustments/${big.d.id}`, null, A)).s === 200, 'xoa khoan dieu chinh');
  ok((await call('DELETE', `/payroll/periods/${pid}/adjustments/${pen.d.id}`, null, U1)).s === 403, 'nhan vien khong xoa khoan dieu chinh');
  ok((await call('DELETE', `/payroll/periods/${pid}/adjustments/${pen.d.id}`, null, A)).s === 200, 'xoa phat');
  ok((await call('DELETE', `/payroll/periods/${pid}/adjustments/${pen.d.id}`, null, A)).s === 404, 'xoa lan hai bao khong tim thay');
  const calcOk = (await call('POST', `/payroll/periods/${pid}/calculate`, null, A)).d;
  ok(calcOk.negative.length === 0 && calcOk.unapplied_adjustments === 0, 'het canh bao');
  sl = (await call('GET', `/payroll/periods/${pid}/payslips`, null, A)).d.payslips;
  sD = sl.find((x) => x.employee_code === 'NV200');
  ok(sD.penalty === 0 && sD.net === 36770000, 'bo phat thi thuc nhan tang 300.000');
  ok((await call('POST', `/payroll/periods/${pid}/lock`, null, A)).s === 200, 'chot lai ky luong');
  ok((await call('DELETE', `/payroll/periods/${pid}/adjustments/${pen.d.id}`, null, A)).s === 400, 'ky da chot khong xoa khoan dieu chinh');
  const csv2 = await (await fetch(`${base}/payroll/periods/${pid}/export`, { headers: { Authorization: 'Bearer ' + A } })).text();
  ok(csv2.includes('Thưởng') && csv2.includes('Tạm ứng') && csv2.includes('Tiền tăng ca') && csv2.includes('36770000'), 'CSV co cot thuong, phat, tam ung, tang ca');

  // ===== Dashboard =====
  const dA = (await call('GET', '/dashboard', null, A)).d;
  ok(dA.headcount >= 4 && dA.by_department.length > 0 && dA.payroll_trend.length === 1 && Number.isInteger(dA.late_today), 'dashboard HR có số liệu biểu đồ');
  const dU = (await call('GET', '/dashboard', null, U1)).d;
  ok(dU.headcount === undefined && dU.payroll_trend === undefined && dU.my_today.check_in && dU.my_leave.quota === 12, 'dashboard nhan vien chi thay du lieu cua minh');
  ok((await call('GET', '/dashboard', null, U2)).d.pending_for_me === 1, 'dashboard quan ly dem don nghi cho duyet');

  // ===== Tăng ca, lịch sử, báo cáo, thông báo =====
  ok((await call('POST', '/overtime', { date: '2026-10-05', hours: 2, reason: 'Chốt tiến độ' }, U1)).s === 201, 'nhân viên gửi đề nghị tăng ca');
  const otList = (await call('GET', '/overtime', null, U1)).d;
  const ot = otList[0];
  ok(ot.status === 'Chờ quản lý' && ot.hours === 2, 'đề nghị tăng ca chờ quản lý');
  ok((await call('POST', '/overtime', { date: '2026-10-06', hours: 13, reason: 'Quá giờ' }, U1)).s === 400, 'giới hạn giờ tăng ca');
  ok((await call('PUT', `/overtime/${ot.id}/decide`, { action: 'approve' }, U1)).s === 403, 'không tự duyệt đề nghị tăng ca');
  ok((await call('PUT', `/overtime/${ot.id}/decide`, { action: 'approve' }, U2)).d.status === 'Chờ HR', 'quản lý chuyển tăng ca sang HR');
  ok((await call('PUT', `/overtime/${ot.id}/decide`, { action: 'approve' }, A)).d.status === 'Đã duyệt', 'HR xác nhận tăng ca');
  const otPeriod = (await call('POST', '/payroll/periods', { month: '2026-10' }, A)).d;
  await call('POST', `/payroll/periods/${otPeriod.id}/calculate`, null, A);
  const otSlips = (await call('GET', `/payroll/periods/${otPeriod.id}/payslips`, null, A)).d.payslips;
  const otSlip = otSlips.find((x) => x.employee_code === anCode);
  ok(otSlip.overtime_hours === 2 && otSlip.overtime_pay > 0 && otSlip.gross === otSlip.overtime_pay, 'giờ tăng ca được đưa vào phiếu lương');

  const historyAdmin = (await call('GET', `/history?employee_id=${mine[0].id}`, null, A)).d;
  ok(historyAdmin.some((x) => x.entity === 'salary' && x.changes['Lương cơ bản']), 'lưu lịch sử thay đổi lương');
  const historyEmployee = (await call('GET', `/history?employee_id=${mine[0].id}`, null, U1)).d;
  ok(historyEmployee.length > 0 && historyEmployee.every((x) => x.entity !== 'salary'), 'nhân viên chỉ xem lịch sử hồ sơ, không xem lịch sử lương');
  ok((await call('GET', `/history?employee_id=${dungId}`, null, U1)).s === 404, 'không xem lịch sử nhân viên khác');
  const report = (await call('GET', '/reports?month=2026-09', null, A)).d;
  ok(report.headcount >= 4 && report.attendance.present >= 19 && report.payroll.length >= 1, 'báo cáo HR tổng hợp nhân sự, công và lương');
  ok((await call('GET', '/reports', null, U1)).s === 403, 'nhân viên không xem báo cáo HR');
  const reportCsv = await (await fetch(`${base}/reports/export?month=2026-09`, { headers: { Authorization: 'Bearer ' + A } })).text();
  ok(reportCsv.includes('Báo cáo HR') && reportCsv.includes('Chấm công'), 'xuất CSV báo cáo');
  const userNotifications = (await call('GET', '/notifications', null, U1)).d;
  ok(userNotifications.unread > 0 && userNotifications.notifications.some((x) => x.title.includes('tăng ca')), 'nhận thông báo về đề nghị tăng ca');
  ok((await call('PUT', '/notifications/read-all', null, U1)).s === 200, 'đánh dấu thông báo đã đọc');
  ok((await call('GET', '/notifications', null, U1)).d.unread === 0, 'đếm đúng thông báo chưa đọc');

  // Admin: reset mat khau, tu bao ve
  const adminId = (await call('GET', '/users', null, A)).d[0].id;
  ok((await call('PUT', `/users/${adminId}/role`, { role: 'employee' }, A)).s === 400, 'khong tu ha quyen');
  ok((await call('DELETE', '/users/' + adminId, null, A)).s === 400, 'khong tu xoa');
  const anId = (await call('GET', '/users', null, A)).d.find((u) => u.email === 'an@cty.vn').id;
  const tmp = (await call('POST', `/users/${anId}/reset-password`, null, A)).d.temporaryPassword;
  ok(tmp && tmp.length >= 8, 'reset sinh mat khau tam');
  const resetLogin = await call('POST', '/auth/login', { email: 'an@cty.vn', password: tmp });
  ok(resetLogin.s === 200 && resetLogin.d.user.must_change_password === 1, 'reset mat khau yeu cau doi o lan dang nhap');
  ok((await call('GET', '/employees', null, resetLogin.d.token)).s === 403, 'token sau reset phai doi mat khau');
  ok((await call('POST', '/auth/change-password', { current: tmp, next: 'anprivate123' }, resetLogin.d.token)).s === 200, 'doi mat khau sau reset');
  ok((await call('POST', '/auth/change-password', { current: 'sai', next: 'newpass123' }, A)).s === 400, 'doi mat khau sai hien tai');
  ok((await call('POST', '/auth/change-password', { current: 'secret1234', next: 'newpass123' }, A)).s === 200, 'doi mat khau');

  // Khoi phuc mat khau qua SMTP: token mot lan va khong tiet lo email co tai khoan hay khong
  const messages = [];
  const smtp = net.createServer((socket) => {
    socket.write('220 localhost ESMTP\r\n');
    let input = '', dataMode = false, message = '';
    socket.on('data', (chunk) => {
      input += chunk.toString();
      let end;
      while ((end = input.indexOf('\r\n')) >= 0) {
        const line = input.slice(0, end);
        input = input.slice(end + 2);
        if (dataMode) {
          if (line === '.') {
            dataMode = false;
            messages.push(message);
            message = '';
            socket.write('250 queued\r\n');
          } else message += `${line}\r\n`;
          continue;
        }
        const command = line.split(' ')[0].toUpperCase();
        if (command === 'EHLO' || command === 'HELO') socket.write('250-localhost\r\n250 SIZE 10485760\r\n');
        else if (command === 'MAIL' || command === 'RCPT') socket.write('250 ok\r\n');
        else if (command === 'DATA') { dataMode = true; socket.write('354 end with dot\r\n'); }
        else if (command === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  const oldMailEnv = Object.fromEntries(['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'APP_URL'].map((key) => [key, process.env[key]]));
  try {
    for (const key of Object.keys(oldMailEnv)) delete process.env[key];
    ok((await call('POST', '/auth/forgot-password', { email: 'an@cty.vn' })).s === 503, 'bao loi khi chua cau hinh SMTP');
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.address().port);
    process.env.SMTP_SECURE = 'false';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.SMTP_FROM = 'hrm@example.test';
    process.env.APP_URL = 'https://hrm.example.test';
    const sent = await call('POST', '/auth/forgot-password', { email: 'an@cty.vn' });
    ok(sent.s === 200 && sent.d.message, 'gui email khoi phuc');
    const decodedMessage = messages[0] && messages[0].replace(/=\r?\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    let resetToken = decodedMessage && decodedMessage.match(/https:\/\/hrm\.example\.test\/\?reset=([a-f0-9]{64})/);
    if (!resetToken && messages[0]) {
      const encoded = messages[0].match(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/);
      if (encoded) resetToken = Buffer.from(encoded[1].replace(/\s/g, ''), 'base64').toString().match(/https:\/\/hrm\.example\.test\/\?reset=([a-f0-9]{64})/);
    }
    ok(!!resetToken, 'email chua lien ket reset token');
    const unknown = await call('POST', '/auth/forgot-password', { email: 'unknown@cty.vn' });
    ok(unknown.s === 200 && unknown.d.message === sent.d.message && messages.length === 1, 'khong tiet lo email tai khoan ton tai');
    ok((await call('POST', '/auth/reset-password', { token: resetToken[1], password: 'short7' })).s === 400, 'tu choi mat khau reset ngan');
    ok((await call('POST', '/auth/reset-password', { token: resetToken[1], password: 'emailreset123' })).s === 200, 'reset mat khau bang token email');
    ok((await call('POST', '/auth/reset-password', { token: resetToken[1], password: 'anotherpass123' })).s === 400, 'token reset chi dung mot lan');
    const resetWithNewPassword = await call('POST', '/auth/login', { email: 'an@cty.vn', password: 'emailreset123' });
    ok(resetWithNewPassword.s === 200 && resetWithNewPassword.d.user.must_change_password === 0, 'dang nhap duoc voi mat khau moi qua email');
    const waitForMessages = async (count) => {
      for (let attempt = 0; attempt < 100 && messages.length < count; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return messages.length >= count;
    };
    let expectedMessages = messages.length;
    const emailLeave = await call('POST', '/leave', { type_id: annual, from_date: '2027-07-12', to_date: '2027-07-12' }, U1);
    ok(emailLeave.s === 201 && await waitForMessages(++expectedMessages), 'email gui cho quan ly khi tao don nghi');
    ok((await call('PUT', `/leave/${emailLeave.d.id}/decide`, { action: 'approve' }, U2)).d.status === 'Chờ HR', 'quản lý chuyển đơn nghỉ tới HR');
    ok(await waitForMessages(++expectedMessages), 'email gui HR khi don nghi qua quan ly');
    ok((await call('PUT', `/leave/${emailLeave.d.id}/decide`, { action: 'approve' }, A)).d.status === 'Đã duyệt', 'HR duyet don nghi');
    ok(await waitForMessages(++expectedMessages), 'email ket qua don nghi gui cho nhan vien');
    const emailOvertime = await call('POST', '/overtime', { date: '2027-08-03', hours: 2, reason: 'Kiểm thử email' }, U1);
    ok(emailOvertime.s === 201 && await waitForMessages(++expectedMessages), 'email gui cho quan ly khi tao don tang ca');
    ok((await call('PUT', `/overtime/${emailOvertime.d.id}/decide`, { action: 'approve' }, U2)).d.status === 'Chờ HR', 'quản lý chuyển tăng ca tới HR');
    ok(await waitForMessages(++expectedMessages), 'email gui HR khi tang ca qua quan ly');
    ok((await call('PUT', `/overtime/${emailOvertime.d.id}/decide`, { action: 'approve' }, A)).d.status === 'Đã duyệt', 'HR duyet tang ca');
    ok(await waitForMessages(++expectedMessages), 'email ket qua tang ca gui cho nhan vien');
    const emailPeriod = (await call('POST', '/payroll/periods', { month: '2027-09' }, A)).d;
    await call('POST', `/payroll/periods/${emailPeriod.id}/calculate`, null, A);
    const emailSlips = (await call('GET', `/payroll/periods/${emailPeriod.id}/payslips`, null, A)).d.payslips;
    ok(emailSlips.length > 0 && (await call('POST', `/payroll/periods/${emailPeriod.id}/lock`, null, A)).s === 200, 'chot ky luong de gui email phieu luong');
    const employeeEmails = (await call('GET', '/employees', null, A)).d;
    const registeredEmails = (await call('GET', '/users', null, A)).d.map((user) => user.email);
    expectedMessages += emailSlips.filter((slip) => {
      const employee = employeeEmails.find((item) => item.code === slip.employee_code);
      return employee && registeredEmails.includes(employee.email);
    }).length;
    ok(await waitForMessages(expectedMessages), 'email thong bao phieu luong gui toi nhan vien co phieu');
  } finally {
    for (const [key, value] of Object.entries(oldMailEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => smtp.close(resolve));
  }

  // Xoa tai khoan co hieu luc ngay
  await call('DELETE', '/users/' + anId, null, A);
  ok((await call('GET', '/auth/me', null, U1)).s === 401, 'token cua tai khoan da xoa vo hieu');

  // Nhat ky
  ok((await call('GET', '/logs', null, A)).d.length > 10, 'co nhat ky');
  console.log(`OK: ${n} kiem tra dat`);
  await nestApp.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
