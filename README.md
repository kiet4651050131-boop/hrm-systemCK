# HRM – Hệ thống quản lý nhân sự (Node.js)

Node.js + Express + SQLite (node:sqlite có sẵn, không cần biên dịch) + JWT + bcrypt. Giao diện web nằm trong `public/`.

## Chạy thử (5 phút)

```bash
npm install
cp .env.example .env        # rồi điền JWT_SECRET (xem hướng dẫn trong file)
npm start                   # http://localhost:3000
npm test                    # chạy bộ kiểm thử API 
```

Lần chạy đầu tiên, màn hình đăng nhập có nút tạo **tài khoản Admin đầu tiên**. Sau đó đăng ký tự do **đóng hẳn**: Admin tạo tài khoản ở tab "Tài khoản" (hệ thống sinh mật khẩu tạm, hiện một lần để chuyển cho nhân viên). HR tạo được tài khoản Nhân viên qua API `POST /api/users`; Admin tạo và đổi được mọi vai trò. Mật khẩu tối thiểu 8 ký tự. Tài khoản mới và tài khoản được Admin đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập tiếp theo; khi nâng cấp hệ thống, các tài khoản hiện có cũng cần đổi mật khẩu một lần.

Để bật **quên mật khẩu qua email**, điền `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` và `APP_URL` vào `.env`. Nhà cung cấp email cần cho phép gửi SMTP (Gmail yêu cầu App Password; không dùng mật khẩu đăng nhập Gmail). `APP_URL` phải là URL trang web mà người dùng truy cập; môi trường thật bắt buộc dùng HTTPS (HTTP chỉ được chấp nhận cho localhost). Liên kết đặt lại có hiệu lực 30 phút, chỉ dùng một lần; token chỉ lưu dạng băm trong CSDL. Nếu SMTP chưa cấu hình hoặc gửi email lỗi, màn hình sẽ báo lỗi; người dùng vẫn có thể liên hệ Admin để được cấp mật khẩu tạm.

## Chức năng
- Đăng ký, đăng nhập (giới hạn đăng nhập sai), đổi mật khẩu, khôi phục mật khẩu qua email, Admin cấp mật khẩu tạm ngẫu nhiên và bắt đổi ở lần đăng nhập tiếp theo
- Phân quyền Admin / HR / Quản lý / Nhân viên, kiểm tra ở phía server
- Phòng ban, chức danh
- Hồ sơ nhân viên: thêm, sửa, xóa, tìm kiếm, lọc, import CSV
- **Tổng quan**: số liệu theo vai trò, check-in/out nhanh, phép còn lại, quỹ lương
- **Chấm công**: check-in/out trên web, bảng công tháng, chi tiết từng ngày, HR sửa tay, import file máy chấm công
- **Nghỉ phép**: tạo đơn (cả ngày/nửa ngày), luồng duyệt Quản lý → HR, số dư phép năm, hủy đơn
- **Tăng ca**: đề nghị → Quản lý duyệt → HR xác nhận; chỉ giờ đã duyệt mới được đưa vào kỳ lương
- **Lương**: thiết lập lương từng người, kỳ lương, tính tự động từ bảng công và tăng ca đã duyệt, BHXH/BHYT/BHTN, thuế TNCN lũy tiến, **thưởng / phạt / tạm ứng theo kỳ**, chốt kỳ, phiếu lương, in/lưu PDF từ trình duyệt, xuất CSV
- **Báo cáo HR**: tổng hợp nhân sự, chấm công, nghỉ phép và chi phí lương theo tháng/phòng ban; xuất CSV
- **Lịch sử**: lưu các thay đổi hồ sơ và mức lương, ai thực hiện và thời điểm
- **Thông báo trong ứng dụng**: đơn nghỉ, tăng ca và phiếu lương được cập nhật theo luồng xử lý
- **Cấu hình**: giờ làm, ngày phép năm, hệ số tăng ca mẫu, tỷ lệ bảo hiểm, giảm trừ gia cảnh, biểu thuế, ngày lễ
- Nhật ký thao tác

## Quyền xem hồ sơ
| Vai trò | Xem | Sửa |
|---|---|---|
| Nhân viên | Hồ sơ của mình | Số điện thoại của mình |
| Quản lý | Phòng ban của mình | Số điện thoại của mình |
| HR | Tất cả | Tất cả |
| Admin | Tất cả + tài khoản | Tất cả |

## API chính
`POST /api/auth/login|change-password|forgot-password|reset-password`, `POST /api/auth/register` (chỉ tạo Admin đầu tiên), `GET /api/auth/status|me`,
`/api/departments`, `/api/positions`, `/api/employees` (+ `/import`),
`/api/users` (Admin xem/sửa/xóa; Admin và HR tạo mới), `/api/logs`, `/api/history`, `/api/notifications`,
`/api/attendance`, `/api/leave`, `/api/overtime`, `/api/payroll`, `/api/reports`, `/api/dashboard`, `/api/settings`, `/api/holidays`.

