use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct Criminal {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub gender: String,
    pub case_type: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    pub case_name: String,
    pub person: String,
    pub record_type: String,
    pub time: String,
    pub status: String,
}

// 获取罪犯列表（模拟数据）
#[tauri::command]
fn get_criminals() -> Vec<Criminal> {
    vec![
        Criminal { id: 1, code: "CR-00001".into(), name: "张某".into(), gender: "男".into(), case_type: "盗窃罪".into(), status: "在押".into() },
        Criminal { id: 2, code: "CR-00002".into(), name: "李某".into(), gender: "女".into(), case_type: "故意伤害".into(), status: "在押".into() },
        Criminal { id: 3, code: "CR-00003".into(), name: "王某".into(), gender: "男".into(), case_type: "诈骗罪".into(), status: "已释放".into() },
        Criminal { id: 4, code: "CR-00004".into(), name: "赵某".into(), gender: "男".into(), case_type: "抢劫罪".into(), status: "在押".into() },
        Criminal { id: 5, code: "CR-00005".into(), name: "刘某".into(), gender: "女".into(), case_type: "贩毒罪".into(), status: "在押".into() },
    ]
}

// 获取近期笔录（模拟数据）
#[tauri::command]
fn get_recent_records() -> Vec<Record> {
    vec![
        Record { id: "BL-2026-0001".into(), case_name: "盗窃案".into(), person: "张某".into(), record_type: "问询".into(), time: "2026-04-24 09:30".into(), status: "已审批".into() },
        Record { id: "BL-2026-0002".into(), case_name: "故意伤害".into(), person: "李某".into(), record_type: "审讯".into(), time: "2026-04-23 14:20".into(), status: "待审批".into() },
        Record { id: "BL-2026-0003".into(), case_name: "诈骗案".into(), person: "王某".into(), record_type: "问询".into(), time: "2026-04-23 10:00".into(), status: "已审批".into() },
        Record { id: "BL-2026-0004".into(), case_name: "抢劫案".into(), person: "赵某".into(), record_type: "问询".into(), time: "2026-04-22 16:45".into(), status: "已审批".into() },
        Record { id: "BL-2026-0005".into(), case_name: "贩毒案".into(), person: "刘某".into(), record_type: "审讯".into(), time: "2026-04-22 09:00".into(), status: "草稿".into() },
    ]
}

// 获取统计数据
#[tauri::command]
fn get_dashboard_stats() -> serde_json::Value {
    serde_json::json!({
        "today_records": 3,
        "pending_approvals": 12,
        "total_criminals": 248,
        "total_cases": 56,
        "yesterday_delta": 1,
        "expired_count": 3,
        "month_new_criminals": 7,
        "month_new_cases": 3,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 初始化日志（debug 模式下）
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
            get_criminals,
            get_recent_records,
            get_dashboard_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
