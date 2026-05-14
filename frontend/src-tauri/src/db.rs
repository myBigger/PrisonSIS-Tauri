// db.rs — PrisonSIS 数据库层
use rusqlite::OptionalExtension;
use rusqlite::{params, params_from_iter, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::sync::Mutex;

static DB_PATH: Mutex<Option<String>> = Mutex::new(None);

/// SQL 片段：用户未被软删（用于 WHERE）
const ACTIVE_USER_SQL: &str = "(deleted_at IS NULL OR TRIM(COALESCE(deleted_at,'')) = '')";

pub fn init(db_path: &str) -> SqlResult<()> {
    // 测试连接
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    // 执行初始化 SQL 脚本
    if let Ok(sql) = std::fs::read_to_string("src/init_db.sql") {
        if let Err(e) = conn.execute_batch(&sql) {
            log::warn!("[DB] 初始化脚本执行失败: {}", e);
        } else {
            log::info!("[DB] 数据库初始化脚本执行成功");
        }
    } else {
        log::info!("[DB] 未找到初始化脚本，使用现有数据");
    }

    ensure_cases_schema(&conn)?;
    ensure_stage4_schema(&conn)?;
    ensure_stage5a_templates_schema(&conn)?;
    seed_guided_templates(&conn)?;
    upgrade_prison_templates_to_guided_if_needed(&conn)?;
    ensure_stage5_users_schema(&conn)?;

    drop(conn);

    let mut path = DB_PATH.lock().unwrap();
    *path = Some(db_path.to_string());
    log::info!("[DB] SQLite 连接路径已设置: {}", db_path);
    Ok(())
}

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> SqlResult<T>,
{
    let conn = db_conn()?;
    f(&conn).map_err(|e| e.to_string())
}

fn db_conn() -> Result<Connection, String> {
    let path = DB_PATH.lock().unwrap();
    let db_path = path.as_ref().ok_or_else(|| "数据库未初始化".to_string())?;
    Connection::open(db_path.as_str()).map_err(|e| e.to_string())
}

/// 阶段 3：已有库仅有 `records`、无 `cases`/`case_id` 时的增量迁移（`CREATE TABLE IF NOT EXISTS records` 不会改旧表结构）。
fn ensure_cases_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        r"CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            remark TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );",
    )?;
    conn.execute_batch(
        r"CREATE INDEX IF NOT EXISTS idx_cases_number ON cases(case_number);
          CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);",
    )?;
    let has_case_col: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('records') WHERE name='case_id'",
        [],
        |r| r.get(0),
    )?;
    if has_case_col == 0 {
        conn.execute(
            "ALTER TABLE records ADD COLUMN case_id INTEGER REFERENCES cases(id) ON DELETE RESTRICT",
            [],
        )?;
    }
    Ok(())
}

/// 阶段 5：用户软删字段（`deleted_at`）。
fn ensure_stage5_users_schema(conn: &Connection) -> SqlResult<()> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('users') WHERE name='deleted_at'",
        [],
        |r| r.get(0),
    )?;
    if n == 0 {
        conn.execute("ALTER TABLE users ADD COLUMN deleted_at TEXT", [])?;
    }
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)",
        [],
    )?;
    Ok(())
}

/// 阶段 4 增量迁移：模板软删字段。
fn ensure_stage4_schema(conn: &Connection) -> SqlResult<()> {
    let has_deleted_at_col: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('templates') WHERE name='deleted_at'",
        [],
        |r| r.get(0),
    )?;
    if has_deleted_at_col == 0 {
        conn.execute("ALTER TABLE templates ADD COLUMN deleted_at TEXT", [])?;
    }
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_templates_deleted_at ON templates(deleted_at)",
        [],
    )?;
    Ok(())
}

/// 阶段 5A 增量迁移：模板形态与引导式 schema 字段。
fn ensure_stage5a_templates_schema(conn: &Connection) -> SqlResult<()> {
    let has_template_kind_col: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('templates') WHERE name='template_kind'",
        [],
        |r| r.get(0),
    )?;
    if has_template_kind_col == 0 {
        conn.execute(
            "ALTER TABLE templates ADD COLUMN template_kind TEXT NOT NULL DEFAULT 'free_text'",
            [],
        )?;
    }

    let has_guide_schema_json_col: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('templates') WHERE name='guide_schema_json'",
        [],
        |r| r.get(0),
    )?;
    if has_guide_schema_json_col == 0 {
        conn.execute("ALTER TABLE templates ADD COLUMN guide_schema_json TEXT", [])?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_templates_template_kind ON templates(template_kind)",
        [],
    )?;
    conn.execute(
        "UPDATE templates
         SET template_kind = 'free_text'
         WHERE template_kind IS NULL OR TRIM(template_kind) = ''",
        [],
    )?;
    Ok(())
}

fn seed_guided_templates(conn: &Connection) -> SqlResult<()> {
    const INT_GUIDE: &str = r#"{"version":1,"headerFields":[{"key":"session_no","label":"第几次讯问","placeholder":"如：1"},{"key":"interrogator_unit","label":"讯问人工作单位"},{"key":"recorder_unit","label":"记录人工作单位"},{"key":"id_card_number","label":"居民身份证号"},{"key":"household_address","label":"户籍地址"}],"questions":[{"id":"q_opening_notice","prompt":"我们是XX监狱的人民警察（出示工作证件），现依法对你进行讯问。你听明白了吗？"},{"id":"q_health_status","prompt":"你现在的身体、精神状况能否接受讯问？"},{"id":"q_rights_notice","prompt":"《犯罪嫌疑人诉讼权利义务告知书》是否已阅知并明确权利义务？"},{"id":"q_leniency","prompt":"你是否清楚认罪认罚从宽制度并愿意依法如实供述？"},{"id":"q_lawyer","prompt":"你是否需要聘请律师作为辩护人？"},{"id":"q_identity","prompt":"请说明你的基本情况。","multiline":true},{"id":"q_social_relation","prompt":"请说明你的社会关系。","multiline":true},{"id":"q_case_reason","prompt":"你知道今日民警找你所为何事吗？"},{"id":"q_case_detail","prompt":"请详细讲述事情经过。","multiline":true},{"id":"q_rights_protection","prompt":"讯问期间是否保障你的饮食和休息？"},{"id":"q_illegal_actions","prompt":"讯问人员是否存在诱供、刑讯逼供或其他侵权行为？"},{"id":"q_additional","prompt":"你还有什么需要补充的？","multiline":true},{"id":"q_truth_confirm","prompt":"你以上所说是否属实？"},{"id":"q_signature_notice","prompt":"你是否确认以上笔录经阅看与陈述一致？"}],"signaturePlaceholder":"被讯问人签名：__________"}"#;
    const INQ_GUIDE: &str = r#"{"version":1,"headerFields":[{"key":"session_no","label":"第几次询问","placeholder":"如：1"},{"key":"interrogator_unit","label":"询问人工作单位"},{"key":"recorder_unit","label":"记录人工作单位"},{"key":"id_card_number","label":"居民身份证号"},{"key":"household_address","label":"户籍地址"}],"questions":[{"id":"q_opening_notice","prompt":"我们依法对你进行询问，你应当如实回答问题。你听明白了吗？"},{"id":"q_narrative","prompt":"请陈述本次事项经过。","multiline":true},{"id":"q_additional","prompt":"你还有什么要补充的？","multiline":true},{"id":"q_truth_confirm","prompt":"你以上所说是否属实？"}],"signaturePlaceholder":"被询问人签名：__________"}"#;
    const PEN_GUIDE: &str = r#"{"version":1,"headerFields":[{"key":"session_no","label":"第几次询问","placeholder":"如：1"},{"key":"interrogator_unit","label":"询问人工作单位"},{"key":"recorder_unit","label":"记录人工作单位"},{"key":"record_total_pages","label":"本笔录共几页","placeholder":"如：2"}],"questions":[{"id":"q_opening_notice","prompt":"我们依法对你进行询问，你是否明白如实陈述义务？"},{"id":"q_basic_info","prompt":"请说明你的个人基本情况。","multiline":true},{"id":"q_property_judgement","prompt":"你的财产性判项（罚金、追缴、民赔等）及履行情况如何？","multiline":true},{"id":"q_civil_case","prompt":"案发至今，受害人或其亲属是否另案提起民事诉讼或民事赔偿？"},{"id":"q_property_declare","prompt":"你是否如实申报个人财产情况？"},{"id":"q_declare_awareness","prompt":"你是否知晓未按规定申报财产可能影响减刑？"},{"id":"q_sentencing_awareness","prompt":"对于“量刑不当”的认识，请说明。","multiline":true},{"id":"q_additional","prompt":"你有无需要补充的？","multiline":true},{"id":"q_truth_confirm","prompt":"你以上所说情况是否全部属实？"},{"id":"q_read_confirm","prompt":"你是否确认以上笔录已阅看，与你所述一致？"}],"signaturePlaceholder":"被询问人签名：__________"}"#;

    conn.execute(
        "INSERT OR IGNORE INTO templates
         (id, name, category, content, template_kind, guide_schema_json, created_by, created_at, deleted_at)
         VALUES (?1, ?2, ?3, '', 'guided', ?4, 'system', datetime('now', 'localtime'), NULL)",
        params![101i64, "讯问笔录（试点）", "GUIDE-INT-01", INT_GUIDE],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO templates
         (id, name, category, content, template_kind, guide_schema_json, created_by, created_at, deleted_at)
         VALUES (?1, ?2, ?3, '', 'guided', ?4, 'system', datetime('now', 'localtime'), NULL)",
        params![102i64, "普通询问笔录（试点）", "GUIDE-INQ-01", INQ_GUIDE],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO templates
         (id, name, category, content, template_kind, guide_schema_json, created_by, created_at, deleted_at)
         VALUES (?1, ?2, ?3, '', 'guided', ?4, 'system', datetime('now', 'localtime'), NULL)",
        params![103i64, "刑罚业务询问笔录（试点）", "GUIDE-PEN-01", PEN_GUIDE],
    )?;
    Ok(())
}

/// 将内置四套「监狱执法谈话」模板从自由正文升级为引导式（与 init_db 种子 id/name 一致）。
/// 仅在仍为 free_text 且未配置 guide_schema 时写入，避免覆盖用户已改模板。
fn upgrade_prison_templates_to_guided_if_needed(conn: &Connection) -> SqlResult<()> {
    const RT01: &str = r#"{"version":1,"questions":[{"id":"q_adm_basic","prompt":"一、人员基本情况（依档案据实填写或由其自述）","multiline":true},{"id":"q_adm_rights","prompt":"二、权利义务告知与监规纪律教育要点（申诉、控告途径；遵守监规、服从管理等）","multiline":true},{"id":"q_adm_summary","prompt":"三、谈话要点及服刑人员陈述摘要","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\n谈话人（签名）：__________\n记录人（签名）：__________"}"#;
    const RT02: &str = r#"{"version":1,"questions":[{"id":"q_indiv_topic","prompt":"一、谈话事由与教育主题","multiline":true},{"id":"q_indiv_facts","prompt":"二、事实陈述与民警针对性教育内容摘要","multiline":true},{"id":"q_indiv_attitude","prompt":"三、服刑人员认识态度与表态","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\n谈话人（签名）：__________\n记录人（签名）：__________"}"#;
    const RT03: &str = r#"{"version":1,"questions":[{"id":"q_escort_law","prompt":"一、法律依据与本次提押（出庭）事由说明","multiline":true},{"id":"q_escort_safety","prompt":"二、纪律与安全注意事项告知摘要","multiline":true},{"id":"q_escort_confirm","prompt":"三、服刑人员陈述与确认事项","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\n谈话人（签名）：__________\n记录人（签名）：__________"}"#;
    const RT04: &str = r#"{"version":1,"questions":[{"id":"q_release_rights","prompt":"一、出监前权利义务与安置帮教衔接要点告知摘要","multiline":true},{"id":"q_release_appeals","prompt":"二、服刑人员思想动态与困难诉求摘要","multiline":true},{"id":"q_release_conclusion","prompt":"三、谈话结论与服刑人员表态","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\n谈话人（签名）：__________\n记录人（签名）：__________"}"#;

    let rows: &[(i64, &str, &str)] = &[
        (1, "入监谈话笔录", RT01),
        (2, "个别教育谈话笔录", RT02),
        (3, "提押（出庭）谈话笔录", RT03),
        (4, "出监前谈话笔录", RT04),
    ];

    for (id, expected_name, schema) in rows {
        conn.execute(
            "UPDATE templates
             SET template_kind = 'guided', guide_schema_json = ?1
             WHERE id = ?2 AND name = ?3
               AND deleted_at IS NULL
               AND (template_kind IS NULL OR LOWER(TRIM(template_kind)) = 'free_text')
               AND (guide_schema_json IS NULL OR TRIM(COALESCE(guide_schema_json, '')) = '')",
            params![schema, id, expected_name],
        )?;
    }
    Ok(())
}

