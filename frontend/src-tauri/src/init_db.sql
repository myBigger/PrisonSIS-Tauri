-- PrisonSIS 数据库初始化脚本
-- SQLite 数据库表结构

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    real_name TEXT NOT NULL,
    role TEXT DEFAULT 'User',
    department TEXT,
    position TEXT,
    phone TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 服刑人员表
CREATE TABLE IF NOT EXISTS criminals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    criminal_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    gender TEXT,
    ethnicity TEXT,
    birth_date TEXT,
    id_card_number TEXT,
    native_place TEXT,
    education TEXT,
    crime TEXT,
    sentence_years INTEGER DEFAULT 0,
    sentence_months INTEGER DEFAULT 0,
    entry_date TEXT,
    original_court TEXT,
    district TEXT,
    cell TEXT,
    crime_type TEXT,
    manage_level TEXT DEFAULT '普通',
    handler_id TEXT,
    photo_path TEXT,
    remark TEXT,
    archived INTEGER DEFAULT 0,
    case_number TEXT,
    custody_date TEXT,
    custody_location TEXT,
    bed_number TEXT,
    contact_phone TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 笔录表
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT UNIQUE NOT NULL,
    record_type TEXT NOT NULL,
    criminal_id INTEGER NOT NULL,
    criminal_name TEXT,
    record_date TEXT,
    record_location TEXT,
    interrogator_id TEXT,
    recorder_id TEXT,
    present_persons TEXT,
    content TEXT,
    content_encrypted INTEGER DEFAULT 0,
    signed_interrogator INTEGER DEFAULT 0,
    signed_recorder INTEGER DEFAULT 0,
    signed_subject INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Draft',
    approver1_id TEXT,
    approver2_id TEXT,
    approver1_result TEXT,
    approver2_result TEXT,
    reject_reason TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (criminal_id) REFERENCES criminals(id)
);

-- 模板表
CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    content TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 日志表
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_criminals_name ON criminals(name);
CREATE INDEX IF NOT EXISTS idx_criminals_criminal_id ON criminals(criminal_id);
CREATE INDEX IF NOT EXISTS idx_records_record_id ON records(record_id);
CREATE INDEX IF NOT EXISTS idx_records_criminal_id ON records(criminal_id);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- 插入默认管理员用户 (密码: admin123)
-- 密码哈希: $pbkdf2$120000$<salt>$<hash> 格式
INSERT OR IGNORE INTO users (user_id, username, password_hash, real_name, role, department, position, enabled)
VALUES (
    'U001',
    'admin',
    '$pbkdf2$120000$7c4a8d09ca3762af61e59520943dc264$94f0aa8c7e9d8b3c5a7e8d9f0c1b2a3e4f5d6c7b8a9f0e1d2c3b4a5968778',
    '系统管理员',
    'Admin',
    '系统管理部',
    '系统管理员',
    1
);

-- 插入测试用户 (密码: user123)
INSERT OR IGNORE INTO users (user_id, username, password_hash, real_name, role, department, position, enabled)
VALUES (
    'U002',
    'operator',
    'e10adc3949ba59abbe56e057f20f883e',  -- MD5: 123456
    '操作员',
    'User',
    '审讯科',
    '审讯员',
    1
);

-- 插入测试服刑人员数据
INSERT OR IGNORE INTO criminals (criminal_id, name, gender, ethnicity, birth_date, id_card_number, native_place, education, crime, sentence_years, sentence_months, entry_date, district, cell, crime_type, manage_level)
VALUES
    ('CR-00001', '张某', '男', '汉族', '1990-05-12', '110101199005121234', '北京', '初中', '盗窃罪', 3, 0, '2026-01-15', '一监区', '101', '财产犯罪', '普通'),
    ('CR-00002', '李某', '女', '汉族', '1988-03-22', '310101198803221234', '上海', '高中', '故意伤害', 5, 6, '2026-02-13', '二监区', '203', '人身伤害', '重点'),
    ('CR-00003', '王某', '男', '汉族', '1995-08-30', '440101199508301234', '广州', '本科', '诈骗罪', 2, 0, '2026-02-19', '一监区', '105', '财产犯罪', '普通'),
    ('CR-00004', '赵某', '男', '回族', '1992-11-08', '610101199211081234', '西安', '初中', '抢劫罪', 7, 0, '2026-03-08', '三监区', '301', '暴力犯罪', '重点'),
    ('CR-00005', '刘某', '女', '汉族', '1997-02-14', '510101199702141234', '成都', '大专', '贩毒罪', 10, 0, '2026-03-12', '四监区', '401', '毒品犯罪', '严管');

-- 插入测试笔录数据
INSERT OR IGNORE INTO records (record_id, record_type, criminal_id, criminal_name, record_date, record_location, interrogator_id, recorder_id, present_persons, content, status)
VALUES
    ('BL-2026-0001', '问询', 1, '张某', '2026-04-24 09:30', '审讯室A', 'U002', 'U002', '审讯员2人', '问询笔录内容...', 'Approved'),
    ('BL-2026-0002', '审讯', 2, '李某', '2026-04-23 14:20', '审讯室B', 'U002', 'U002', '审讯员2人', '审讯笔录内容...', 'Pending'),
    ('BL-2026-0003', '问询', 3, '王某', '2026-04-23 10:00', '审讯室A', 'U002', 'U002', '审讯员2人', '问询笔录内容...', 'Approved'),
    ('BL-2026-0004', '问询', 4, '赵某', '2026-04-22 16:45', '审讯室C', 'U002', 'U002', '审讯员2人', '问询笔录内容...', 'Approved'),
    ('BL-2026-0005', '审讯', 5, '刘某', '2026-04-22 09:00', '审讯室A', 'U002', 'U002', '审讯员2人', '审讯笔录内容...', 'Draft');
