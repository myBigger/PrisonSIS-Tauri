# 接口级权限清单（草案）

> 说明：本清单用于阶段 5 权限审查。以 Rust command 为准，页面权限仅为 UI 辅助。  
> 统一拒绝文案建议：`无权限执行该操作`。

## 字段说明

- `操作类型`：`read` / `write` / `admin`
- `audit_required`：`Y` 表示必须写审计日志（建议所有 `write/admin` 均为 `Y`）

## Command Matrix

| command | 模块 | 操作类型 | allowed_roles（建议初稿） | deny_message | audit_required |
|---|---|---|---|---|---|
| `db::login` | 认证 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_criminals` | 服刑人员 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_criminals_by_page` | 服刑人员 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::add_criminal` | 服刑人员 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::update_criminal` | 服刑人员 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::get_archive_criminals_by_page` | 档案 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::archive_criminal` | 档案 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::unarchive_criminal` | 档案 | admin | `Admin` | `无权限执行该操作` | Y |
| `db::get_cases_by_page` | 案件 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_case_by_id` | 案件 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::add_case` | 案件 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::update_case` | 案件 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::list_records_by_case` | 案件 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_records` | 笔录 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_record_by_id` | 笔录 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::add_record` | 笔录 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::update_record` | 笔录 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::submit_record_for_approval` | 审批 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::list_pending_records` | 审批 | read | `Admin/Approver` | `无权限执行该操作` | N |
| `db::approve_record` | 审批 | write | `Admin/Approver` | `无权限执行该操作` | Y |
| `db::reject_record` | 审批 | write | `Admin/Approver` | `无权限执行该操作` | Y |
| `db::get_approval_summary` | 审批 | read | `Admin/Approver` | `无权限执行该操作` | N |
| `db::get_templates` | 模板 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_templates_by_page` | 模板 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_template_by_id` | 模板 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::add_template` | 模板 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::update_template` | 模板 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::disable_template` | 模板 | write | `Admin/User` | `无权限执行该操作` | Y |
| `db::export_records_csv` | 导出 | write | `Admin/User/Approver` | `无权限执行该操作` | Y |
| `db::get_recent_records` | 仪表盘 | read | `Admin/User/Approver` | `无权限执行该操作` | N |
| `db::get_dashboard_stats` | 仪表盘 | read | `Admin/User/Approver` | `无权限执行该操作` | N |

## 审核提示

- 上表 `allowed_roles` 是初稿，请按你们制度逐行确认。
- 若未来新增 command，必须先补本清单再开发。