fn validate_case_ref(conn: &Connection, case_id: Option<i64>) -> Result<(), String> {
    let Some(cid) = case_id.filter(|&id| id > 0) else {
        return Ok(());
    };
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM cases WHERE id = ?1)",
            params![cid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("关联案件不存在".into());
    }
    Ok(())
}

// ── 密码验证 ─────────────────────────────────────────────
fn verify_password(password: &str, stored_hash: &str) -> bool {
    if stored_hash.starts_with("$pbkdf2$") {
        let parts: Vec<&str> = stored_hash.split('$').collect();
        if parts.len() != 5 {
            return false;
        }
        let Ok(iterations) = parts[2].parse::<u32>() else {
            return false;
        };
        let salt = match hex::decode(parts[3]) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let stored_key = match hex::decode(parts[4]) {
            Ok(k) => k,
            Err(_) => return false,
        };
        let computed = pbkdf2_sha256(password.as_bytes(), &salt, iterations);
        computed == stored_key
    } else {
        // 旧 MD5 格式兼容
        let salt = "prison_salt_2024";
        let input = format!("{}_{}", password, salt);
        let computed = format!("{:x}", {
            let mut h = md5::Context::new();
            let _ = h.write_all(input.as_bytes());
            h.compute()
        });
        computed == stored_hash
    }
}

fn pbkdf2_sha256(password: &[u8], salt: &[u8], iterations: u32) -> Vec<u8> {
    let mut result = vec![0u8; 32];
    let mut block = vec![0u8; salt.len() + 4];
    block[..salt.len()].copy_from_slice(salt);
    let mut hmac_inner = vec![0x36u8; 64];
    let mut hmac_outer = vec![0x5cu8; 64];
    for (i, &byte) in password.iter().enumerate() {
        hmac_inner[i] ^= byte;
        hmac_outer[i] ^= byte;
    }
    let mut accumulated: Vec<u8> = Vec::new();
    let mut block_index: u32 = 1;
    while accumulated.len() < 32 {
        block[salt.len()..].copy_from_slice(&block_index.to_be_bytes());
        let mut u = {
            let mut inner = Sha256::new();
            inner.update(&hmac_inner);
            inner.update(&block);
            inner.finalize()
        };
        let mut result_block = u.to_vec();
        for _ in 1..iterations {
            let mut inner = Sha256::new();
            inner.update(&hmac_inner);
            inner.update(&u);
            u = inner.finalize();
            for (j, &byte) in u.iter().enumerate() {
                result_block[j] ^= byte;
            }
        }
        accumulated.extend(result_block);
        block_index += 1;
    }
    result.copy_from_slice(&accumulated[..32]);
    result
}

fn hash_password_pbkdf2(password: &str) -> String {
    use rand::Rng;
    let mut salt = [0u8; 16];
    rand::thread_rng().fill(&mut salt);
    let iterations: u32 = 100_000;
    let key = pbkdf2_sha256(password.as_bytes(), &salt, iterations);
    format!(
        "$pbkdf2${}${}${}",
        iterations,
        hex::encode(salt),
        hex::encode(key)
    )
}

fn role_is_elevated(role: &str) -> bool {
    matches!(role.trim(), "Admin" | "Auditor")
}

fn validate_regular_create_role(role: &str) -> Result<(), String> {
    if matches!(role.trim(), "User" | "Approver") {
        Ok(())
    } else {
        Err("常规新建仅可选择 User 或 Approver".into())
    }
}

fn validate_privileged_create_role(role: &str) -> Result<(), String> {
    if matches!(role.trim(), "Admin" | "Auditor") {
        Ok(())
    } else {
        Err("授权入口仅用于创建管理员或审计员角色".into())
    }
}

fn validate_any_staff_role(role: &str) -> Result<(), String> {
    if matches!(
        role.trim(),
        "Admin" | "Auditor" | "User" | "Approver"
    ) {
        Ok(())
    } else {
        Err("无效角色".into())
    }
}

fn ensure_role_backup(
    conn: &Connection,
    user_role: &str,
    user_id: &str,
    command: &str,
) -> Result<(), String> {
    ensure_role(conn, user_role, user_id, &["Admin", "Approver"], command)
}

// ── 数据模型 ─────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub user_id: String,
    pub username: String,
    pub real_name: String,
    pub role: String,
    pub department: String,
    pub position: String,
    pub phone: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Criminal {
    pub id: i64,
    pub criminal_id: String,
    pub name: String,
    pub gender: String,
    pub ethnicity: String,
    pub birth_date: String,
    pub id_card_number: String,
    pub native_place: String,
    pub education: String,
    pub crime: String,
    pub sentence_years: i32,
    pub sentence_months: i32,
    pub entry_date: String,
    pub original_court: String,
    pub district: String,
    pub cell: String,
    pub crime_type: String,
    pub manage_level: String,
    pub handler_id: String,
    pub photo_path: String,
    pub remark: String,
    pub archived: bool,
    pub case_number: String,
    pub custody_date: String,
    pub custody_location: String,
    pub bed_number: String,
    pub contact_phone: String,
    pub created_at: String,
}

/// 新增服刑人员输入（不包含 `id/created_at`）。
#[derive(Debug, Deserialize)]
pub struct CriminalCreateInput {
    pub criminal_id: String,
    pub name: String,
    #[serde(default)]
    pub gender: String,
    #[serde(default)]
    pub ethnicity: String,
    #[serde(default)]
    pub birth_date: String,
    #[serde(default)]
    pub id_card_number: String,
    #[serde(default)]
    pub native_place: String,
    #[serde(default)]
    pub education: String,
    #[serde(default)]
    pub crime: String,
    #[serde(default)]
    pub sentence_years: i32,
    #[serde(default)]
    pub sentence_months: i32,
    #[serde(default)]
    pub entry_date: String,
    #[serde(default)]
    pub original_court: String,
    #[serde(default)]
    pub district: String,
    #[serde(default)]
    pub cell: String,
    #[serde(default)]
    pub crime_type: String,
    #[serde(default)]
    pub manage_level: String,
    #[serde(default)]
    pub handler_id: String,
    #[serde(default)]
    pub photo_path: String,
    #[serde(default)]
    pub remark: String,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub case_number: String,
    #[serde(default)]
    pub custody_date: String,
    #[serde(default)]
    pub custody_location: String,
    #[serde(default)]
    pub bed_number: String,
    #[serde(default)]
    pub contact_phone: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Record {
    pub id: i64,
    pub record_id: String,
    pub record_type: String,
    pub criminal_id: i64,
    pub criminal_name: String,
    pub record_date: String,
    pub record_location: String,
    pub interrogator_id: String,
    pub recorder_id: String,
    pub present_persons: String,
    pub content: String,
    pub content_encrypted: bool,
    pub signed_interrogator: bool,
    pub signed_recorder: bool,
    pub signed_subject: bool,
    pub status: String,
    pub approver1_id: String,
    pub approver2_id: String,
    pub approver1_result: String,
    pub approver2_result: String,
    pub reject_reason: String,
    #[serde(default)]
    pub case_id: Option<i64>,
    #[serde(default)]
    pub case_number: String,
    pub created_at: String,
}

/// 新建笔录（服务端生成 `record_id`，默认 `Draft`）
#[derive(Debug, Deserialize)]
pub struct RecordInput {
    pub record_type: String,
    pub criminal_id: i64,
    pub record_date: String,
    pub record_location: String,
    pub interrogator_id: String,
    pub recorder_id: String,
    pub present_persons: String,
    pub content: String,
    #[serde(default)]
    pub case_id: Option<i64>,
}

/// 案件（与 `cases` 表最小列一致）
#[derive(Debug, Serialize, Deserialize)]
pub struct Case {
    pub id: i64,
    pub case_number: String,
    pub title: String,
    pub status: String,
    pub remark: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CaseInput {
    pub case_number: String,
    pub title: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub remark: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub today_records: i64,
    pub pending_approvals: i64,
    pub total_criminals: i64,
    pub total_cases: i64,
    pub closed_cases: i64,
    pub active_cases: i64,
    pub yesterday_delta: i64,
    pub expired_count: i64,
    pub month_new_criminals: i64,
    pub month_new_cases: i64,
    pub month_records: i64,
    pub approval_rate: f64,
    pub avg_approval_hours: f64,
    pub archive_rate: f64,
    pub monthly_trends: Vec<MonthlyTrendItem>,
    pub crime_distribution: Vec<CrimeDistributionItem>,
}

#[derive(Debug, Serialize)]
pub struct MonthlyTrendItem {
    pub month: String,
    pub records: i64,
    pub criminals: i64,
}

#[derive(Debug, Serialize)]
pub struct CrimeDistributionItem {
    pub label: String,
    pub count: i64,
    pub percent: f64,
}

/// 笔录正文模板（与 `templates` 表一致）
#[derive(Debug, Serialize, Deserialize)]
pub struct Template {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub content: String,
    pub template_kind: String,
    pub guide_schema_json: String,
    pub created_at: String,
    pub deleted_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TemplateInput {
    pub name: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub template_kind: String,
    #[serde(default)]
    pub guide_schema_json: String,
}

#[derive(Debug, Deserialize)]
pub struct ExportRecordFilter {
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub start_date: String,
    #[serde(default)]
    pub end_date: String,
    #[serde(default)]
    pub criminal_code: String,
    #[serde(default)]
    pub case_number: String,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub file_path: String,
    pub exported_count: i64,
}

#[derive(Debug, Serialize)]
pub struct AuditLog {
    pub id: i64,
    pub user_id: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub detail: String,
    pub ip_address: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedUserRow {
    pub id: i64,
    pub user_id: String,
    pub username: String,
    pub real_name: String,
    pub role: String,
    pub department: String,
    pub position: String,
    pub phone: String,
    pub enabled: bool,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCreateInput {
    pub user_id: String,
    pub username: String,
    pub real_name: String,
    pub role: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub phone: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdateInput {
    pub id: i64,
    pub user_id: String,
    pub username: String,
    pub real_name: String,
    pub role: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub phone: String,
}

// ── Tauri Commands ───────────────────────────────────────
#[derive(Debug, Serialize)]
pub struct LoginResult {
    pub success: bool,
    pub message: String,
    pub user: Option<User>,
}

#[tauri::command]
pub fn login(username: String, password: String) -> Result<LoginResult, String> {
    with_db(|conn| {
        let user: Result<User, _> = conn.query_row(
            "SELECT id, user_id, username, real_name, role,
                    COALESCE(department,'') as department,
                    COALESCE(position,'') as position,
                    COALESCE(phone,'') as phone, enabled
             FROM users WHERE username=?1 AND enabled=1
             AND (deleted_at IS NULL OR TRIM(deleted_at) = '')",
            params![username],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    username: row.get(2)?,
                    real_name: row.get(3)?,
                    role: row.get(4)?,
                    department: row.get(5)?,
                    position: row.get(6)?,
                    phone: row.get(7)?,
                    enabled: row.get::<_, i32>(8)? == 1,
                })
            },
        );

        match user {
            Ok(u) => {
                let stored_hash: String = conn.query_row(
                    "SELECT password_hash FROM users WHERE id=?1",
                    params![u.id],
                    |r| r.get(0),
                )?;
                if verify_password(&password, &stored_hash) {
                    Ok(LoginResult {
                        success: true,
                        message: "登录成功".into(),
                        user: Some(u),
                    })
                } else {
                    Ok(LoginResult {
                        success: false,
                        message: "用户名或密码错误".into(),
                        user: None,
                    })
                }
            }
            Err(_) => Ok(LoginResult {
                success: false,
                message: "用户不存在或已被禁用".into(),
                user: None,
            }),
        }
    })
}

#[tauri::command]
pub fn get_criminals() -> Result<Vec<Criminal>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, criminal_id, name, gender, ethnicity, birth_date,
                    id_card_number, native_place, education, crime,
                    sentence_years, sentence_months, entry_date, original_court,
                    district, cell, crime_type, manage_level, handler_id,
                    photo_path, remark, archived,
                    COALESCE(case_number,'') as case_number,
                    COALESCE(custody_date,'') as custody_date,
                    COALESCE(custody_location,'') as custody_location,
                    COALESCE(bed_number,'') as bed_number,
                    COALESCE(contact_phone,'') as contact_phone, created_at
             FROM criminals ORDER BY id DESC LIMIT 200",
        )?;
        let rows = stmt.query_map([], map_criminal)?;
        let mut criminals = Vec::new();
        for row in rows {
            criminals.push(row?);
        }
        Ok(criminals)
    })
}