## Quy tắc tính toán (đọc kỹ trước khi dùng lương thật)
- **Công chuẩn**: các ngày thứ 2–6 trong tháng (thêm thứ 7 nếu bật ở Cấu hình), trừ ngày lễ. Phải nhập ngày lễ ở tab Cấu hình.
- **Công đi làm**: có check-in và check-out, làm từ 4 giờ = 1 công, dưới 4 giờ = 0,5 công. Thiếu check-out vẫn tính 1 công nhưng bị đánh dấu để HR sửa.
- **Vắng**: ngày làm việc đã qua, không đi làm, không có đơn nghỉ được duyệt.
- **Lương thực tế** = (lương cơ bản + phụ cấp) × (công đi làm + nghỉ phép có lương) ÷ công chuẩn.
- **Bảo hiểm** (mặc định NLĐ 10,5% = 8% + 1,5% + 1%): tính cố định hằng tháng trên mức lương đóng BH, có trần.
- **Thưởng** cộng vào tổng thu nhập và chịu thuế TNCN (không tính bảo hiểm, vì bảo hiểm tính theo mức lương đóng cố định). **Phạt** và **tạm ứng** trừ vào tiền thực nhận sau thuế, không làm giảm thu nhập tính thuế. Các khoản này nhập theo kỳ khi kỳ còn Nháp; thêm hoặc xóa xong phải bấm "Tính lương" lại. Hệ thống cảnh báo khi thực nhận bị âm. *Kế toán cần xác nhận cách xử lý thuế của thưởng và phạt này.*
- **Thực nhận** = thu nhập thực tế (gồm thưởng) − bảo hiểm − thuế TNCN − phạt − tạm ứng.
- **Tăng ca (mô hình đồ án)** = lương cơ bản ÷ công chuẩn trong tháng ÷ 8 giờ × số giờ đã được HR duyệt × hệ số cấu hình. Tiền tăng ca cộng vào thu nhập tính thuế; bảo hiểm vẫn tính theo mức lương đóng cố định. Hệ số mặc định 1,5 chỉ để minh họa, không khẳng định tuân thủ đầy đủ quy định theo ngày thường/ngày nghỉ/ngày lễ.
- **Thuế TNCN** = biểu lũy tiến 5 bậc trên (thu nhập − phụ cấp miễn thuế − bảo hiểm − giảm trừ bản thân − giảm trừ người phụ thuộc).
- Mặc định theo quy định hiệu lực từ 01/7/2026: giảm trừ 15,5 triệu / 6,2 triệu; biểu thuế 5/10/20/30/35%; trần BHXH-BHYT 50,6 triệu. **Kế toán cần kiểm tra lại các thông số này mỗi khi luật hoặc lương cơ sở thay đổi.**
- Phiếu lương lưu **bản chụp số liệu** lúc tính, nên đổi cấu hình sau này không làm thay đổi kỳ đã chốt. Chỉ Admin được mở khóa kỳ đã chốt.
- Nhân viên đã có phiếu lương thì không xóa được hồ sơ, hãy chuyển trạng thái "Nghỉ việc".

## Triển khai thật
1. Đặt `NODE_ENV=production` và `JWT_SECRET` dài ngẫu nhiên (server từ chối chạy nếu thiếu).
2. **Bắt buộc chạy sau HTTPS** (Nginx/Caddy làm reverse proxy). Nếu dùng proxy, thêm `app.set('trust proxy', 1)` trong `server.js` để giới hạn đăng nhập tính đúng IP.
3. Chạy bằng `pm2 start server.js` hoặc `docker build -t hrm . && docker run -d -p 3000:3000 -v hrm-data:/app/data --env-file .env hrm`.
4. **Sao lưu** thư mục `data/` hằng ngày (cron copy `data/hrm.db`), và thử khôi phục ít nhất một lần.

## Giới hạn hiện tại
- Upload và lưu file hợp đồng/giấy tờ, thông báo email (ngoại trừ email khôi phục mật khẩu)
- Ca làm việc linh hoạt, hệ số tăng ca riêng theo ngày thường/ngày nghỉ/ngày lễ, sơ đồ tổ chức dạng cây, lịch sử điều chuyển công tác
- Thuế: chưa xử lý trường hợp cá nhân không cư trú (20%) hoặc hợp đồng dưới 3 tháng (10%); chưa có quyết toán thuế cuối năm
- Phép năm chưa tính theo thâm niên và chưa cộng dồn sang năm sau; đơn nghỉ không được vắt qua năm
- Phiếu lương PDF hiện dùng chức năng in/lưu PDF của trình duyệt; chưa gửi phiếu lương qua email
