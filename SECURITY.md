# Bảo mật và triển khai

## Đã bổ sung trong mã nguồn

- Helmet: CSP dành cho API JSON, chống nhúng iframe, `nosniff`, Referrer-Policy; HSTS trong production.
- CORS theo `CORS_ORIGINS`, không gửi cookie tự động. API tiếp tục xác thực bằng Bearer token.
- ValidationPipe kiểm tra DTO và từ chối trường lạ; DTO riêng cho chi nhánh/phòng ban; body tối đa 64 KiB.
- Giới hạn mỗi IP: 120 request/phút cho API, 10 request ghi/phút cho auth. Auth còn giới hạn 10 request/5 phút theo email chuẩn hóa, gộp cả các bước gửi và xác minh OTP.
- JWT ký HS256: access 15 phút, refresh 7 ngày; bắt buộc secret ít nhất 32 byte. Guard chỉ nhận access token có thời hạn và kiểm tra trạng thái/quyền hiện tại trong DB.
- `tokenVersion` vô hiệu hóa token cũ sau khi đổi mật khẩu. Chưa có endpoint refresh/logout; refresh token trả về chưa thể dùng để đổi access token. Hết hạn phải đăng nhập lại.
- OTP ngẫu nhiên bằng `crypto.randomInt`, HMAC-SHA256 có ràng buộc email/mục đích, hết hạn 5 phút; xóa có điều kiện trong DB để chỉ dùng một lần. Không ghi OTP ra log hoặc trả qua hàm test.
- Bắt buộc SMTP hoạt động để gửi OTP; STARTTLS cho cổng SMTP không dùng TLS trực tiếp. Luồng OTP email hiện có chưa thay thế MFA TOTP/WebAuthn cho admin.
- Lỗi đăng nhập chung; khôi phục mật khẩu trả thông điệp chung. Chưa bảo đảm thời gian phản hồi đồng đều giữa tài khoản tồn tại/không tồn tại.
- Không trả hash mật khẩu từ API tạo/cập nhật user. Giữ bcrypt cost 12.
- Chi nhánh yêu cầu đăng nhập, ghi chỉ admin; báo cáo và task log chỉ admin vì chưa có phân quyền theo phạm vi dữ liệu cho các API này.
- Tắt tự động đồng bộ schema mặc định và cấm bật trong production.

## Trước khi chạy phiên bản này

1. Sao lưu toàn DB và thử khôi phục trước một đợt triển khai. Ưu tiên npm run schema:check, rồi schema:apply trong cửa sổ bảo trì nếu còn thay đổi. Công cụ additive lưu bản sao schema (không thay thế backup toàn DB), từ chối OTP trùng nhóm và không xóa bản ghi. Không chạy lại deploy/security-migration.sql cũ có DELETE OTP trên DB đã nâng cấp.
2. Tạo secret ngẫu nhiên theo lệnh trong `.env.example`, khai báo SMTP và origin frontend chính xác. Không commit `.env`. Production cần `NODE_ENV=production`, HTTPS ở reverse proxy, SMTP hoạt động và `DB_SYNCHRONIZE=false`.
3. Token cũ thiếu loại/thời hạn/version sẽ bị từ chối; người dùng phải đăng nhập lại. Frontend cần xử lý 401, 429, các lỗi validation 400 và quyền admin mới của reports/task-logs.
4. DB mới cần schema qua quy trình migration của hệ thống; script trên chỉ dành cho schema cũ. Có thể dùng `DB_SYNCHRONIZE=true` với DB development dùng một lần.
5. `api.js` đọc `API_BASE_URL` trong môi trường Node; production bắt buộc URL HTTPS. Không lưu token trong log hay ví dụ localStorage. Nếu chuyển sang cookie, cần thiết kế thêm CSRF token, HttpOnly, Secure, SameSite và vòng đời session.

## Các lớp còn cần triển khai ở hạ tầng

- TLS 1.2+, gia hạn chứng chỉ, chuyển HTTP sang HTTPS tại proxy; Cloudflare/CDN/WAF và chặn truy cập trực tiếp origin.
- Firewall chỉ mở cổng cần thiết; DB trong mạng riêng; SSH key, giới hạn IP/VPN, tắt root/password login và cấu hình Fail2ban theo log thực tế.
- Chỉ khai báo IP/CIDR proxy thật ở `TRUSTED_PROXIES`. Không tin header IP do client tự gửi. Production bắt buộc RedisStore dùng chung giữa các worker/replica; MemoryStore chỉ là fallback development khi chưa cấu hình Redis.
- TOTP/WebAuthn cho admin, cơ chế logout/refresh rotation có thu hồi, giới hạn đăng nhập bền vững theo tài khoản; rà soát phạm vi quyền manager ở các API task còn lại.
- Log truy cập/xác thực được che thông tin nhạy cảm, tập trung và chống sửa; cảnh báo, giám sát toàn vẹn file, quy trình ứng phó sự cố và pentest.
- Mã hóa ổ đĩa/DB/backup, TLS tới DB khi đi qua mạng không tin cậy, quyền DB tối thiểu, backup tách biệt/immutable và lịch test restore.
- Hiện chưa có API upload hay tải URL tùy ý; khi bổ sung cần kiểm tra file, quét malware, kho lưu trữ không thực thi và chặn SSRF.
- Rà soát yêu cầu pháp lý bảo vệ dữ liệu cá nhân áp dụng tại thời điểm triển khai; tài liệu này không xác nhận tuân thủ pháp luật.

