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
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    deleted_at TEXT
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

-- 案件表（阶段 3 最小列）
CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cases_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);

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
    case_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (criminal_id) REFERENCES criminals(id),
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT
);

-- 模板表
CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    content TEXT,
    template_kind TEXT NOT NULL DEFAULT 'free_text',
    guide_schema_json TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    deleted_at TEXT
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
CREATE INDEX IF NOT EXISTS idx_templates_deleted_at ON templates(deleted_at);

-- 插入默认管理员用户 (密码: admin123)
-- 与 db.rs verify_password 一致：MD5("{password}_prison_salt_2024")
INSERT OR IGNORE INTO users (user_id, username, password_hash, real_name, role, department, position, enabled)
VALUES (
    'U001',
    'admin',
    '3578e7a11fad49d8381dc4251900405f',
    '系统管理员',
    'Admin',
    '系统管理部',
    '系统管理员',
    1
);

-- 插入测试用户 (密码: 123456)
INSERT OR IGNORE INTO users (user_id, username, password_hash, real_name, role, department, position, enabled)
VALUES (
    'U002',
    'operator',
    '6ff59634a0f44f979afb161453a44100',
    '操作员',
    'User',
    '审讯科',
    '审讯员',
    1
);

-- 插入审计员用户 (密码: 123456)
INSERT OR IGNORE INTO users (user_id, username, password_hash, real_name, role, department, position, enabled)
VALUES (
    'U003',
    'auditor',
    '6ff59634a0f44f979afb161453a44100',
    '审计员',
    'Auditor',
    '纪检审计科',
    '审计员',
    1
);

-- 已有库升级：覆盖错误/过期的密码哈希（每次启动执行）
UPDATE users SET password_hash = '3578e7a11fad49d8381dc4251900405f' WHERE username = 'admin' AND user_id = 'U001';
UPDATE users SET password_hash = '6ff59634a0f44f979afb161453a44100' WHERE username = 'operator' AND user_id = 'U002';
UPDATE users SET password_hash = '6ff59634a0f44f979afb161453a44100' WHERE username = 'auditor' AND user_id = 'U003';

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

-- 笔录模板（固定 id 便于 INSERT OR IGNORE 幂等；监狱执法场景用语）
INSERT OR IGNORE INTO templates (id, name, category, content, created_by) VALUES
(1, '入监谈话笔录', 'RT-01', '监狱服刑人员入监谈话笔录（模板）

谈话时间：[谈话日期]
谈话地点：（依实际填写）
谈话人：（民警姓名、警号等）
记录人：

一、人员基本情况
服刑人员姓名：[服刑人员姓名]
（以下内容依档案据实填写或由其自述）

二、权利义务告知与监规纪律教育要点
（宣告申诉、控告途径；遵守监规、服从管理等）

三、谈话要点及服刑人员陈述摘要


四、服刑人员签名确认（当面签名）
服刑人员（签名）：____________  
谈话人（签名）：____________  
记录人（签名）：____________  
', 'system'),
(2, '个别教育谈话笔录', 'RT-02', '监狱个别教育谈话笔录（模板）

谈话时间：[谈话日期]
谈话地点：（依实际填写）
谈话人：
记录人：

一、谈话事由与教育主题


二、事实陈述与民警针对性教育内容摘要


三、服刑人员认识态度与表态


四、服刑人员签名确认（当面签名）
服刑人员（签名）：____________  
谈话人（签名）：____________  
记录人（签名）：____________  
', 'system'),
(3, '提押（出庭）谈话笔录', 'RT-03', '监狱提押（出庭）相关谈话笔录（模板）

谈话时间：[谈话日期]
押解/执勤民警：
记录人：

一、法律依据与本次提押（出庭）事由说明


二、纪律与安全注意事项告知摘要


三、服刑人员陈述与确认事项


四、服刑人员签名确认（当面签名）
服刑人员（签名）：____________  
谈话人（签名）：____________  
记录人（签名）：____________  
', 'system'),
(4, '出监前谈话笔录', 'RT-04', '监狱出监前谈话笔录（模板）

谈话时间：[谈话日期]
谈话地点：
谈话人：
记录人：

一、出监前权利义务与安置帮教衔接要点告知摘要


二、服刑人员思想动态与困难诉求摘要


三、谈话结论与服刑人员表态


四、服刑人员签名确认（当面签名）
服刑人员（签名）：____________  
谈话人（签名）：____________  
记录人（签名）：____________  
', 'system');
