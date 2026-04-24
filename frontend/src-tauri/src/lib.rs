mod db;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── 初始化数据库 ─────────────────────────────────────
            // 获取数据库路径（优先从环境变量 / 命令行参数读取，否则用默认路径）
            let db_path = std::env::var("PRISONSIS_DB")
                .or_else(|_| {
                    // 默认路径：与 Qt app 同一目录的 prisoners.db
                    let app_dir = app
                        .path()
                        .app_data_dir()
                        .unwrap_or_else(|_| PathBuf::from("."));
                    app_dir.join("prisoners.db")
                })
                .unwrap_or_else(|_| PathBuf::from("prisoners.db"));

            // 确保目录存在
            if let Some(parent) = db_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            log::info!("[PrisonSIS] 数据库路径: {:?}", db_path);

            match db::init(db_path.to_str().unwrap_or("prisoners.db")) {
                Ok(_) => {
                    log::info!("[PrisonSIS] 数据库初始化成功");
                }
                Err(e) => {
                    log::error!("[PrisonSIS] 数据库初始化失败: {}", e);
                }
            }

            // ── 初始化日志（debug 模式）────────────────────────
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 认证
            db::login,
            // 罪犯管理
            db::get_criminals,
            db::get_criminals_by_page,
            db::add_criminal,
            db::update_criminal,
            // 笔录管理
            db::get_records,
            db::get_recent_records,
            // 仪表盘
            db::get_dashboard_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
