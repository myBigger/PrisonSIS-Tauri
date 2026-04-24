// db.rs — PrisonSIS 数据库层
// 直接对接现有 SQLite 数据库（与 Qt 共享同一文件）
use md5::Digest as Md5Digest;
use once_cell::sync::OnceCell;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::ser::Serialize as SerSerialize;
use serde::de::Deserialize as DeDeserialize;
use serde::Serialize;
use std::io::Write;

static DB: OnceCell<Connection> = OnceCell::new();

// ── 数据库初始化 ──────────────────────────────────────────
pub fn init(db_path: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
    DB.set(conn).ok();
    log::info!("[DB] SQLite 连接已建立: {}", db_path);
    Ok(())
}

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> SqlResult<T>,
{
    let conn = DB.get().ok_or("数据库未初始化")?;
    f(conn).map_err(|e| e.to_string())
}

// ── 密码验证（复刻 Qt PasswordHasher.cpp）────────────────
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
            let mut inner = sha2::Sha256::new();
            inner.update(&hmac_inner);
            inner.update(&block);
            inner.finalize()
        };
        let mut result_block = u.to_vec();
        for _ in 1..iterations {
            let mut inner = sha2::Sha256::new();
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
#[derive(Debug, Serialize, DeDeserialize, SerSerialize)]
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

#[derive(Debug, Serialize, DeDeserialize, SerSerialize)]
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

#[derive(Debug, Serialize, DeDeserialize, SerSerialize)]
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
    pub created_at: String,
}

#[derive(Debug, Serialize, DeDeserialize, SerSerialize)]
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
             FROM criminals ORDER BY id DESC LIMIT 200"
        )?;
        let rows = stmt.query_map([], map_criminal)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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

        let rows = if search.is_empty() {
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
                 FROM criminals ORDER BY id DESC LIMIT ?1 OFFSET ?2"
            )?;
            stmt.query_map(params![page_size, offset], map_criminal)?
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
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2"
            )?;
            stmt.query_map(
                params![page_size, offset, format!("%{}%", search)],
                map_criminal,
            )?
        };

        let criminals: Vec<Criminal> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok((criminals, total))
    })
}

#[tauri::command]
pub fn get_records(
    page: i64,
    page_size: i64,
    search: String,
) -> Result<(Vec<Record>, i64), String> {
    with_db(|conn| {
        let total: i64 = if search.is_empty() {
            conn.query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0))?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM records WHERE record_id LIKE ?1 OR criminal_name LIKE ?1",
                params![format!("%{}%", search)],
                |r| r.get(0),
            )?
        };

        let offset = page * page_size;

        let rows = if search.is_empty() {
            let mut stmt = conn.prepare(
                "SELECT id, record_id, record_type, criminal_id, criminal_name,
                        record_date, record_location, interrogator_id, recorder_id,
                        present_persons, content, content_encrypted,
                        signed_interrogator, signed_recorder, signed_subject,
                        status,
                        COALESCE(approver1_id,'') as approver1_id,
                        COALESCE(approver2_id,'') as approver2_id,
                        COALESCE(approver1_result,'') as approver1_result,
                        COALESCE(approver2_result,'') as approver2_result,
                        COALESCE(reject_reason,'') as reject_reason, created_at
                 FROM records ORDER BY id DESC LIMIT ?1 OFFSET ?2"
            )?;
            stmt.query_map(params![page_size, offset], map_record)?
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, record_id, record_type, criminal_id, criminal_name,
                        record_date, record_location, interrogator_id, recorder_id,
                        present_persons, content, content_encrypted,
                        signed_interrogator, signed_recorder, signed_subject,
                        status,
                        COALESCE(approver1_id,'') as approver1_id,
                        COALESCE(approver2_id,'') as approver2_id,
                        COALESCE(approver1_result,'') as approver1_result,
                        COALESCE(approver2_result,'') as approver2_result,
                        COALESCE(reject_reason,'') as reject_reason, created_at
                 FROM records
                 WHERE record_id LIKE ?3 OR criminal_name LIKE ?3
                 ORDER BY id DESC LIMIT ?1 OFFSET ?2"
            )?;
            stmt.query_map(
                params![page_size, offset, format!("%{}%", search)],
                map_record,
            )?
        };

        let records: Vec<Record> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok((records, total))
    })
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
        created_at: row.get::<_, Option<String>>(21)?.unwrap_or_default(),
    })
}

#[tauri::command]
pub fn get_recent_records(limit: i64) -> Result<Vec<Record>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, record_id, record_type, criminal_id, criminal_name,
                    record_date, record_location, interrogator_id, recorder_id,
                    present_persons, content, content_encrypted,
                    signed_interrogator, signed_recorder, signed_subject,
                    status,
                    COALESCE(approver1_id,'') as approver1_id,
                    COALESCE(approver2_id,'') as approver2_id,
                    COALESCE(approver1_result,'') as approver1_result,
                    COALESCE(approver2_result,'') as approver2_result,
                    COALESCE(reject_reason,'') as reject_reason, created_at
             FROM records ORDER BY id DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], map_record)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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
            .query_row(
                "SELECT COUNT(*) FROM criminals WHERE archived=0",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let total_cases: i64 = conn
            .query_row("SELECT COUNT(*) FROM records", [], |r| r.get(0))
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
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();
    let secs = now.as_secs();
    let mut remaining = secs / 86400;
    let mut year: u64 = 1970;
    loop {
        let days_in_year: u64 = if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) { 366 } else { 365 };
        if remaining < days_in_year { break; }
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