## Kiểm tra

`npm run build`, `npm test -- --runInBand`, `npm audit --omit=dev`.
Jest dùng `--experimental-vm-modules` để chạy dependency NestJS ESM; dùng Node >=24.9.
Test HTTP bảo mật dùng module cô lập không kết nối DB. Test e2e cũ trong `test/` cần DB riêng và đầy đủ cấu hình.
Multer được override sang nhánh 2.5 để vá DoS; kiểm tra lại và gỡ override khi Nest cập nhật dependency tương ứng.

Tham khảo: [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting), [OWASP reset password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Next BFF, IP đã xác minh và Redis

Production cần thêm BFF_PROXY_SECRET (ít nhất 32 byte, khác JWT_SECRET) và RATE_LIMIT_REDIS_URL. Backend kiểm tra chữ ký HMAC method/path/query/IP/timestamp từ Next, không lấy IP giới hạn từ X-Forwarded-For của trình duyệt. Khi đặt BFF_PROXY_SECRET, mọi request API phải có chữ ký hợp lệ, timestamp lệch tối đa 30 giây. Chỉ mở backend cho Next; đồng bộ đồng hồ các máy. Header X-CareOps-Backend: nest-v1 dùng để BFF phát hiện nhầm backend cũ, không phải thông tin xác thực.

API/IP, auth/IP và auth/email dùng RedisStore với prefix riêng, chia sẻ giữa các worker/replica. Production không khởi động nếu thiếu hoặc không kết nối Redis; lỗi store khi chạy không bỏ qua giới hạn. RATE_LIMIT_PREFIX phải giống giữa các replica cùng môi trường, khác giữa staging/production. Development chưa cấu hình Redis có thể dùng MemoryStore; nhận xét MemoryStore ở phần trước chỉ áp dụng chế độ này.

Gateway phải ghi đè IP từ socket tin cậy, thêm edge secret cho Next và xóa các header giả. Xem FRONTEND_SECURITY.md và deploy/nginx.conf.example trong frontend. Máy kiểm thử LAN đã có gateway HTTPS, Redis thật và đã bổ sung unique index OTP theo cách additive có bản sao schema; dữ liệu nghiệp vụ không bị xóa. Khi chuyển server nội bộ, tạo lại cấu hình/certificate và kiểm tra firewall/SMTP trên máy đích. Không bật credentials: true trên CORS cho luồng BFF.

Redis tự reconnect có backoff/jitter; initial connect tối đa 10 giây, command tối đa 3 giây, không queue offline. /health/ready trả 503 khi store không sẵn sàng. Backend mặc định nghe 127.0.0.1; chỉ đổi HOST khi có kiến trúc mạng/ACL phù hợp. Dùng npm run schema:check và schema:apply để nâng schema additive, có backup schema, không DELETE OTP. Xem deploy/INTERNAL_NETWORK.md bên frontend để chạy LAN và hướng dẫn chuyển server nội bộ.

## Thi?t b? c? nh?n ???c ghi nh? 30 ng?y

Ng??i d?ng ?? x?c nh?n th?i h?n 30 ng?y tr?n thi?t b? c? nh?n, m?c ??nh t?t. Ch? OTP ??ng m?i t?o cookie thi?t b?; Redis l?u hash v? h?n tuy?t ??i kh?ng gia h?n v? h?n. Logout t?t t? v?o l?i nh?ng gi? kh? n?ng b? OTP khi nh?p ??ng m?t kh?u/CAPTCHA. end-session do idle gi? ghi nh?, giao di?n kh?a kh?ng t? m? l?i. forget-device thu h?i c?c phi?n li?n k?t qua deviceId. ??i m?t kh?u ho?c v? hi?u h?a t?i kho?n t?ng tokenVersion ?? thu h?i m?i ghi nh? c?, k? c? khi t?i kho?n sau ?? ???c m? l?i. Kh?ng c?n migration DB.
