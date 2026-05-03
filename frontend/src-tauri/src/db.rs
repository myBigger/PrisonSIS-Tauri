// db.rs — PrisonSIS 数据库层
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::sync::Mutex;

static DB_PATH: Mutex<Option<String>> = Mutex::new(None);

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
    pub yesterday_delta: i64,
    pub expired_count: i64,
    pub month_new_criminals: i64,
    pub month_new_cases: i64,
}

/// 笔录正文模板（与 `templates` 表一致）
#[derive(Debug, Serialize, Deserialize)]
pub struct Template {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub content: String,
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
}

#[derive(Debug, Deserialize)]
pub struct ExportRecordFilter {
    #[serde(default)]
    pub keyword: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub file_path: String,
    pub exported_count: i64,
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
             FROM users WHERE username=?1 AND enabled=1",
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
) -> Result<(Vec<Criminal>, i64), String> {
    with_db(|conn| {
        let total: i64 = if search.is_empty() {
            conn.query_row("SELECT COUNT(*) FROM criminals", [], |r| r.get(0))?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM criminals WHERE name LIKE ?1 OR criminal_id LIKE ?1 OR crime LIKE ?1",
                params![format!("%{}%", search)],
                |r| r.get(0),
            )?
        };

        let offset = page * page_size;

        let mut criminals = Vec::new();

        if search.is_empty() {
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
                 FROM criminals ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![page_size, offset], map_criminal)?;
            for row in rows {
                criminals.push(row?);
            }
        } else {
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
                 WHERE name LIKE ?3 OR criminal_id LIKE ?3 OR crime LIKE ?3
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(
                params![page_size, offset, format!("%{}%", search)],
                map_criminal,
            )?;
            for row in rows {
                criminals.push(row?);
            }
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
    Ok(Template {
        id: row.get(0)?,
        name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        category: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        content: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        created_at: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        deleted_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
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
                     WHERE name LIKE ?1 OR category LIKE ?1 OR content LIKE ?1",
                    params![pat],
                    |r| r.get(0),
                )?
            } else {
                conn.query_row("SELECT COUNT(*) FROM templates", [], |r| r.get(0))?
            }
        } else if has_search {
            conn.query_row(
                "SELECT COUNT(*) FROM templates
                 WHERE deleted_at IS NULL AND (name LIKE ?1 OR category LIKE ?1 OR content LIKE ?1)",
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
                            COALESCE(created_at,''), COALESCE(deleted_at,'')
                     FROM templates
                     WHERE name LIKE ?3 OR category LIKE ?3 OR content LIKE ?3
                     ORDER BY id DESC LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt.query_map(params![page_size, offset, pat], map_template_row)?;
                for row in rows {
                    templates.push(row?);
                }
            } else {
                let mut stmt = conn.prepare(
                    "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
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
                        COALESCE(created_at,''), COALESCE(deleted_at,'')
                 FROM templates
                 WHERE deleted_at IS NULL AND (name LIKE ?3 OR category LIKE ?3 OR content LIKE ?3)
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = stmt.query_map(params![page_size, offset, pat], map_template_row)?;
            for row in rows {
                templates.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, name, COALESCE(category,''), COALESCE(content,''),
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
    let conn = db_conn()?;
    conn.execute(
        "INSERT INTO templates (name, category, content, created_by, created_at, deleted_at)
         VALUES (?1, ?2, ?3, 'system', datetime('now', 'localtime'), NULL)",
        params![name, input.category.trim(), input.content],
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
    with_db(|conn| {
        let n = conn.execute(
            "UPDATE templates
             SET name = ?2, category = ?3, content = ?4
             WHERE id = ?1",
            params![t.id, t.name.trim(), t.category.trim(), t.content],
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

#[tauri::command]
pub fn export_records_csv(filter: ExportRecordFilter, file_path: String) -> Result<ExportResult, String> {
    let file_path = file_path.trim().to_string();
    if file_path.is_empty() {
        return Err("导出路径不能为空".into());
    }
    let keyword = filter.keyword.trim().to_string();
    let status = filter.status.trim().to_string();
    let has_keyword = !keyword.is_empty();
    let has_status = !status.is_empty();
    let rows_data: Vec<Vec<String>> = with_db(|conn| {
        let mut rows_data: Vec<Vec<String>> = Vec::new();
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

        match (has_keyword, has_status) {
            (false, false) => {
                let mut stmt = conn.prepare(&format!("{base_select} ORDER BY r.id DESC"))?;
                let rows = stmt.query_map([], |row| {
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
                })?;
                for row in rows {
                    rows_data.push(row?);
                }
            }
            (false, true) => {
                let mut stmt = conn.prepare(&format!("{base_select} WHERE r.status = ?1 ORDER BY r.id DESC"))?;
                let rows = stmt.query_map(params![status], |row| {
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
                })?;
                for row in rows {
                    rows_data.push(row?);
                }
            }
            (true, false) => {
                let pat = format!("%{}%", keyword);
                let mut stmt = conn.prepare(
                    &format!("{base_select} WHERE r.record_id LIKE ?1 OR r.criminal_name LIKE ?1 OR COALESCE(c.case_number,'') LIKE ?1 ORDER BY r.id DESC"),
                )?;
                let rows = stmt.query_map(params![pat], |row| {
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
                })?;
                for row in rows {
                    rows_data.push(row?);
                }
            }
            (true, true) => {
                let pat = format!("%{}%", keyword);
                let mut stmt = conn.prepare(
                    &format!("{base_select} WHERE r.status = ?1 AND (r.record_id LIKE ?2 OR r.criminal_name LIKE ?2 OR COALESCE(c.case_number,'') LIKE ?2) ORDER BY r.id DESC"),
                )?;
                let rows = stmt.query_map(params![status, pat], |row| {
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
                })?;
                for row in rows {
                    rows_data.push(row?);
                }
            }
        }
        Ok(rows_data)
    })?;

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

    Ok(ExportResult {
        file_path,
        exported_count: rows_data.len() as i64,
    })
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

fn log_audit(
    conn: &Connection,
    action: &str,
    target_type: &str,
    target_id: &str,
    detail: &str,
) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO logs (user_id, action, target_type, target_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["system", action, target_type, target_id, detail],
    )?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct ApprovalSummary {
    pub pending: i64,
    pub approved_total: i64,
    pub rejected_total: i64,
}

#[tauri::command]
pub fn get_approval_summary() -> Result<ApprovalSummary, String> {
    let conn = db_conn()?;
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
pub fn list_pending_records() -> Result<Vec<Record>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(&format!(
            "{RECORD_SELECT_SQL} {RECORD_FROM} WHERE r.status = 'Pending' ORDER BY r.id DESC"
        ))?;
        let rows = stmt.query_map([], map_record)?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    })
}

/// 草稿提交为待审批（校验与 `update_record` 一致，且要求正文非空）
#[tauri::command]
pub fn submit_record_for_approval(id: i64) -> Result<Record, String> {
    if id <= 0 {
        return Err("无效笔录 id".into());
    }
    let conn = db_conn()?;
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
    log_audit(
        &conn,
        LOG_ACTION_SUBMIT_PENDING,
        "record",
        rec.record_id.as_str(),
        "",
    )
    .map_err(|e| e.to_string())?;
    fetch_record(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn approve_record(id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("无效笔录 id".into());
    }
    let conn = db_conn()?;
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
    log_audit(
        &conn,
        LOG_ACTION_APPROVE,
        "record",
        record_id.as_str(),
        "",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reject_record(id: i64, reason: String) -> Result<(), String> {
    if id <= 0 {
        return Err("无效笔录 id".into());
    }
    let reason = reason.trim().to_string();
    if reason.is_empty() {
        return Err("驳回理由不能为空".into());
    }
    let conn = db_conn()?;
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
    log_audit(
        &conn,
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

        let total_cases: i64 = conn
            .query_row("SELECT COUNT(*) FROM cases", [], |r| r.get(0))
            .unwrap_or(0);

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

        let expired_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE status='Pending' AND date(created_at) < date('now', '-3 days')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        Ok(DashboardStats {
            today_records,
            pending_approvals,
            total_criminals,
            total_cases,
            yesterday_delta: today_records - yesterday_records,
            expired_count,
            month_new_criminals,
            month_new_cases,
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

#[tauri::command]
pub fn add_criminal(c: Criminal) -> Result<i64, String> {
    with_db(|conn| {
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
                c.criminal_id, c.name, c.gender, c.ethnicity, c.birth_date,
                c.id_card_number, c.native_place, c.education, c.crime,
                c.sentence_years, c.sentence_months, c.entry_date,
                c.original_court, c.district, c.cell, c.crime_type,
                c.manage_level, c.handler_id, c.photo_path, c.remark,
                c.archived as i32, c.case_number, c.custody_date,
                c.custody_location, c.bed_number, c.contact_phone,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    })
}

#[tauri::command]
pub fn update_criminal(c: Criminal) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "UPDATE criminals SET name=?2, gender=?3, ethnicity=?4, birth_date=?5,
                                  id_card_number=?6, native_place=?7, education=?8,
                                  crime=?9, sentence_years=?10, sentence_months=?11,
                                  entry_date=?12, original_court=?13, district=?14,
                                  cell=?15, crime_type=?16, manage_level=?17,
                                  handler_id=?18, photo_path=?19, remark=?20,
                                  archived=?21, case_number=?22, custody_date=?23,
                                  custody_location=?24, bed_number=?25, contact_phone=?26
             WHERE id=?1",
            params![
                c.id, c.name, c.gender, c.ethnicity, c.birth_date,
                c.id_card_number, c.native_place, c.education, c.crime,
                c.sentence_years, c.sentence_months, c.entry_date,
                c.original_court, c.district, c.cell, c.crime_type,
                c.manage_level, c.handler_id, c.photo_path, c.remark,
                c.archived as i32, c.case_number, c.custody_date,
                c.custody_location, c.bed_number, c.contact_phone,
            ],
        )?;
        Ok(())
    })
}
