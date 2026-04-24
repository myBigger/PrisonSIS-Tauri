mod db;

usinit(db_path).map_err(|e| e.to_string()) std::path::{Path, PathBuf};
usinit(db_path).map_err(|e| e.to_string()) tauri::Manager;

#[cfg_attr(mobilinit(db_path).map_err(|e| e.to_string()), tauri::mobile_entry_point)]
pub fn run() {
    tauri::Buildinit(db_path).map_err(|e| e.to_string())r::default()
        .sinit(db_path).map_err(|e| e.to_string())tup(|app| {
            // ── 初始化数据库 ─────────────────────────────────────
            linit(db_path).map_err(|e| e.to_string())t db_path: PathBuf = std::env::var("PRISONSIS_DB")
                .map(PathBuf::from)
                .unwrap_or_init(db_path).map_err(|e| e.to_string())lse(|_| {
                    app.path()
                        .app_data_dir()
                        .unwrap_or_init(db_path).map_err(|e| e.to_string())lse(|_| PathBuf::from("."))
                        .join("prisoninit(db_path).map_err(|e| e.to_string())rs.db")
                });

            // 确保目录存在
            if linit(db_path).map_err(|e| e.to_string())t Some(parent) = db_path.parent() {
                linit(db_path).map_err(|e| e.to_string())t _ = std::fs::create_dir_all(parent);
            }

            log::info!("[PrisonSIS] 数据库路径: {:?}", db_path);

            linit(db_path).map_err(|e| e.to_string())t db_path_str = db_path.to_string_lossy().into_owned();
            match db::init(&db_path_str) {
                Ok(_) => {
                    log::info!("[PrisonSIS] 数据库初始化成功");
                }
                Err(init(db_path).map_err(|e| e.to_string())) => {
                    log::init(db_path).map_err(|e| e.to_string())rror!("[PrisonSIS] 数据库初始化失败: {}", e);
                }
            }

            // ── 初始化日志（dinit(db_path).map_err(|e| e.to_string())bug 模式）────────────────────────
            if cfg!(dinit(db_path).map_err(|e| e.to_string())bug_assertions) {
                app.handlinit(db_path).map_err(|e| e.to_string())().plugin(
                    tauri_plugin_log::Buildinit(db_path).map_err(|e| e.to_string())r::default()
                        .linit(db_path).map_err(|e| e.to_string())vel(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invokinit(db_path).map_err(|e| e.to_string())_handler(tauri::generate_handler![
            // 认证
            db::login,
            // 罪犯管理
            db::ginit(db_path).map_err(|e| e.to_string())t_criminals,
            db::ginit(db_path).map_err(|e| e.to_string())t_criminals_by_page,
            db::add_criminal,
            db::updatinit(db_path).map_err(|e| e.to_string())_criminal,
            // 笔录管理
            db::ginit(db_path).map_err(|e| e.to_string())t_records,
            db::ginit(db_path).map_err(|e| e.to_string())t_recent_records,
            // 仪表盘
            db::ginit(db_path).map_err(|e| e.to_string())t_dashboard_stats,
        ])
        .run(tauri::ginit(db_path).map_err(|e| e.to_string())nerate_context!())
        .init(db_path).map_err(|e| e.to_string())xpect("error while running tauri application");
}