fn map_criminal(row: &rusqlite::Row) -> rusqlite::Result<Criminal> {
    Ok(Criminal {
        id: row.get(0)?,
        criminal_id: row.get(1)?,
        name: row.get(2)?,
        gender: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        ethnicity: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        birth_date: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        id_card_number: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        native_place: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        education: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        crime: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
        sentence_years: row.get::<_, Option<i32>>(10)?.unwrap_or(0),
        sentence_months: row.get::<_, Option<i32>>(11)?.unwrap_or(0),
        entry_date: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
        original_court: row.get::<_, Option<String>>(13)?.unwrap_or_default(),
        district: row.get::<_, Option<String>>(14)?.unwrap_or_default(),
        cell: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
        crime_type: row.get::<_, Option<String>>(16)?.unwrap_or_default(),
        manage_level: row.get::<_, Option<String>>(17)?.unwrap_or_default(),
        handler_id: row.get::<_, Option<String>>(18)?.unwrap_or_default(),
        photo_path: row.get::<_, Option<String>>(19)?.unwrap_or_default(),
        remark: row.get::<_, Option<String>>(20)?.unwrap_or_default(),
        archived: row.get::<_, i32>(21)? == 1,
        case_number: row.get(22)?,
        custody_date: row.get(23)?,
        custody_location: row.get(24)?,
        bed_number: row.get(25)?,
        contact_phone: row.get(26)?,
        created_at: row.get(27)?,
    })
}

#[tauri::command]
pub fn get_criminals_by_page(
    page: i64,
    page_size: i64,
    search: String,
    status_filter: String,
    type_filter: String,
) -> Result<(Vec<Criminal>, i64), String> {
    with_db(|conn| {
        let search = search.trim().to_string();
        let status_filter = match status_filter.trim() {
            "active" => "active",
            "archived" => "archived",
            _ => "",
        };
        let type_filter = type_filter.trim().to_string();
        let search_pattern = if search.is_empty() {
            String::new()
        } else {
            format!("%{}%", search)
        };

        let total: i64 = conn.query_row(
            "SELECT COUNT(*)
             FROM criminals
             WHERE (?1 = '' OR name LIKE ?1 OR criminal_id LIKE ?1 OR crime LIKE ?1)
               AND (?2 = '' OR (?2 = 'active' AND archived = 0) OR (?2 = 'archived' AND archived = 1))
               AND (?3 = '' OR TRIM(COALESCE(crime_type,'')) = ?3)",
            params![search_pattern, status_filter, type_filter],
            |r| r.get(0),
        )?;

        let offset = page * page_size;

        let mut criminals = Vec::new();
        let mut stmt = conn.prepare(
            "SELECT id, criminal_id, name, gender, ethnicity, birth_date,
                    id_card_number, native_place, education, crime,
                    sentence_years, sentence_months, entry_date, original_court,
                    district, cell, crime_type, manage_level, handler_id,
                    photo_path, remark, archived,
                    COALESCE(case_number,'') as case_number,
                    COALESCE(custody_date,'') as custody_date,
                    COALESCE(custody_location,'') as custody_location,
                    COALESCE(bed_number,'') as bed_number,
                    COALESCE(contact_phone,'') as contact_phone, created_at
             FROM criminals
             WHERE (?3 = '' OR name LIKE ?3 OR criminal_id LIKE ?3 OR crime LIKE ?3)
               AND (?4 = '' OR (?4 = 'active' AND archived = 0) OR (?4 = 'archived' AND archived = 1))
               AND (?5 = '' OR TRIM(COALESCE(crime_type,'')) = ?5)
             ORDER BY id DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(
            params![page_size, offset, search_pattern, status_filter, type_filter],
            map_criminal,
        )?;
        for row in rows {
            criminals.push(row?);
        }

        Ok((criminals, total))
    })
}

#[tauri::command]
pub fn get_archive_criminals_by_page(
    page: i64,
    page_size: i64,
    search: String,
    archived_filter: String,
) -> Result<(Vec<Criminal>, i64), String> {
    let search = search.trim().to_string();
    let archived_filter = archived_filter.trim().to_string();
    with_db(|conn| {
        let offset = page * page_size;
        let has_search = !search.is_empty();
        let mut criminals = Vec::new();
        let archived_clause = match archived_filter.as_str() {
            "archived" => "archived = 1",
            "active" => "archived = 0",
            _ => "1 = 1",
        };

        let total: i64 = if has_search {
            let pat = format!("%{}%", search);
            conn.query_row(
                &format!(
                    "SELECT COUNT(*) FROM criminals WHERE {archived_clause} AND (name LIKE ?1 OR criminal_id LIKE ?1 OR crime LIKE ?1)"
                ),
                params![pat],
                |r| r.get(0),
            )?
        } else {
            conn.query_row(
                &format!("SELECT COUNT(*) FROM criminals WHERE {archived_clause}"),
                [],
                |r| r.get(0),
            )?
        };

        if has_search {
            let pat = format!("%{}%", search);
            let mut stmt = conn.prepare(&format!(
                "SELECT id, criminal_id, name, gender, ethnicity, birth_date,
                        id_card_number, native_place, education, crime,
                        sentence_years, sentence_months, entry_date, original_court,
                        district, cell, crime_type, manage_level, handler_id,
                        photo_path, remark, archived,
                        COALESCE(case_number,'') as case_number,
                        COALESCE(custody_date,'') as custody_date,
                        COALESCE(custody_location,'') as custody_location,
                        COALESCE(bed_number,'') as bed_number,
                        COALESCE(contact_phone,'') as contact_phone, created_at
                 FROM criminals
                 WHERE {archived_clause} AND (name LIKE ?3 OR criminal_id LIKE ?3 OR crime LIKE ?3)
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2"
            ))?;
            let rows = stmt.query_map(params![page_size, offset, pat], map_criminal)?;
            for row in rows {
                criminals.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(&format!(
                "SELECT id, criminal_id, name, gender, ethnicity, birth_date,
                        id_card_number, native_place, education, crime,
                        sentence_years, sentence_months, entry_date, original_court,
                        district, cell, crime_type, manage_level, handler_id,
                        photo_path, remark, archived,
                        COALESCE(case_number,'') as case_number,
                        COALESCE(custody_date,'') as custody_date,
                        COALESCE(custody_location,'') as custody_location,
                        COALESCE(bed_number,'') as bed_number,
                        COALESCE(contact_phone,'') as contact_phone, created_at
                 FROM criminals
                 WHERE {archived_clause}
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2"
            ))?;
            let rows = stmt.query_map(params![page_size, offset], map_criminal)?;
            for row in rows {
                criminals.push(row?);
            }
        }

        Ok((criminals, total))
    })
}

#[tauri::command]
pub fn archive_criminal(id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("无效服刑人员 id".into());
    }
    with_db(|conn| {
        let n = conn.execute("UPDATE criminals SET archived = 1 WHERE id = ?1", params![id])?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    })
    .map_err(|_| "服刑人员不存在".to_string())
}

#[tauri::command]
pub fn unarchive_criminal(id: i64, user_role: String) -> Result<(), String> {
    if id <= 0 {
        return Err("无效服刑人员 id".into());
    }
    if user_role.trim() != "Admin" {
        return Err("仅管理员可取消归档".into());
    }
    with_db(|conn| {
        let n = conn.execute("UPDATE criminals SET archived = 0 WHERE id = ?1", params![id])?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    })
    .map_err(|_| "服刑人员不存在".to_string())
}

const RECORD_SELECT_SQL: &str =
    "SELECT r.id, r.record_id, r.record_type, r.criminal_id, r.criminal_name,
            r.record_date, r.record_location, r.interrogator_id, r.recorder_id,
            r.present_persons, r.content, r.content_encrypted,
            r.signed_interrogator, r.signed_recorder, r.signed_subject,
            r.status,
            COALESCE(r.approver1_id,'') as approver1_id,
            COALESCE(r.approver2_id,'') as approver2_id,
            COALESCE(r.approver1_result,'') as approver1_result,
            COALESCE(r.approver2_result,'') as approver2_result,
            COALESCE(r.reject_reason,'') as reject_reason,
            r.case_id,
            COALESCE(c.case_number,'') as case_number,
            COALESCE(r.created_at,'') as created_at ";

const RECORD_FROM: &str = "FROM records r LEFT JOIN cases c ON r.case_id = c.id ";

#[tauri::command]
pub fn get_records(
    page: i64,
    page_size: i64,
    search: String,
    status_filter: String,
) -> Result<(Vec<Record>, i64), String> {
    let search = search.trim().to_string();
    let status_filter = status_filter.trim().to_string();
    let has_search = !search.is_empty();
    let has_status = !status_filter.is_empty();

    with_db(|conn| {
        let offset = page * page_size;
        let mut records = Vec::new();

        match (has_search, has_status) {
            (false, false) => {
                let total: i64 =
                    conn.query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0))?;
                let mut stmt = conn.prepare(&format!(
                    "{RECORD_SELECT_SQL} {RECORD_FROM} ORDER BY r.id DESC LIMIT ?1 OFFSET ?2"
                ))?;
                let rows = stmt.query_map(params![page_size, offset], map_record)?;
                for row in rows {
                    records.push(row?);
                }
                Ok((records, total))
            }
            (false, true) => {
                let total: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM records WHERE status = ?1",
                    params![status_filter],
                    |r| r.get(0),
                )?;
                let mut stmt = conn.prepare(&format!(
                    "{RECORD_SELECT_SQL} {RECORD_FROM} WHERE r.status = ?3 ORDER BY r.id DESC LIMIT ?1 OFFSET ?2"
                ))?;
                let rows = stmt.query_map(params![page_size, offset, status_filter], map_record)?;
                for row in rows {
                    records.push(row?);
                }
                Ok((records, total))
            }
            (true, false) => {
                let pat = format!("%{}%", search);
                let total: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM records r LEFT JOIN cases c ON r.case_id = c.id
                     WHERE r.record_id LIKE ?1 OR r.criminal_name LIKE ?1 OR COALESCE(c.case_number,'') LIKE ?1",
                    params![pat],
                    |r| r.get(0),
                )?;
                let mut stmt = conn.prepare(&format!(
                    "{RECORD_SELECT_SQL} {RECORD_FROM}
                 WHERE r.record_id LIKE ?3 OR r.criminal_name LIKE ?3 OR COALESCE(c.case_number,'') LIKE ?3
                 ORDER BY r.id DESC LIMIT ?1 OFFSET ?2"
                ))?;
                let rows = stmt.query_map(params![page_size, offset, pat], map_record)?;
                for row in rows {
                    records.push(row?);
                }
                Ok((records, total))
            }
            (true, true) => {
                let pat = format!("%{}%", search);
                let total: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM records r LEFT JOIN cases c ON r.case_id = c.id
                     WHERE r.status = ?1 AND (r.record_id LIKE ?2 OR r.criminal_name LIKE ?2 OR COALESCE(c.case_number,'') LIKE ?2)",
                    params![status_filter, pat],
                    |r| r.get(0),
                )?;
                let mut stmt = conn.prepare(&format!(
                    "{RECORD_SELECT_SQL} {RECORD_FROM}
                 WHERE r.status = ?3 AND (r.record_id LIKE ?4 OR r.criminal_name LIKE ?4 OR COALESCE(c.case_number,'') LIKE ?4)
                 ORDER BY r.id DESC LIMIT ?1 OFFSET ?2"
                ))?;
                let rows =
                    stmt.query_map(params![page_size, offset, status_filter, pat], map_record)?;
                for row in rows {
                    records.push(row?);
                }
                Ok((records, total))
            }
        }
    })
}

fn fetch_record(conn: &Connection, id: i64) -> SqlResult<Record> {
    conn.query_row(
        &format!("{RECORD_SELECT_SQL} {RECORD_FROM} WHERE r.id = ?1"),
        params![id],
        map_record,
    )
}

