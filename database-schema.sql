CREATE DATABASE IF NOT EXISTS bctk;
USE bctk;

DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS kpi_scores;
DROP TABLE IF EXISTS task_logs;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS otp_tokens;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,
  role ENUM('admin', 'manager', 'staff') NOT NULL DEFAULT 'staff',
  branchId INT NULL,
  departmentId INT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE branches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE otp_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  purpose ENUM('login', 'reset-password') NOT NULL DEFAULT 'login',
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_email_purpose (email, purpose)
);

CREATE TABLE departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  branchId INT NULL,
  CONSTRAINT fk_departments_branch FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL
);

CREATE TABLE tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  assigneeId INT NULL,
  dueDate DATE NULL,
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  isRecurring BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assigneeId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  taskId INT NOT NULL,
  userId INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('upcoming', 'overdue') NOT NULL,
  notificationDate DATE NOT NULL,
  readAt DATETIME NULL,
  createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notifications_task_user_day (taskId, userId, notificationDate),
  CONSTRAINT fk_notifications_task FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE task_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  taskId INT NOT NULL,
  userId INT NOT NULL,
  logDate DATE NOT NULL,
  status ENUM('pending', 'done', 'late') NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_tasklogs_task FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasklogs_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE kpi_scores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  periodType ENUM('week', 'month') NOT NULL,
  periodValue VARCHAR(50) NOT NULL,
  completedCount INT NOT NULL DEFAULT 0,
  lateCount INT NOT NULL DEFAULT 0,
  score FLOAT NOT NULL DEFAULT 0,
  CONSTRAINT fk_kpis_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE reports (
  id INT PRIMARY KEY AUTO_INCREMENT,
  periodType ENUM('week', 'month') NOT NULL,
  periodValue VARCHAR(50) NOT NULL,
  scope ENUM('user', 'department', 'branch', 'company') NOT NULL,
  scopeId INT NULL,
  data JSON NOT NULL,
  generatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
  ADD CONSTRAINT fk_users_branch FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_department FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE SET NULL;

INSERT INTO branches (name) VALUES
  ('Hà Nội'),
  ('Đà Nẵng'),
  ('TP.HCM');

INSERT INTO departments (name, branchId) VALUES
  ('Phòng Kinh doanh', 1),
  ('Phòng Hành chính', 1),
  ('Phòng Kỹ thuật', 2),
  ('Phòng Tài chính', 3);

INSERT INTO users (name, email, password, role, branchId, departmentId) VALUES
  ('Admin', 'admin@example.com', '123456', 'admin', 1, 1),
  ('Manager', 'manager@example.com', '123456', 'manager', 1, 1),
  ('Staff', 'staff@example.com', '123456', 'staff', 2, 3);

INSERT INTO tasks (title, assigneeId, dueDate, priority, isRecurring) VALUES
  ('Cập nhật báo cáo tuần', 3, '2026-09-16', 'high', FALSE),
  ('Họp review KPI', 2, '2026-09-18', 'medium', TRUE),
  ('Nộp kế hoạch tháng', 1, '2026-09-20', 'low', FALSE);

INSERT INTO task_logs (taskId, userId, logDate, status) VALUES
  (1, 3, '2026-09-15', 'done'),
  (2, 2, '2026-09-15', 'pending'),
  (3, 1, '2026-09-15', 'late');

INSERT INTO kpi_scores (userId, periodType, periodValue, completedCount, lateCount, score) VALUES
  (1, 'month', '2026-09', 12, 2, 91.2),
  (2, 'month', '2026-09', 10, 1, 88.5),
  (3, 'week', '2026-W37', 8, 0, 96.0);

INSERT INTO reports (periodType, periodValue, scope, scopeId, data) VALUES
  ('month', '2026-09', 'company', NULL, '{"totalTasks": 48, "completedTasks": 42, "lateTasks": 6, "avgScore": 91.2}'),
  ('week', '2026-W37', 'department', 1, '{"totalTasks": 15, "completedTasks": 13, "lateTasks": 2, "avgScore": 90.5}');
