# Task KPI API

Sườn NestJS backend cho hệ thống quản lý task, KPI và báo cáo theo schema MySQL.

## Cấu trúc chính

- `src/auth` - xác thực và login
- `src/users` - quản lý người dùng
- `src/branches` - quản lý chi nhánh
- `src/departments` - quản lý phòng ban
- `src/tasks` - quản lý task
- `src/task-logs` - ghi task log theo ngày
- `src/kpi` - KPI cá nhân và ranking
- `src/reports` - báo cáo và cron tổng hợp
- `src/common` - decorators, guards, enums, dto chung

## Chạy dự án

```bash
npm install
npm run start:dev
```

## Các API mẫu

- `POST /auth/login`
- `GET /users`
- `GET /tasks`
- `GET /tasks/mine?userId=1`
- `POST /task-logs/check`
- `GET /kpi/ranking?period=month`
- `GET /reports?period=week&scope=department`
- `POST /reports/generate`

## Ghi chú

Đây là phiên bản sườn backend mẫu, chưa kết nối database thật. Bạn có thể tiếp tục bổ sung TypeORM / Prisma trong bước sau.