/// 次年递增编号：`BL-{年}-XXXX`
fn next_record_id(conn: &Connection) -> SqlResult<String> {
    let today = chrono_date();
    let year: String = today.chars().take(4).collect();
    let prefix = format!("BL-{year}-");
    let pattern = format!("{prefix}%");
    let last: Option<String> = conn
        .query_row(
            "SELECT record_id FROM records WHERE record_id LIKE ?1 ORDER BY record_id DESC LIMIT 1",
            params![pattern],
            |row| row.get(0),
        )
        .optional()?;
    let seq = match last {
        Some(rid) => rid
            .rsplit('-')
            .next()
            .and_then(|s| s.parse::<u32>().ok())
            .map(|n| n.saturating_add(1))
            .unwrap_or(1),
        None => 1,
    };
    Ok(format!("{prefix}{seq:04}"))
}

#[tauri::command]
pub fn get_record_by_id(id: i64) -> Result<Record, String> {
    let conn = db_conn()?;
    fetch_record(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_templates() -> Result<Vec<Template>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
                    COALESCE(template_kind,''), COALESCE(guide_schema_json,''),
                    COALESCE(created_at,''), COALESCE(deleted_at,'')
             FROM templates
             WHERE deleted_at IS NULL
             ORDER BY id",
        )?;
        let rows = stmt.query_map([], map_template_row)?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r?);
        }
        Ok(v)
    })
}

fn map_template_row(row: &rusqlite::Row) -> rusqlite::Result<Template> {
    let template_kind = row
        .get::<_, Option<String>>(4)?
        .unwrap_or_else(|| "free_text".to_string());
    Ok(Template {
        id: row.get(0)?,
        name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        category: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        content: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        template_kind: if template_kind.trim().eq_ignore_ascii_case("guided") {
            "guided".to_string()
        } else {
            "free_text".to_string()
        },
        guide_schema_json: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        created_at: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        deleted_at: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
    })
}

#[tauri::command]
pub fn get_templates_by_page(
    page: i64,
    page_size: i64,
    search: String,
    include_disabled: bool,
) -> Result<(Vec<Template>, i64), String> {
    let search = search.trim().to_string();
    with_db(|conn| {
        let offset = page * page_size;
        let has_search = !search.is_empty();
        let pat = format!("%{}%", search);
        let mut templates = Vec::new();

        let total: i64 = if include_disabled {
            if has_search {
                conn.query_row(
                    "SELECT COUNT(*) FROM templates
                     WHERE name LIKE ?1 OR category LIKE ?1 OR content LIKE ?1 OR guide_schema_json LIKE ?1",
                    params![pat],
                    |r| r.get(0),
                )?
            } else {
                conn.query_row("SELECT COUNT(*) FROM templates", [], |r| r.get(0))?
            }
        } else if has_search {
            conn.query_row(
                "SELECT COUNT(*) FROM templates
                 WHERE deleted_at IS NULL
                   AND (name LIKE ?1 OR category LIKE ?1 OR content LIKE ?1 OR guide_schema_json LIKE ?1)",
                params![pat],
                |r| r.get(0),
            )?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM templates WHERE deleted_at IS NULL",
                [],
                |r| r.get(0),
            )?
        };

        if include_disabled {
            if has_search {
                let mut stmt = conn.prepare(
                    "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
                            COALESCE(template_kind,''), COALESCE(guide_schema_json,''),
                            COALESCE(created_at,''), COALESCE(deleted_at,'')
                     FROM templates
                     WHERE name LIKE ?3 OR category LIKE ?3 OR content LIKE ?3 OR guide_schema_json LIKE ?3
                     ORDER BY id DESC LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt.query_map(params![page_size, offset, pat], map_template_row)?;
                for row in rows {
                    templates.push(row?);
                }
            } else {
                let mut stmt = conn.prepare(
                    "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
                            COALESCE(template_kind,''), COALESCE(guide_schema_json,''),
                            COALESCE(created_at,''), COALESCE(deleted_at,'')
                     FROM templates
                     ORDER BY id DESC LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt.query_map(params![page_size, offset], map_template_row)?;
                for row in rows {
                    templates.push(row?);
                }
            }
        } else if has_search {
            let mut stmt = conn.prepare(
                "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
                        COALESCE(template_kind,''), COALESCE(guide_schema_json,''),
                        COALESCE(created_at,''), COALESCE(deleted_at,'')
                 FROM templates
                 WHERE deleted_at IS NULL
                   AND (name LIKE ?3 OR category LIKE ?3 OR content LIKE ?3 OR guide_schema_json LIKE ?3)
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![page_size, offset, pat], map_template_row)?;
            for row in rows {
                templates.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
                        COALESCE(template_kind,''), COALESCE(guide_schema_json,''),
                        COALESCE(created_at,''), COALESCE(deleted_at,'')
                 FROM templates
                 WHERE deleted_at IS NULL
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![page_size, offset], map_template_row)?;
            for row in rows {
                templates.push(row?);
            }
        }
        Ok((templates, total))
    })
}

#[tauri::command]
pub fn get_template_by_id(id: i64) -> Result<Template, String> {
    if id <= 0 {
        return Err("无效模板 id".into());
    }
    let conn = db_conn()?;
    conn.query_row(
        "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
                COALESCE(template_kind,''), COALESCE(guide_schema_json,''),
                COALESCE(created_at,''), COALESCE(deleted_at,'')
         FROM templates WHERE id = ?1",
        params![id],
        map_template_row,
    )
    .map_err(|_| "模板不存在".to_string())
}

#[tauri::command]
pub fn add_template(input: TemplateInput) -> Result<Template, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("模板名称不能为空".into());
    }
    let normalized_kind = if input.template_kind.trim().eq_ignore_ascii_case("guided") {
        "guided"
    } else {
        "free_text"
    };
    let conn = db_conn()?;
    conn.execute(
        "INSERT INTO templates
         (name, category, content, template_kind, guide_schema_json, created_by, created_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'system', datetime('now', 'localtime'), NULL)",
        params![
            name,
            input.category.trim(),
            input.content,
            normalized_kind,
            input.guide_schema_json
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_template_by_id(id)
}

#[tauri::command]
pub fn update_template(t: Template) -> Result<(), String> {
    if t.id <= 0 {
        return Err("无效模板 id".into());
    }
    if t.name.trim().is_empty() {
        return Err("模板名称不能为空".into());
    }
    let normalized_kind = if t.template_kind.trim().eq_ignore_ascii_case("guided") {
        "guided"
    } else {
        "free_text"
    };
    with_db(|conn| {
        let n = conn.execute(
            "UPDATE templates
             SET name = ?2, category = ?3, content = ?4, template_kind = ?5, guide_schema_json = ?6
             WHERE id = ?1",
            params![
                t.id,
                t.name.trim(),
                t.category.trim(),
                t.content,
                normalized_kind,
                t.guide_schema_json
            ],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    })
    .map_err(|_| "模板不存在".to_string())
}

#[tauri::command]
pub fn disable_template(id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("无效模板 id".into());
    }
    with_db(|conn| {
        let n = conn.execute(
            "UPDATE templates
             SET deleted_at = datetime('now', 'localtime')
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
        )?;
        if n == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    })
    .map_err(|_| "模板不存在或已停用".to_string())
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn localize_log_action(action: &str) -> String {
    match action.trim() {
        "" => "—".to_string(),
        "login" => "登录".to_string(),
        "logout" => "登出".to_string(),
        "add_record" => "新增笔录".to_string(),
        "update_record" => "更新笔录".to_string(),
        "submit_pending" | "record_submit_pending" => "提交审批".to_string(),
        "approve_record" | "record_approve" => "审批通过".to_string(),
        "reject_record" | "record_reject" => "审批驳回".to_string(),
        "export_records_csv" => "导出笔录".to_string(),
        "export_logs_csv" => "导出日志".to_string(),
        "clear_logs" | "logs_clear" => "清空日志".to_string(),
        "permission_deny" => "权限拒绝".to_string(),
        "user_add" => "新增用户".to_string(),
        "user_update" => "更新用户".to_string(),
        "user_soft_delete" => "用户软删除".to_string(),
        "user_restore" => "恢复用户".to_string(),
        "user_enable" => "启用用户".to_string(),
        "user_disable" => "禁用用户".to_string(),
        "reset_password_admin" => "重置密码".to_string(),
        "password_change_self" => "修改本人密码".to_string(),
        "database_backup" => "数据库备份".to_string(),
        "database_restore" => "数据库恢复".to_string(),
        x => x.to_string(),
    }
}

fn localize_log_target_type(target_type: &str) -> String {
    match target_type.trim() {
        "" => "—".to_string(),
        "record" | "records" => "笔录".to_string(),
        "command" => "接口命令".to_string(),
        "logs" => "日志".to_string(),
        "user" | "users" => "用户".to_string(),
        "case" | "cases" => "案件".to_string(),
        "criminal" | "criminals" => "服刑人员".to_string(),
        "template" | "templates" => "模板".to_string(),
        "auth" => "认证".to_string(),
        "database" => "数据库".to_string(),
        x => x.to_string(),
    }
}

fn localize_log_detail(detail: &str) -> String {
    let text = detail.trim();
    if text.is_empty() {
        return "—".to_string();
    }
    let translated: Vec<String> = text
        .split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|seg| {
            let mut iter = seg.splitn(2, '=');
            let key = iter.next().unwrap_or("").trim();
            let value = iter.next();
            if key.is_empty() || value.is_none() {
                return seg.to_string();
            }
            let key_cn = match key {
                "result" => "结果",
                "role" => "角色",
                "allowed" => "允许角色",
                "count" => "数量",
                "scope" => "范围",
                "search" | "keyword" => "关键字",
                "status" => "状态",
                "start_date" => "开始日期",
                "end_date" => "结束日期",
                "criminal_code" => "服刑人员编号",
                "case_number" => "案件编号",
                "command" => "命令",
                "reason" => "原因",
                "dest" => "目标路径",
                "sha_file" => "校验文件",
                "src" => "来源路径",
                "record_id" => "笔录编号",
                _ => key,
            };
            format!("{}={}", key_cn, value.unwrap_or("").trim())
        })
        .collect();
    translated.join("；")
}

fn build_export_filter_clause(filter: &ExportRecordFilter) -> (String, Vec<String>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut args: Vec<String> = Vec::new();

    let keyword = filter.keyword.trim();
    if !keyword.is_empty() {
        clauses.push(
            "(r.record_id LIKE ? OR r.criminal_name LIKE ? OR COALESCE(c.case_number,'') LIKE ?)"
                .to_string(),
        );
        let pat = format!("%{}%", keyword);
        args.push(pat.clone());
        args.push(pat.clone());
        args.push(pat);
    }

    let status = filter.status.trim();
    if !status.is_empty() {
        clauses.push("r.status = ?".to_string());
        args.push(status.to_string());
    }

    let criminal_code = filter.criminal_code.trim();
    if !criminal_code.is_empty() {
        clauses.push("COALESCE(cr.criminal_id,'') = ?".to_string());
        args.push(criminal_code.to_string());
    }

    let case_number = filter.case_number.trim();
    if !case_number.is_empty() {
        clauses.push("COALESCE(c.case_number,'') = ?".to_string());
        args.push(case_number.to_string());
    }

    let start_date = filter.start_date.trim();
    if !start_date.is_empty() {
        clauses.push("date(COALESCE(r.record_date,'')) >= date(?)".to_string());
        args.push(start_date.to_string());
    }

    let end_date = filter.end_date.trim();
    if !end_date.is_empty() {
        clauses.push("date(COALESCE(r.record_date,'')) <= date(?)".to_string());
        args.push(end_date.to_string());
    }

    if clauses.is_empty() {
        ("".to_string(), args)
    } else {
        (format!(" WHERE {}", clauses.join(" AND ")), args)
    }
}

#[tauri::command]
pub fn export_records_count(
    filter: ExportRecordFilter,
    user_role: String,
    user_id: String,
) -> Result<i64, String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "User", "Approver"],
        "export_records_count",
    )?;
    let base_from = "FROM records r
                     LEFT JOIN cases c ON r.case_id = c.id
                     LEFT JOIN criminals cr ON r.criminal_id = cr.id";
    let (where_sql, args) = build_export_filter_clause(&filter);
    let sql = format!("SELECT COUNT(*) {base_from}{where_sql}");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let count: i64 = stmt
        .query_row(params_from_iter(args.iter()), |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn export_records_csv(
    filter: ExportRecordFilter,
    file_path: String,
    user_role: String,
    user_id: String,
) -> Result<ExportResult, String> {
    let file_path = file_path.trim().to_string();
    if file_path.is_empty() {
        return Err("导出路径不能为空".into());
    }
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "User", "Approver"],
        "export_records_csv",
    )?;
    let rows_data: Vec<Vec<String>> = {
        let base_select = "SELECT r.record_id,
                                COALESCE(c.case_number,'') as case_number,
                                COALESCE(cr.criminal_id,'') as criminal_code,
                                COALESCE(r.criminal_name,'') as criminal_name,
                                COALESCE(r.record_type,'') as record_type,
                                COALESCE(r.status,'') as status,
                                COALESCE(r.record_date,'') as record_date,
                                COALESCE(r.record_location,'') as record_location,
                                COALESCE(r.interrogator_id,'') as interrogator_id,
                                COALESCE(r.recorder_id,'') as recorder_id,
                                COALESCE(r.created_at,'') as created_at,
                                COALESCE(r.reject_reason,'') as reject_reason
                         FROM records r
                         LEFT JOIN cases c ON r.case_id = c.id
                         LEFT JOIN criminals cr ON r.criminal_id = cr.id";
        let (where_sql, args) = build_export_filter_clause(&filter);
        let sql = format!("{base_select}{where_sql} ORDER BY r.id DESC");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params_from_iter(args.iter()), |row| {
            Ok(vec![
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
            ])
        }).map_err(|e| e.to_string())?;
        let mut rows_data: Vec<Vec<String>> = Vec::new();
        for row in rows {
            rows_data.push(row.map_err(|e| e.to_string())?);
        }
        rows_data
    };

    let headers = [
        "笔录编号(record_id)",
        "案件案号(case_number)",
        "服刑人员编号(criminal_code)",
        "服刑人员姓名(criminal_name)",
        "笔录类型(record_type)",
        "状态(status)",
        "谈话时间(record_date)",
        "谈话地点(record_location)",
        "谈话人(interrogator_id)",
        "记录人(recorder_id)",
        "创建时间(created_at)",
        "驳回理由(reject_reason)",
    ];

    let mut lines = Vec::new();
    lines.push(headers.join(","));
    for row in &rows_data {
        lines.push(row.iter().map(|x| csv_escape(x)).collect::<Vec<_>>().join(","));
    }
    let csv_text = lines.join("\n");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(csv_text.as_bytes());

    let path = std::path::Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, bytes).map_err(|e| format!("写入导出文件失败: {}", e))?;

    let audit_user = if user_id.trim().is_empty() { "unknown" } else { user_id.trim() };
    let detail = format!(
        "count={};keyword={};status={};start_date={};end_date={};criminal_code={};case_number={}",
        rows_data.len(),
        filter.keyword.trim(),
        filter.status.trim(),
        filter.start_date.trim(),
        filter.end_date.trim(),
        filter.criminal_code.trim(),
        filter.case_number.trim()
    );
    log_audit_as(&conn, audit_user, "export_records_csv", "records", "*", &detail)
        .map_err(|e| e.to_string())?;

    Ok(ExportResult {
        file_path,
        exported_count: rows_data.len() as i64,
    })
}

