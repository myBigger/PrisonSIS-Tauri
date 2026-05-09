// lib.rs — PrisonSIS Tauri 应用入口
mod db;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── 数据库初始化 ─────────────────────────────────────
            let db_path: PathBuf = std::env::var("PRISONSIS_DB")
                .map(PathBuf::from)
                .unwrap_or_else(|_| {
                    app.path()
                        .app_data_dir()
                        .unwrap_or_else(|_| PathBuf::from("."))
                        .join("prisonsis.db")
                });

            // 确保目录存在
            if let Some(parent) = db_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            log::info!("[PrisonSIS] 数据库路径: {:?}", db_path);

            let db_path_str = db_path.to_string_lossy().into_owned();
            match db::init(&db_path_str) {
                Ok(_) => {
                    log::info!("[PrisonSIS] 数据库初始化成功");
                }
                Err(e) => {
                    log::error!("[PrisonSIS] 数据库初始化失败: {}", e);
                }
            }

            // ── 日志插件初始化（debug 模式）─────────────────────
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_dialog::init())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 认证
            db::login,
            // 服刑人员管理
            db::get_criminals,
            db::get_criminals_by_page,
            db::add_criminal,
            db::update_criminal,
            db::get_archive_criminals_by_page,
            db::archive_criminal,
            db::unarchive_criminal,
            // 案件管理（阶段 3）
            db::get_cases_by_page,
            db::get_case_by_id,
            db::add_case,
            db::update_case,
            db::list_records_by_case,
            // 笔录管理
            db::get_records,
            db::get_record_by_id,
            db::add_record,
            db::update_record,
            db::submit_record_for_approval,
            db::list_pending_records,
            db::approve_record,
            db::reject_record,
            db::get_approval_summary,
            db::get_templates,
            db::get_templates_by_page,
            db::get_template_by_id,
            db::add_template,
            db::update_template,
            db::disable_template,
            db::export_records_count,
            db::export_records_csv,
            db::get_logs_by_page,
            db::export_logs_csv,
            db::clear_logs,
            db::suggest_next_user_id,
            db::get_users_by_page,
            db::add_user,
            db::update_user,
            db::soft_delete_user,
            db::restore_soft_deleted_user,
            db::set_user_enabled,
            db::reset_password_admin,
            db::change_own_password,
            db::export_database_backup,
            db::restore_database_backup,
            db::get_recent_records,
            // 仪表盘
            db::get_dashboard_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