fn build_logs_where_clause(search: &str, start_date: &str, end_date: &str) -> (String, Vec<String>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut args: Vec<String> = Vec::new();

    // 按空白分词：多词之间 OR（适配「中文 + 英文别名」如 `拒绝 permission_deny`）
    let mut tokens: Vec<String> = Vec::new();
    for t in search.split_whitespace() {
        let t = t.trim();
        if t.is_empty() {
            continue;
        }
        if !tokens.iter().any(|x| x == t) {
            tokens.push(t.to_string());
        }
    }

    if !tokens.is_empty() {
        let one_group =
            "(user_id LIKE ? OR action LIKE ? OR target_type LIKE ? OR target_id LIKE ? OR detail LIKE ?)";
        let search_or = tokens
            .iter()
            .map(|_| one_group.to_string())
            .collect::<Vec<_>>()
            .join(" OR ");
        clauses.push(format!("({search_or})"));
        for t in tokens {
            let pat = format!("%{t}%");
            for _ in 0..5 {
                args.push(pat.clone());
            }
        }
    }
    if !start_date.trim().is_empty() {
        clauses.push(
            "substr(trim(COALESCE(created_at,'')), 1, 10) >= ?".to_string(),
        );
        args.push(start_date.trim().to_string());
    }
    if !end_date.trim().is_empty() {
        clauses.push(
            "substr(trim(COALESCE(created_at,'')), 1, 10) <= ?".to_string(),
        );
        args.push(end_date.trim().to_string());
    }

    if clauses.is_empty() {
        ("".to_string(), args)
    } else {
        (format!(" WHERE {}", clauses.join(" AND ")), args)
    }
}

fn map_audit_log_row(row: &rusqlite::Row) -> rusqlite::Result<AuditLog> {
    Ok(AuditLog {
        id: row.get(0)?,
        user_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        action: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        target_type: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        target_id: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        detail: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        ip_address: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        created_at: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_logs_by_page(
    page: i64,
    page_size: i64,
    search: String,
    start_date: String,
    end_date: String,
    user_role: String,
    user_id: String,
) -> Result<(Vec<AuditLog>, i64), String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Auditor"],
        "get_logs_by_page",
    )?;
    let (where_sql, args) = build_logs_where_clause(&search, &start_date, &end_date);
    let total_sql = format!("SELECT COUNT(*) FROM logs{where_sql}");
    let total: i64 = conn
        .query_row(&total_sql, params_from_iter(args.iter()), |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let offset = (page.max(0)) * page_size.max(1);
    let mut list_args = args.clone();
    list_args.push(page_size.max(1).to_string());
    list_args.push(offset.to_string());
    let list_sql = format!(
        "SELECT id, user_id, action, target_type, target_id, detail, COALESCE(ip_address,''), created_at
         FROM logs{where_sql}
         ORDER BY id DESC LIMIT ? OFFSET ?"
    );
    let mut stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(list_args.iter()), map_audit_log_row)
        .map_err(|e| e.to_string())?;
    let mut logs = Vec::new();
    for row in rows {
        logs.push(row.map_err(|e| e.to_string())?);
    }
    Ok((logs, total))
}

#[tauri::command(rename_all = "snake_case")]
pub fn export_logs_csv(
    search: String,
    start_date: String,
    end_date: String,
    file_path: String,
    user_role: String,
    user_id: String,
) -> Result<ExportResult, String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Auditor"],
        "export_logs_csv",
    )?;
    let file_path = file_path.trim().to_string();
    if file_path.is_empty() {
        return Err("导出路径不能为空".into());
    }
    let (where_sql, args) = build_logs_where_clause(&search, &start_date, &end_date);
    let sql = format!(
        "SELECT id, user_id, action, target_type, target_id, detail, COALESCE(ip_address,''), created_at
         FROM logs{where_sql}
         ORDER BY id DESC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(args.iter()), map_audit_log_row)
        .map_err(|e| e.to_string())?;
    let mut data: Vec<AuditLog> = Vec::new();
    for row in rows {
        data.push(row.map_err(|e| e.to_string())?);
    }

    let headers = ["时间", "操作人", "动作", "模块", "目标", "详情"];
    let mut lines = Vec::new();
    lines.push(headers.join(","));
    for r in &data {
        lines.push(
            vec![
                csv_escape(&r.created_at),
                csv_escape(&r.user_id),
                csv_escape(&localize_log_action(&r.action)),
                csv_escape(&localize_log_target_type(&r.target_type)),
                csv_escape(&r.target_id),
                csv_escape(&localize_log_detail(&r.detail)),
            ]
            .join(","),
        );
    }
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(lines.join("\n").as_bytes());
    let path = std::path::Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, bytes).map_err(|e| format!("写入导出文件失败: {}", e))?;

    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    let detail = format!(
        "result=success;count={};search={};start_date={};end_date={}",
        data.len(),
        search.trim(),
        start_date.trim(),
        end_date.trim()
    );
    log_audit_as(&conn, audit_user, "export_logs_csv", "logs", "*", &detail)
        .map_err(|e| e.to_string())?;

    Ok(ExportResult {
        file_path,
        exported_count: data.len() as i64,
    })
}

#[tauri::command]
pub fn clear_logs(user_role: String, user_id: String) -> Result<i64, String> {
    let conn = db_conn()?;
    ensure_role(&conn, &user_role, &user_id, &["Admin"], "clear_logs")?;
    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };

    // 先记录清空动作，再清空其它日志，确保清空动作本身可追溯。
    log_audit_as(
        &conn,
        audit_user,
        "logs_clear",
        "logs",
        "*",
        "result=success;scope=all_except_logs_clear",
    )
    .map_err(|e| e.to_string())?;

    let deleted = conn
        .execute("DELETE FROM logs WHERE action <> 'logs_clear'", [])
        .map_err(|e| e.to_string())?;
    Ok(deleted as i64)
}

fn map_managed_user_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManagedUserRow> {
    let deleted: Option<String> = row.get(9)?;
    let deleted_at = deleted.and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    });
    Ok(ManagedUserRow {
        id: row.get(0)?,
        user_id: row.get(1)?,
        username: row.get(2)?,
        real_name: row.get(3)?,
        role: row.get(4)?,
        department: row.get(5)?,
        position: row.get(6)?,
        phone: row.get(7)?,
        enabled: row.get::<_, i32>(8)? == 1,
        created_at: row.get(10)?,
        deleted_at,
    })
}

#[tauri::command]
pub fn suggest_next_user_id(user_role: String, user_id: String) -> Result<String, String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin"],
        "suggest_next_user_id",
    )?;
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM users",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(format!("U{:04}", next))
}

#[tauri::command]
pub fn get_users_by_page(
    page: i64,
    page_size: i64,
    search: String,
    include_deleted: bool,
    user_role: String,
    user_id: String,
) -> Result<(Vec<ManagedUserRow>, i64), String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin"],
        "get_users_by_page",
    )?;
    let kw = search.trim().to_string();
    let mut parts: Vec<String> = Vec::new();
    let mut args: Vec<String> = Vec::new();
    if !include_deleted {
        parts.push(format!("({})", ACTIVE_USER_SQL));
    }
    if !kw.is_empty() {
        parts.push("(username LIKE ? OR real_name LIKE ? OR user_id LIKE ?)".to_string());
        let pat = format!("%{}%", kw);
        args.push(pat.clone());
        args.push(pat.clone());
        args.push(pat);
    }
    let where_sql = if parts.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", parts.join(" AND "))
    };
    let count_sql = format!("SELECT COUNT(*) FROM users{where_sql}");
    let total: i64 = conn
        .query_row(&count_sql, params_from_iter(args.iter()), |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let ps = page_size.max(1).min(500);
    let off = page.max(0).saturating_mul(ps);
    let list_sql = format!(
        "SELECT id, user_id, username, real_name, role,
                COALESCE(department,''), COALESCE(position,''), COALESCE(phone,''), enabled,
                deleted_at, COALESCE(created_at,'')
         FROM users{where_sql} ORDER BY id DESC LIMIT {ps} OFFSET {off}"
    );
    let mut stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(args.iter()), map_managed_user_row)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok((out, total))
}

#[tauri::command]
pub fn add_user(
    input: UserCreateInput,
    privileged_elevated: bool,
    user_role: String,
    user_id: String,
) -> Result<i64, String> {
    let conn = db_conn()?;
    ensure_role(&conn, &user_role, &user_id, &["Admin"], "add_user")?;
    if privileged_elevated {
        validate_privileged_create_role(&input.role)?;
    } else {
        validate_regular_create_role(&input.role)?;
    }
    let pw = input.password.trim();
    if pw.len() < 6 {
        return Err("初始密码至少 6 位".into());
    }
    let uid = input.user_id.trim();
    let uname = input.username.trim();
    let real = input.real_name.trim();
    if uid.is_empty() || uname.is_empty() || real.is_empty() {
        return Err("用户编号、账号、姓名不能为空".into());
    }
    let dup: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM users WHERE ({}) AND (user_id = ? OR username = ?)",
                ACTIVE_USER_SQL
            ),
            params![uid, uname],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if dup > 0 {
        return Err("用户编号或账号与现有有效用户冲突".into());
    }
    let hash = hash_password_pbkdf2(pw);
    conn.execute(
        "INSERT INTO users (user_id, username, password_hash, real_name, role, department, position, phone, enabled)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1)",
        params![
            uid,
            uname,
            hash,
            real,
            input.role.trim(),
            input.department.trim(),
            input.position.trim(),
            input.phone.trim(),
        ],
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "用户编号或账号已存在".to_string()
        } else {
            msg
        }
    })?;
    let new_row_id = conn.last_insert_rowid();
    let audit_user = user_id.trim();
    log_audit_as(
        &conn,
        audit_user,
        "user_add",
        "user",
        uid,
        &format!("role={}", input.role.trim()),
    )
    .map_err(|e| e.to_string())?;
    Ok(new_row_id)
}

#[tauri::command]
pub fn update_user(
    input: UserUpdateInput,
    privileged_role_edit: bool,
    user_role: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db_conn()?;
    ensure_role(&conn, &user_role, &user_id, &["Admin"], "update_user")?;
    validate_any_staff_role(input.role.trim())?;
    let (prev_role, prev_deleted): (String, Option<String>) = conn
        .query_row(
            "SELECT COALESCE(role,''), deleted_at FROM users WHERE id=?1",
            params![input.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "用户不存在".to_string())?;
    if prev_deleted
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return Err("已删除用户请先恢复后再编辑".into());
    }
    let new_r = input.role.trim();
    let role_changed = prev_role.trim() != new_r;
    let prev_el = role_is_elevated(&prev_role);
    let new_el = role_is_elevated(new_r);
    if role_changed && (prev_el || new_el) && !privileged_role_edit {
        return Err("涉及管理员或审计员角色的变更须勾选授权编辑".into());
    }
    let uid = input.user_id.trim();
    let uname = input.username.trim();
    let real = input.real_name.trim();
    if uid.is_empty() || uname.is_empty() || real.is_empty() {
        return Err("用户编号、账号、姓名不能为空".into());
    }
    let dup: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM users WHERE id <> ?1 AND ({}) AND (user_id = ?2 OR username = ?3)",
                ACTIVE_USER_SQL
            ),
            params![input.id, uid, uname],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if dup > 0 {
        return Err("用户编号或账号与现有有效用户冲突".into());
    }
    conn.execute(
        "UPDATE users SET user_id=?1, username=?2, real_name=?3, role=?4,
             department=?5, position=?6, phone=?7
         WHERE id=?8",
        params![
            uid,
            uname,
            real,
            new_r,
            input.department.trim(),
            input.position.trim(),
            input.phone.trim(),
            input.id,
        ],
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "用户编号或账号已存在".to_string()
        } else {
            msg
        }
    })?;
    let audit_user = user_id.trim();
    log_audit_as(
        &conn,
        audit_user,
        "user_update",
        "user",
        uid,
        &format!("role={}", new_r),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn soft_delete_user(id: i64, user_role: String, user_id: String) -> Result<(), String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin"],
        "soft_delete_user",
    )?;
    let target_uid: String = conn
        .query_row("SELECT user_id FROM users WHERE id=?1", params![id], |r| {
            r.get(0)
        })
        .map_err(|_| "用户不存在".to_string())?;
    if target_uid.trim() == user_id.trim() {
        return Err("不能删除当前登录账号".into());
    }
    let n = conn
        .execute(
            &format!(
                "UPDATE users SET deleted_at = datetime('now','localtime')
             WHERE id=?1 AND ({})",
                ACTIVE_USER_SQL
            ),
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("用户不存在或已删除".into());
    }
    log_audit_as(
        &conn,
        user_id.trim(),
        "user_soft_delete",
        "user",
        target_uid.trim(),
        "result=success",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_soft_deleted_user(id: i64, user_role: String, user_id: String) -> Result<(), String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin"],
        "restore_soft_deleted_user",
    )?;
    let target_uid: String = conn
        .query_row("SELECT user_id FROM users WHERE id=?1", params![id], |r| {
            r.get(0)
        })
        .map_err(|_| "用户不存在".to_string())?;
    let n = conn
        .execute(
            "UPDATE users SET deleted_at = NULL
             WHERE id=?1 AND COALESCE(TRIM(deleted_at),'') <> ''",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("用户未处于已删除状态".into());
    }
    log_audit_as(
        &conn,
        user_id.trim(),
        "user_restore",
        "user",
        target_uid.trim(),
        "result=success",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_user_enabled(
    id: i64,
    enabled: bool,
    user_role: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin"],
        "set_user_enabled",
    )?;
    let target_uid: String = conn
        .query_row("SELECT user_id FROM users WHERE id=?1", params![id], |r| {
            r.get(0)
        })
        .map_err(|_| "用户不存在".to_string())?;
    let en = if enabled { 1 } else { 0 };
    let n = conn
        .execute(
            &format!(
                "UPDATE users SET enabled=?1 WHERE id=?2 AND ({})",
                ACTIVE_USER_SQL
            ),
            params![en, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("用户不存在或为已删除状态".into());
    }
    let act = if enabled { "user_enable" } else { "user_disable" };
    log_audit_as(
        &conn,
        user_id.trim(),
        act,
        "user",
        target_uid.trim(),
        &format!("enabled={}", enabled),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reset_password_admin(
    target_id: i64,
    new_password: String,
    user_role: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin"],
        "reset_password_admin",
    )?;
    let np = new_password.trim();
    if np.len() < 6 {
        return Err("新密码至少 6 位".into());
    }
    let target_uid: String = conn
        .query_row(
            "SELECT user_id FROM users WHERE id=?1",
            params![target_id],
            |r| r.get(0),
        )
        .map_err(|_| "用户不存在".to_string())?;
    let hash = hash_password_pbkdf2(np);
    conn.execute(
        "UPDATE users SET password_hash=?1 WHERE id=?2",
        params![hash, target_id],
    )
    .map_err(|e| e.to_string())?;
    log_audit_as(
        &conn,
        user_id.trim(),
        "reset_password_admin",
        "user",
        target_uid.trim(),
        "result=success",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn change_own_password(
    old_password: String,
    new_password: String,
    user_role: String,
    user_id: String,
) -> Result<(), String> {
    if user_id.trim().is_empty() {
        return Err("未登录".into());
    }
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Auditor", "User", "Approver"],
        "change_own_password",
    )?;
    let np = new_password.trim();
    if np.len() < 6 {
        return Err("新密码至少 6 位".into());
    }
    let stored_hash: String = conn
        .query_row(
            &format!(
                "SELECT password_hash FROM users WHERE user_id=?1 AND ({}) AND enabled=1",
                ACTIVE_USER_SQL
            ),
            params![user_id.trim()],
            |r| r.get(0),
        )
        .map_err(|_| "用户不存在或已禁用".to_string())?;
    if !verify_password(&old_password, &stored_hash) {
        return Err("原密码错误".into());
    }
    let new_hash = hash_password_pbkdf2(np);
    conn.execute(
        "UPDATE users SET password_hash=?1 WHERE user_id=?2",
        params![new_hash, user_id.trim()],
    )
    .map_err(|e| e.to_string())?;
    log_audit_as(
        &conn,
        user_id.trim(),
        "password_change_self",
        "user",
        user_id.trim(),
        "result=success",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_database_backup(
    dest_path: String,
    user_role: String,
    user_id: String,
) -> Result<String, String> {
    let dest_path = dest_path.trim().to_string();
    if dest_path.is_empty() {
        return Err("备份路径不能为空".into());
    }
    let db_path = {
        let p = DB_PATH.lock().unwrap();
        p.clone().ok_or_else(|| "数据库未初始化".to_string())?
    };
    let conn = Connection::open(db_path.as_str()).map_err(|e| e.to_string())?;
    ensure_role_backup(&conn, &user_role, &user_id, "export_database_backup")?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())?;
    drop(conn);
    std::fs::copy(db_path.as_str(), dest_path.as_str())
        .map_err(|e| format!("复制数据库失败: {}", e))?;
    let bytes = std::fs::read(dest_path.as_str()).map_err(|e| e.to_string())?;
    let digest = Sha256::digest(&bytes);
    let hash_hex = hex::encode(digest);
    let sha_path = format!("{}.sha256", dest_path);
    let fname = std::path::Path::new(&dest_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("backup.db");
    std::fs::write(&sha_path, format!("{hash_hex}  {fname}\n")).map_err(|e| e.to_string())?;

    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    let conn2 = db_conn()?;
    let detail = format!("dest={};sha_file={}", dest_path, sha_path);
    log_audit_as(
        &conn2,
        audit_user,
        "database_backup",
        "database",
        "*",
        &detail,
    )
    .map_err(|e| e.to_string())?;
    Ok(dest_path)
}

#[tauri::command]
pub fn restore_database_backup(
    backup_path: String,
    user_role: String,
    user_id: String,
) -> Result<(), String> {
    let backup_path = backup_path.trim().to_string();
    if backup_path.is_empty() {
        return Err("备份文件路径不能为空".into());
    }
    let bp = std::path::Path::new(&backup_path);
    if !bp.is_file() {
        return Err("备份文件不存在".into());
    }
    let conn = db_conn()?;
    ensure_role_backup(&conn, &user_role, &user_id, "restore_database_backup")?;
    drop(conn);

    let sha_path = format!("{}.sha256", backup_path);
    if std::path::Path::new(&sha_path).is_file() {
        let expected_line = std::fs::read_to_string(&sha_path).map_err(|e| e.to_string())?;
        let expected_hex = expected_line.split_whitespace().next().unwrap_or("");
        let bytes = std::fs::read(&backup_path).map_err(|e| e.to_string())?;
        let actual = hex::encode(Sha256::digest(&bytes));
        if !expected_hex.is_empty() && expected_hex != actual {
            return Err("校验和不匹配，已中止恢复".into());
        }
    }

    let db_path = {
        let p = DB_PATH.lock().unwrap();
        p.clone().ok_or_else(|| "数据库未初始化".to_string())?
    };

    std::fs::copy(backup_path.as_str(), db_path.as_str())
        .map_err(|e| format!("恢复数据库失败: {}", e))?;

    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    let conn2 = db_conn()?;
    log_audit_as(
        &conn2,
        audit_user,
        "database_restore",
        "database",
        "*",
        &format!("src={}", backup_path),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_record(input: RecordInput) -> Result<Record, String> {
    let rt = input.record_type.trim().to_string();
    if rt.is_empty() {
        return Err("笔录类型不能为空".into());
    }
    if input.criminal_id <= 0 {
        return Err("请选择服刑人员".into());
    }

    let conn = db_conn()?;
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM criminals WHERE id = ?1)",
            params![input.criminal_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("服刑人员不存在或已删除".into());
    }

    validate_case_ref(&conn, input.case_id)?;

    let criminal_name: String = conn
        .query_row(
            "SELECT COALESCE(name,'') FROM criminals WHERE id = ?1",
            params![input.criminal_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?;

    let record_id = next_record_id(&conn).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO records (
                record_id, record_type, criminal_id, criminal_name,
                record_date, record_location, interrogator_id, recorder_id,
                present_persons, content, content_encrypted,
                signed_interrogator, signed_recorder, signed_subject, status, case_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,0,0,0,'Draft',?11)",
        params![
            record_id,
            rt,
            input.criminal_id,
            criminal_name,
            input.record_date.trim(),
            input.record_location.trim(),
            input.interrogator_id.trim(),
            input.recorder_id.trim(),
            input.present_persons.trim(),
            input.content,
            input.case_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let new_id = conn.last_insert_rowid();
    fetch_record(&conn, new_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_record(record: Record) -> Result<(), String> {
    if record.id <= 0 {
        return Err("无效笔录 id".into());
    }
    if record.record_type.trim().is_empty() {
        return Err("笔录类型不能为空".into());
    }
    if record.criminal_id <= 0 {
        return Err("请选择服刑人员".into());
    }

    let conn = db_conn()?;
    let status: String = conn
        .query_row(
            "SELECT COALESCE(status,'') FROM records WHERE id = ?1",
            params![record.id],
            |r| r.get(0),
        )
        .map_err(|_| "笔录不存在".to_string())?;
    if status != "Draft" {
        return Err("仅草稿状态可编辑".into());
    }

    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM criminals WHERE id = ?1)",
            params![record.criminal_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("服刑人员不存在或已删除".into());
    }

    validate_case_ref(&conn, record.case_id)?;

    let criminal_name: String = conn
        .query_row(
            "SELECT COALESCE(name,'') FROM criminals WHERE id = ?1",
            params![record.criminal_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE records SET
                record_type = ?2, criminal_id = ?3, criminal_name = ?4,
                record_date = ?5, record_location = ?6,
                interrogator_id = ?7, recorder_id = ?8, present_persons = ?9, content = ?10,
                case_id = ?11
             WHERE id = ?1",
        params![
            record.id,
            record.record_type.trim(),
            record.criminal_id,
            criminal_name,
            record.record_date.trim(),
            record.record_location.trim(),
            record.interrogator_id.trim(),
            record.recorder_id.trim(),
            record.present_persons.trim(),
            record.content,
            record.case_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── 审批（阶段 2）──────────────────────────────────────────

const LOG_ACTION_SUBMIT_PENDING: &str = "record_submit_pending";
const LOG_ACTION_APPROVE: &str = "record_approve";
const LOG_ACTION_REJECT: &str = "record_reject";

fn log_audit_as(
    conn: &Connection,
    user_id: &str,
    action: &str,
    target_type: &str,
    target_id: &str,
    detail: &str,
) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO logs (user_id, action, target_type, target_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user_id, action, target_type, target_id, detail],
    )?;
    Ok(())
}

fn ensure_role(
    conn: &Connection,
    user_role: &str,
    user_id: &str,
    allowed_roles: &[&str],
    command: &str,
) -> Result<(), String> {
    if allowed_roles.iter().any(|x| *x == user_role.trim()) {
        return Ok(());
    }
    let detail = format!(
        "result=deny;role={};allowed={}",
        user_role.trim(),
        allowed_roles.join("|")
    );
    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    // 短期去重：StrictMode 重复 invoke；或同一页面并行多条命令（如审批中心 Promise.all）失败时 detail 相同、target_id（命令名）不同——按 user_id+detail 合并为一条留痕
    let recent_dup: rusqlite::Result<i64> = conn.query_row(
        "SELECT COUNT(*) FROM logs WHERE user_id = ?1 AND action = 'permission_deny' \
         AND target_type = 'command' AND detail = ?2 \
         AND created_at > datetime('now', 'localtime', '-2 seconds')",
        params![audit_user, detail.as_str()],
        |r| r.get(0),
    );
    let skip_insert = matches!(recent_dup, Ok(n) if n > 0);
    if !skip_insert {
        let _ = log_audit_as(
            conn,
            audit_user,
            "permission_deny",
            "command",
            command,
            &detail,
        );
    }
    Err("无权限执行该操作".into())
}

#[derive(Debug, Serialize)]
pub struct ApprovalSummary {
    pub pending: i64,
    pub approved_total: i64,
    pub rejected_total: i64,
}

#[tauri::command]
pub fn get_approval_summary(user_role: String, user_id: String) -> Result<ApprovalSummary, String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Approver"],
        "get_approval_summary",
    )?;
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM records WHERE status = 'Pending'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let approved_total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM records WHERE status = 'Approved'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let rejected_total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM records WHERE status = 'Rejected'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ApprovalSummary {
        pending,
        approved_total,
        rejected_total,
    })
}

#[tauri::command]
pub fn list_pending_records(user_role: String, user_id: String) -> Result<Vec<Record>, String> {
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Approver"],
        "list_pending_records",
    )?;
    let mut stmt = conn
        .prepare(&format!(
            "{RECORD_SELECT_SQL} {RECORD_FROM} WHERE r.status = 'Pending' ORDER BY r.id DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_record).map_err(|e| e.to_string())?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| e.to_string())?);
    }
    Ok(records)
}

/// 草稿提交为待审批（校验与 `update_record` 一致，且要求正文非空）
#[tauri::command]
pub fn submit_record_for_approval(
    id: i64,
    user_role: String,
    user_id: String,
) -> Result<Record, String> {
    if id <= 0 {
        return Err("无效笔录 id".into());
    }
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "User", "Approver", "Auditor"],
        "submit_record_for_approval",
    )?;
    let rec = fetch_record(&conn, id).map_err(|e| e.to_string())?;
    if rec.status != "Draft" {
        return Err("仅草稿可提交审批".into());
    }
    if rec.record_type.trim().is_empty() {
        return Err("笔录类型不能为空".into());
    }
    if rec.criminal_id <= 0 {
        return Err("请选择服刑人员".into());
    }
    if rec.content.trim().is_empty() {
        return Err("正文不能为空，请填写后再提交审批".into());
    }
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM criminals WHERE id = ?1)",
            params![rec.criminal_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("服刑人员不存在或已删除".into());
    }

    let n = conn
        .execute(
            "UPDATE records SET status = 'Pending', reject_reason = '' WHERE id = ?1 AND status = 'Draft'",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("提交失败：记录已不是草稿".into());
    }
    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    let detail = format!("result=success;record_id={}", rec.record_id.trim());
    log_audit_as(
        &conn,
        audit_user,
        LOG_ACTION_SUBMIT_PENDING,
        "record",
        rec.record_id.as_str(),
        &detail,
    )
    .map_err(|e| e.to_string())?;
    fetch_record(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn approve_record(id: i64, user_role: String, user_id: String) -> Result<(), String> {
    if id <= 0 {
        return Err("无效笔录 id".into());
    }
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Approver"],
        "approve_record",
    )?;
    let record_id: String = conn
        .query_row(
            "SELECT COALESCE(record_id,'') FROM records WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|_| "笔录不存在".to_string())?;
    let n = conn
        .execute(
            "UPDATE records SET status = 'Approved', reject_reason = '', approver1_result = 'Approved'
             WHERE id = ?1 AND status = 'Pending'",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("仅待审批记录可通过".into());
    }
    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    let approve_detail = format!("result=success;record_id={}", record_id.trim());
    log_audit_as(
        &conn,
        audit_user,
        LOG_ACTION_APPROVE,
        "record",
        record_id.as_str(),
        &approve_detail,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reject_record(id: i64, reason: String, user_role: String, user_id: String) -> Result<(), String> {
    if id <= 0 {
        return Err("无效笔录 id".into());
    }
    let reason = reason.trim().to_string();
    if reason.is_empty() {
        return Err("驳回理由不能为空".into());
    }
    let conn = db_conn()?;
    ensure_role(
        &conn,
        &user_role,
        &user_id,
        &["Admin", "Approver"],
        "reject_record",
    )?;
    let record_id: String = conn
        .query_row(
            "SELECT COALESCE(record_id,'') FROM records WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|_| "笔录不存在".to_string())?;
    let n = conn
        .execute(
            "UPDATE records SET status = 'Rejected', reject_reason = ?2 WHERE id = ?1 AND status = 'Pending'",
            params![id, reason],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("仅待审批记录可驳回".into());
    }
    let audit_user = if user_id.trim().is_empty() {
        "unknown"
    } else {
        user_id.trim()
    };
    log_audit_as(
        &conn,
        audit_user,
        LOG_ACTION_REJECT,
        "record",
        record_id.as_str(),
        reason.as_str(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn map_record(row: &rusqlite::Row) -> rusqlite::Result<Record> {
    Ok(Record {
        id: row.get(0)?,
        record_id: row.get(1)?,
        record_type: row.get(2)?,
        criminal_id: row.get(3)?,
        criminal_name: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        record_date: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        record_location: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        interrogator_id: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        recorder_id: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        present_persons: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
        content: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
        content_encrypted: row.get::<_, i32>(11)? == 1,
        signed_interrogator: row.get::<_, i32>(12)? == 1,
        signed_recorder: row.get::<_, i32>(13)? == 1,
        signed_subject: row.get::<_, i32>(14)? == 1,
        status: row.get::<_, Option<String>>(15)?.unwrap_or_default(),
        approver1_id: row.get(16)?,
        approver2_id: row.get(17)?,
        approver1_result: row.get(18)?,
        approver2_result: row.get(19)?,
        reject_reason: row.get(20)?,
        case_id: row.get::<_, Option<i64>>(21)?,
        case_number: row.get::<_, Option<String>>(22)?.unwrap_or_default(),
        created_at: row.get::<_, Option<String>>(23)?.unwrap_or_default(),
    })
}

fn map_case_row(row: &rusqlite::Row) -> rusqlite::Result<Case> {
    Ok(Case {
        id: row.get(0)?,
        case_number: row.get(1)?,
        title: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        status: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        remark: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        created_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        updated_at: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
    })
}

#[tauri::command]
pub fn get_cases_by_page(
    page: i64,
    page_size: i64,
    search: String,
) -> Result<(Vec<Case>, i64), String> {
    let search = search.trim().to_string();
    with_db(|conn| {
        let offset = page * page_size;
        let total: i64 = if search.is_empty() {
            conn.query_row("SELECT COUNT(*) FROM cases", [], |r| r.get(0))?
        } else {
            let pat = format!("%{}%", search);
            conn.query_row(
                "SELECT COUNT(*) FROM cases WHERE case_number LIKE ?1 OR title LIKE ?1 OR COALESCE(remark,'') LIKE ?1",
                params![pat],
                |r| r.get(0),
            )?
        };

        let mut cases = Vec::new();
        if search.is_empty() {
            let mut stmt = conn.prepare(
                "SELECT id, case_number, COALESCE(title,'') as title, COALESCE(status,'') as status,
                        COALESCE(remark,'') as remark,
                        COALESCE(created_at,'') as created_at, COALESCE(updated_at,'') as updated_at
                 FROM cases ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![page_size, offset], map_case_row)?;
            for row in rows {
                cases.push(row?);
            }
        } else {
            let pat = format!("%{}%", search);
            let mut stmt = conn.prepare(
                "SELECT id, case_number, COALESCE(title,'') as title, COALESCE(status,'') as status,
                        COALESCE(remark,'') as remark,
                        COALESCE(created_at,'') as created_at, COALESCE(updated_at,'') as updated_at
                 FROM cases
                 WHERE case_number LIKE ?3 OR title LIKE ?3 OR COALESCE(remark,'') LIKE ?3
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![page_size, offset, pat], map_case_row)?;
            for row in rows {
                cases.push(row?);
            }
        }

        Ok((cases, total))
    })
}

#[tauri::command]
pub fn get_case_by_id(id: i64) -> Result<Case, String> {
    if id <= 0 {
        return Err("无效案件 id".into());
    }
    let conn = db_conn()?;
    conn.query_row(
        "SELECT id, case_number, COALESCE(title,'') as title, COALESCE(status,'') as status,
                COALESCE(remark,'') as remark,
                COALESCE(created_at,'') as created_at, COALESCE(updated_at,'') as updated_at
         FROM cases WHERE id = ?1",
        params![id],
        map_case_row,
    )
    .map_err(|_| "案件不存在".into())
}

#[tauri::command]
pub fn add_case(input: CaseInput) -> Result<Case, String> {
    let num = input.case_number.trim().to_string();
    if num.is_empty() {
        return Err("案号不能为空".into());
    }
    let title = input.title.trim().to_string();
    let status = if input.status.trim().is_empty() {
        "open".to_string()
    } else {
        input.status.trim().to_string()
    };
    let remark = input.remark.trim().to_string();

    let conn = db_conn()?;
    conn.execute(
        "INSERT INTO cases (case_number, title, status, remark)
         VALUES (?1, ?2, ?3, ?4)",
        params![num, title, status, remark],
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "案号已存在".into()
        } else {
            msg
        }
    })?;

    let new_id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, case_number, COALESCE(title,'') as title, COALESCE(status,'') as status,
                COALESCE(remark,'') as remark,
                COALESCE(created_at,'') as created_at, COALESCE(updated_at,'') as updated_at
         FROM cases WHERE id = ?1",
        params![new_id],
        map_case_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_case(c: Case) -> Result<(), String> {
    if c.id <= 0 {
        return Err("无效案件 id".into());
    }
    let num = c.case_number.trim().to_string();
    if num.is_empty() {
        return Err("案号不能为空".into());
    }
    let conn = db_conn()?;
    let n = conn
        .execute(
            "UPDATE cases SET case_number=?2, title=?3, status=?4, remark=?5,
                updated_at=datetime('now', 'localtime')
             WHERE id=?1",
            params![c.id, num, c.title.trim(), c.status.trim(), c.remark.trim()],
        )
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("UNIQUE") {
                "案号已存在".into()
            } else {
                msg
            }
        })?;
    if n == 0 {
        return Err("案件不存在".into());
    }
    Ok(())
}

#[tauri::command]
pub fn list_records_by_case(case_id: i64) -> Result<Vec<Record>, String> {
    if case_id <= 0 {
        return Err("无效案件 id".into());
    }
    with_db(|conn| {
        let mut stmt = conn.prepare(&format!(
            "{RECORD_SELECT_SQL} {RECORD_FROM} WHERE r.case_id = ?1 ORDER BY r.id DESC"
        ))?;
        let rows = stmt.query_map(params![case_id], map_record)?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    })
}

#[tauri::command]
pub fn get_recent_records(limit: i64) -> Result<Vec<Record>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(&format!(
            "{RECORD_SELECT_SQL} {RECORD_FROM} ORDER BY r.id DESC LIMIT ?1",
        ))?;
        let rows = stmt.query_map(params![limit], map_record)?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    })
}

#[tauri::command]
pub fn get_dashboard_stats() -> Result<DashboardStats, String> {
    with_db(|conn| {
        let today = chrono_date();
        let month_start = format!("{}-01", &today[..7]);

        let today_records: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE date(created_at) = ?1",
                params![today],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let yesterday_records: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE date(created_at) = date('now', '-1 day')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let pending_approvals: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE status='Pending'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let total_criminals: i64 = conn
            .query_row("SELECT COUNT(*) FROM criminals WHERE archived=0", [], |r| {
                r.get(0)
            })
            .unwrap_or(0);

        // CasesPage 持久化值为 open / closed（界面映射为进行中/已结案）；兼容历史写入中文「已结案」
        let (total_cases, closed_cases): (i64, i64) = conn
            .query_row(
                "SELECT
                    COUNT(*) AS total_cnt,
                    SUM(CASE
                      WHEN lower(trim(COALESCE(status, ''))) = 'closed'
                        OR trim(COALESCE(status, '')) = '已结案'
                      THEN 1 ELSE 0 END) AS closed_cnt
                 FROM cases",
                [],
                |r| {
                    Ok((
                        r.get::<_, Option<i64>>(0)?.unwrap_or(0),
                        r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    ))
                },
            )
            .unwrap_or((0, 0));
        let active_cases = (total_cases - closed_cases).max(0);

        let month_new_criminals: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM criminals WHERE date(created_at) >= ?1",
                params![month_start],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let month_new_cases: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM cases WHERE date(created_at) >= ?1",
                params![month_start],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let month_records: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE date(created_at) >= ?1",
                params![month_start],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let expired_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE status='Pending' AND date(created_at) < date('now', '-3 days')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // 与 LOG_ACTION_APPROVE / LOG_ACTION_REJECT 一致；兼容历史错误写法 approve_record / reject_record
        let (month_approved, month_rejected): (i64, i64) = conn
            .query_row(
                "SELECT
                    SUM(CASE WHEN action IN ('record_approve', 'approve_record') THEN 1 ELSE 0 END) AS approved_cnt,
                    SUM(CASE WHEN action IN ('record_reject', 'reject_record') THEN 1 ELSE 0 END) AS rejected_cnt
                 FROM logs
                 WHERE action IN ('record_approve', 'approve_record', 'record_reject', 'reject_record')
                   AND date(created_at) >= ?1",
                params![month_start],
                |r| Ok((r.get::<_, Option<i64>>(0)?.unwrap_or(0), r.get::<_, Option<i64>>(1)?.unwrap_or(0))),
            )
            .unwrap_or((0, 0));
        let month_decisions = month_approved + month_rejected;
        let approval_rate = if month_decisions > 0 {
            (month_approved as f64 / month_decisions as f64) * 100.0
        } else {
            0.0
        };

        // 与 LOG_ACTION_SUBMIT_PENDING 一致；兼容历史 submit_record_for_approval
        let avg_approval_hours: f64 = conn
            .query_row(
                "WITH submit_logs AS (
                    SELECT target_id, MIN(created_at) AS submit_at
                    FROM logs
                    WHERE action IN ('record_submit_pending', 'submit_record_for_approval')
                    GROUP BY target_id
                 ),
                 decision_logs AS (
                    SELECT target_id, MIN(created_at) AS decision_at
                    FROM logs
                    WHERE action IN ('record_approve', 'approve_record', 'record_reject', 'reject_record')
                      AND date(created_at) >= ?1
                    GROUP BY target_id
                 )
                 SELECT COALESCE(AVG((julianday(d.decision_at) - julianday(s.submit_at)) * 24.0), 0.0)
                 FROM decision_logs d
                 JOIN submit_logs s ON s.target_id = d.target_id
                 WHERE julianday(d.decision_at) >= julianday(s.submit_at)",
                params![month_start],
                |r| r.get::<_, Option<f64>>(0),
            )
            .unwrap_or(Some(0.0))
            .unwrap_or(0.0);

        let (archived_criminals, all_criminals): (i64, i64) = conn
            .query_row(
                "SELECT
                    SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived_cnt,
                    COUNT(*) AS total_cnt
                 FROM criminals",
                [],
                |r| Ok((r.get::<_, Option<i64>>(0)?.unwrap_or(0), r.get::<_, Option<i64>>(1)?.unwrap_or(0))),
            )
            .unwrap_or((0, 0));
        let archive_rate = if all_criminals > 0 {
            (archived_criminals as f64 / all_criminals as f64) * 100.0
        } else {
            0.0
        };

        let mut monthly_trends = Vec::new();
        let mut trend_stmt = conn
            .prepare(
                "WITH RECURSIVE months(idx, month_start) AS (
                    SELECT 0, date(?1, 'start of month', '-5 months')
                    UNION ALL
                    SELECT idx + 1, date(month_start, '+1 month')
                    FROM months
                    WHERE idx < 5
                 )
                 SELECT
                    strftime('%Y-%m', m.month_start) AS ym,
                    (
                      SELECT COUNT(*) FROM records r
                      WHERE date(r.created_at) >= m.month_start
                        AND date(r.created_at) < date(m.month_start, '+1 month')
                    ) AS records_cnt,
                    (
                      SELECT COUNT(*) FROM criminals c
                      WHERE date(c.created_at) >= m.month_start
                        AND date(c.created_at) < date(m.month_start, '+1 month')
                    ) AS criminals_cnt
                 FROM months m
                 ORDER BY m.month_start",
            )?;
        let trend_rows = trend_stmt
            .query_map(params![today], |row| {
                Ok(MonthlyTrendItem {
                    month: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    records: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    criminals: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                })
            })?;
        for row in trend_rows {
            monthly_trends.push(row?);
        }

        let mut crime_distribution = Vec::new();
        let total_crime_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM criminals WHERE TRIM(COALESCE(crime, '')) <> ''",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let mut crime_stmt = conn
            .prepare(
                "SELECT
                    CASE
                      WHEN TRIM(COALESCE(crime, '')) = '' THEN '其他'
                      ELSE TRIM(crime)
                    END AS crime_label,
                    COUNT(*) AS cnt
                 FROM criminals
                 GROUP BY crime_label
                 ORDER BY cnt DESC
                 LIMIT 6",
            )?;
        let crime_rows = crime_stmt
            .query_map([], |row| {
                let count = row.get::<_, Option<i64>>(1)?.unwrap_or(0);
                let percent = if total_crime_count > 0 {
                    (count as f64 / total_crime_count as f64) * 100.0
                } else {
                    0.0
                };
                Ok(CrimeDistributionItem {
                    label: row.get::<_, Option<String>>(0)?.unwrap_or_else(|| "其他".to_string()),
                    count,
                    percent,
                })
            })?;
        for row in crime_rows {
            crime_distribution.push(row?);
        }

        Ok(DashboardStats {
            today_records,
            pending_approvals,
            total_criminals,
            total_cases,
            closed_cases,
            active_cases,
            yesterday_delta: today_records - yesterday_records,
            expired_count,
            month_new_criminals,
            month_new_cases,
            month_records,
            approval_rate,
            avg_approval_hours,
            archive_rate,
            monthly_trends,
            crime_distribution,
        })
    })
}

fn chrono_date() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let secs = now.as_secs();
    let mut remaining = secs / 86400;
    let mut year: u64 = 1970;
    loop {
        let days_in_year: u64 = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
            366
        } else {
            365
        };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        year += 1;
    }
    let month_days: &[u64] = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
        &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month: usize = 0;
    let mut day = remaining;
    while month < 12 && day >= month_days[month] {
        day -= month_days[month];
        month += 1;
    }
    format!("{:04}-{:02}-{:02}", year, month + 1, day + 1)
}

fn ensure_criminal_uniqueness(
    conn: &Connection,
    criminal_id: &str,
    id_card_number: &str,
    exclude_id: Option<i64>,
) -> Result<(), String> {
    let criminal_dup: i64 = if let Some(ex_id) = exclude_id {
        conn.query_row(
            "SELECT COUNT(*) FROM criminals WHERE id <> ?1 AND criminal_id = ?2",
            params![ex_id, criminal_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM criminals WHERE criminal_id = ?1",
            params![criminal_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?
    };
    if criminal_dup > 0 {
        return Err("编号已存在，请使用其他编号".into());
    }

    if !id_card_number.trim().is_empty() {
        let id_card_dup: i64 = if let Some(ex_id) = exclude_id {
            conn.query_row(
                "SELECT COUNT(*) FROM criminals WHERE id <> ?1 AND TRIM(COALESCE(id_card_number,'')) = ?2",
                params![ex_id, id_card_number],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM criminals WHERE TRIM(COALESCE(id_card_number,'')) = ?1",
                params![id_card_number],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?
        };
        if id_card_dup > 0 {
            return Err("身份证号已存在，请核对后重试".into());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn add_criminal(c: CriminalCreateInput) -> Result<i64, String> {
    let criminal_id = c.criminal_id.trim().to_string();
    let name = c.name.trim().to_string();
    let id_card_number = c.id_card_number.trim().to_string();
    if criminal_id.is_empty() || name.is_empty() {
        return Err("编号和姓名不能为空".into());
    }
    let conn = db_conn()?;
    ensure_criminal_uniqueness(&conn, &criminal_id, &id_card_number, None)?;
    conn.execute(
        "INSERT INTO criminals (criminal_id, name, gender, ethnicity, birth_date,
                                id_card_number, native_place, education, crime,
                                sentence_years, sentence_months, entry_date,
                                original_court, district, cell, crime_type,
                                manage_level, handler_id, photo_path, remark,
                                archived, case_number, custody_date,
                                custody_location, bed_number, contact_phone)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)",
        params![
            criminal_id, name, c.gender, c.ethnicity, c.birth_date,
            id_card_number, c.native_place, c.education, c.crime,
            c.sentence_years, c.sentence_months, c.entry_date,
            c.original_court, c.district, c.cell, c.crime_type,
            c.manage_level, c.handler_id, c.photo_path, c.remark,
            c.archived as i32, c.case_number, c.custody_date,
            c.custody_location, c.bed_number, c.contact_phone,
        ],
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "编号或身份证号已存在".to_string()
        } else {
            msg
        }
    })?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_criminal(c: Criminal) -> Result<(), String> {
    let criminal_id = c.criminal_id.trim().to_string();
    let name = c.name.trim().to_string();
    let id_card_number = c.id_card_number.trim().to_string();
    if c.id <= 0 {
        return Err("无效服刑人员 id".into());
    }
    if criminal_id.is_empty() || name.is_empty() {
        return Err("编号和姓名不能为空".into());
    }
    let conn = db_conn()?;
    ensure_criminal_uniqueness(&conn, &criminal_id, &id_card_number, Some(c.id))?;
    conn.execute(
        "UPDATE criminals SET criminal_id=?2, name=?3, gender=?4, ethnicity=?5, birth_date=?6,
                              id_card_number=?7, native_place=?8, education=?9,
                              crime=?10, sentence_years=?11, sentence_months=?12,
                              entry_date=?13, original_court=?14, district=?15,
                              cell=?16, crime_type=?17, manage_level=?18,
                              handler_id=?19, photo_path=?20, remark=?21,
                              archived=?22, case_number=?23, custody_date=?24,
                              custody_location=?25, bed_number=?26, contact_phone=?27
         WHERE id=?1",
        params![
            c.id, criminal_id, name, c.gender, c.ethnicity, c.birth_date,
            id_card_number, c.native_place, c.education, c.crime,
            c.sentence_years, c.sentence_months, c.entry_date,
            c.original_court, c.district, c.cell, c.crime_type,
            c.manage_level, c.handler_id, c.photo_path, c.remark,
            c.archived as i32, c.case_number, c.custody_date,
            c.custody_location, c.bed_number, c.contact_phone,
        ],
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") {
            "编号或身份证号已存在".to_string()
        } else {
            msg
        }
    })?;
    Ok(())
}
