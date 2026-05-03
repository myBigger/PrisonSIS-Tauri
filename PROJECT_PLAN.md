# PrisonSIS-Tauri 项目完整开发计划

## 1. 文档信息

- **产品**：监狱审讯笔录系统（PrisonSIS）桌面客户端（Tauri 版）
- **技术栈**：Tauri 2、Rust、SQLite、React、TypeScript、Vite
- **仓库现状**：UI 壳较完整；Rust 数据层部分实现；多数业务页为 mock/占位
- **文档版本**：v1.1（见 §20 修订记录）
- **维护方式**：每阶段结束时更新「里程碑」与「范围矩阵/追溯表」

---

## 2. 目标与非目标

### 2.1 产品目标

- 在监管局域环境内完成业务闭环：**服刑人员信息维护 → 笔录起草 → 审批流转 → 检索归档 → 审计留痕**。
- 支持桌面端本地/内网部署：默认本地 SQLite，可控备份与导出。

### 2.2 技术目标

- **桌面端优先**：Windows / Linux（CI 已覆盖）；macOS 作为开发环境支持，发布打包另行规划。
- **契约清晰**：前端 `invoke` API + TypeScript 类型与 Rust `Serialize` 对齐。
- **可维护性**：逐步去 mock；统一错误处理、加载态；减少「点了没反应」的占位交互。

### 2.3 非目标（除非单独立项）

- 纯浏览器 SaaS 多租户（GitHub Pages 仅作 UI 预览）。
- 端到端加密笔录正文、跨站点联邦同步（可作为后续增强）。
- 对接外部统一身份认证/SSO（需单独阶段与环境对接）。

---

## 3. 现状评估（As-Is）

### 3.1 数据库（SQLite）

初始化脚本：`frontend/src-tauri/src/init_db.sql`。

已实现表：`users`、`criminals`、`records`、`templates`、`logs`（含种子用户与测试数据）。

主要缺口：

- **无独立 `cases`（案件）表**：若要做「案件」模块，需要新增表或明确用 `criminals.case_number` 等字段拼装业务规则。

### 3.2 Rust/Tauri Commands（后端）

核心文件：`frontend/src-tauri/src/db.rs`、注册入口：`frontend/src-tauri/src/lib.rs`。

已实现（现状可用）：

- 认证：`login`
- 服刑人员：`get_criminals`、`get_criminals_by_page`、`add_criminal`、`update_criminal`
- 笔录：`get_records`（分页+关键字）、`get_recent_records`
- 仪表盘：`get_dashboard_stats`

主要缺口（影响业务闭环）：

- 笔录缺少 **`add_record` / `update_record` / `get_record_by_id`** 等写入与详情能力。
- `get_records` 缺少按 `status` 的筛选参数，导致与前端「全部/草稿/待审批/已审批」等 Tab 不匹配。
- 用户、模板、日志、审批、导出、备份等模块缺少对应 command。

### 3.3 前端页面与数据来源

页面目录：`frontend/src/pages/`，共 13 个页面：

- `LoginPage`：Tauri 模式调用 `login`；Web 预览可降级模拟登录。
- `HomePage`：Tauri 模式调用 `get_dashboard_stats`、`get_recent_records`；失败降级 mock。
- `CriminalListPage`：Tauri 模式调用 `get_criminals_by_page`。
- 其余（`RecordsPage`、`ApprovalsPage`、`CasesPage`、`ArchivePage`、`StatsPage`、`UsersPage`、`LogsPage` 等）：多数为 mock/占位，部分按钮没有绑定事件。

---

## 4. 高层架构（保持不变）

```mermaid
flowchart TB
  subgraph ui [React_UI]
    Pages[Pages_Components]
    API[api_tauri_ts]
  end
  subgraph shell [Tauri]
    Invoke[IPC_invoke]
  end
  subgraph rust [Rust]
    Cmd[db_commands]
    SQLite[(SQLite)]
  end
  Pages --> API --> Invoke --> Cmd --> SQLite
```

---

## 5. 工作分解结构（WBS）— 按业务能力

1. **认证与会话**：登录、登出、角色（后续可做页面级权限）
2. **服刑人员**：列表、搜索、分页、详情、新增、编辑、归档策略
3. **笔录**：列表、筛选、新建、编辑、查看、编号规则、状态机（草稿→待审→通过/驳回）
4. **审批**：待办列表、审批动作写回 `records`、可选双人审批字段
5. **案件**：数据模型设计 → migration → API → UI（取决于是否引入独立 `cases` 表）
6. **档案**：归档查询、检索、只读策略
7. **模板**：`templates` 表 CRUD，笔录引用模板
8. **统计**：SQL 聚合与可视化，替换统计页 mock
9. **用户与权限**：用户 CRUD、启用/禁用、角色矩阵
10. **日志与审计**：写入 `logs`、日志查询、关键操作埋点
11. **备份与导出**：DB 文件备份、按需导出（CSV/文本/后续 Word/PDF）
12. **工程化**：打包发布、E2E、README/运维说明与合规备注

---

## 6. 阶段规划与里程碑（推荐）

### 阶段 0 — 工程基线（0.5～1 周）

**目标**：开发体验稳定、构建配置一致、环境文档可复现。

**交付**：

- Tauri/浏览器双模式一致：Vite `base` 区分 Tauri 与 GitHub Pages，`devUrl` 对齐。
- 工程告警收敛：修复明显拼写/无用 import 等（不影响业务但提升可维护性）。
- 输出开发环境与构建说明（建议单独 `docs/DEV_ENV.md`）。
- 明确打包目标：macOS 是否纳入正式发布；`tauri.conf.json` 的 `bundle.targets` 规划。
- **数据库脚本加载可靠化**：将 `init_db.sql` 从「运行时依赖工作目录」改为 `include_str!` 或嵌入 Tauri resource，并在阶段小结中列出验收项（见 §8-R1）。

**验收**：新同事按文档可在 macOS/Windows 跑起 `npm run tauri dev`；Pages 预览不受影响。

### 阶段 1 — 笔录制作 MVP（2～3 周，优先）

**目标**：笔录与数据库完全一致的 CRUD + 列表筛选分页。

**后端（Rust）**：

- 扩展 `get_records`：支持 `status_filter`（空=全部）+ `search` + `page/page_size`，并确保 `COUNT` 与列表一致。
- 新增：
  - `get_record_by_id(id)`
  - `add_record(payload)`：服务端生成 `record_id`（建议 `BL-YYYY-####`），校验 `criminal_id` 存在
  - `update_record(payload)`：最小状态规则（一期可限定仅 `Draft` 可编辑核心字段）

**前端（React）**：

- `RecordsPage` 替换 mock：对接分页、关键字、状态 Tab。
- 新建/查看/编辑：弹层或侧栏表单；保存与错误提示；表格「查看」有实际动作。
- 罪犯选择：复用现有 `get_criminals_by_page` 做搜索选择器（最小可用）。

**验收**：

- Tauri 下：新建后可在列表看到，编辑草稿后内容持久化；筛选/分页/搜索正确。
- `cargo check`、`npm run build` 通过。

### 阶段 2 — 审批中心（1～2 周）

**目标**：待审批队列 + 通过/驳回写回 `records`，首页「待审批」数字真实。

**交付**：

- Rust：`list_pending_records`、`approve_record`、`reject_record`（或通用 `set_record_status`）
- 前端：`ApprovalsPage` 去 mock；联动笔录状态机。
- 审计：审批动作写入 `logs`（最小埋点）。

### 阶段 3 — 案件管理（2～4 周，需需求定稿）

**关键决策**：

- 是否新增 `cases` 表及 `records.case_id` 外键；或使用 `case_number` 字符串关系。

**交付**：migration + API + `CasesPage` 实数据 + 与笔录/罪犯关联视图。

### 阶段 4 — 档案 / 模板 / 导出（2～3 周，可并行）

- 档案：归档筛选与只读（`ArchivePage`）
- 模板：`templates` CRUD（`TemplatesPage`）
- 导出：最小可用先做 CSV/纯文本；Word/PDF 模板作为后续增强

### 阶段 5 — 用户管理、日志审计、备份（2～3 周）

- 用户：CRUD、禁用、重置密码（PBKDF2/兼容旧 MD5）
- 日志：统一写日志封装，LogsPage 分页查询与筛选
- 备份：导出 DB 文件到用户选择路径（带校验/时间戳命名）

### 阶段 6 — 统计与仪表盘深化（1～2 周）

- 扩展 `get_dashboard_stats` 与 `StatsPage`，替换统计页 mock，统一指标口径。

### 阶段 7 — 质量与发布（持续 + 集中 1～2 周）

- 冒烟/回归用例固化（登录→罪犯→笔录→审批）
- E2E（可选 Playwright）或最小自动化脚本
- 版本管理、签名与发布产物说明（Windows/Linux/macOS）

---

## 7. 依赖关系（简化）

- 阶段 1（笔录）是阶段 2（审批）的前置依赖。
- 案件（阶段 3）依赖业务模型决策与 schema/migration。
- 日志审计（阶段 5）依赖全链路埋点约定（哪些操作必须留痕）。

---

## 8. 风险登记册

| ID | 风险 | 缓解 |
|----|------|------|
| R1 | `db::init` 依赖相对路径读取 `init_db.sql`，打包或工作目录变化可能导致脚本找不到 | 阶段 0 落地 `include_str!` 或 Tauri resource 路径；发布后做一次「干净目录启动」冒烟 |
| R2 | 需求扩展（双人审批、电子签章、正文加密）挤占工期 | 一期最小状态机 + 预留字段；扩展能力单列阶段与验收 |
| R3 | 合规与留痕不足（导出/审批/改稿不可追溯） | 阶段 5 统一日志 API；审批与导出必埋点后再开放给生产 |
| R4 | 跨平台打包与 CI 产物不一致（Windows/Linux/macOS） | 阶段 0 锁定「正式发布平台矩阵」；CI 与各平台冒烟清单对齐 |
| R5 | 敏感数据残留于日志或错误弹窗（堆栈带出正文） | 统一错误对用户展示文案；Rust `log::` 对 `content` 打码或禁止整段打印 |

---

## 9. 测试策略

- **单元测试（Rust）**：编号生成、状态转换、SQL 边界（可用 SQLite 内存库/临时库）。
- **契约测试**：TS `types.ts` 与 Rust struct 字段一致性检查（评审+脚本化检查可选）。
- **集成测试**：关键命令在 Tauri 下可调用并返回预期。
- **回归测试**：固定最小冒烟路径（阶段 1、2 完成后必须执行）。

---

## 10. 沟通与节奏（项目管理）

- **双周迭代**：每迭代明确范围与验收，结束后更新此文档的里程碑与追溯表。
- **需求入口**：每个新需求必须提供「验收标准 + 数据影响 + UI 入口」，防止页面堆叠 mock。
- **变更管理**：跨表结构变更必须带 migration 策略与回滚说明。

---

## 11. 范围-后端-数据追溯表（Backlog 维护）

| 模块 | 页面 | 建议 Rust API（增量） | 数据表 |
|------|------|------------------------|--------|
| 笔录 | RecordsPage | get_records(status+search+page)、get_record_by_id、add_record、update_record | records, criminals |
| 审批 | ApprovalsPage | list_pending、approve、reject / set_status | records, logs |
| 案件 | CasesPage | cases CRUD、关联查询 | cases（待建）, records, criminals |
| 档案 | ArchivePage | archived 查询、归档动作 | criminals, records |
| 模板 | TemplatesPage | templates CRUD | templates |
| 导出 | ExportPage | export_records_csv（举例）、按需 export_pdf/word（后置） | records, criminals |
| 统计 | StatsPage | 聚合 queries | 多表 |
| 用户 | UsersPage | users CRUD、reset_password、enable/disable | users |
| 日志 | LogsPage | logs 分页查询、写入封装 | logs |
| 备份 | BackupPage | export_db、import_db（可选） | SQLite 文件 |

---

## 12. 第一阶段（笔录 MVP）详细交付清单（用于启动执行）

### 后端

- [x] `get_records` 增加 `status_filter`（可选）并保证 `COUNT`/列表一致
- [x] `get_record_by_id(id)`
- [x] `add_record(payload)`（服务端生成 `record_id`）
- [x] `update_record(payload)`（一期最小状态校验：`Draft` 可编辑）
- [x] 在 `lib.rs` 注册新 command

### 前端

- [x] `api/tauri.ts` 增加对应调用与类型对齐
- [x] `RecordsPage` 去 mock：分页/搜索/Tab/加载态/错误态
- [x] 新建/查看/编辑 UI（最小可用）
- [x] 罪犯选择器（复用 `get_criminals_by_page`）

### 验收（请在本机 `npm run tauri dev` 自测勾选）

- [ ] 新建草稿 → 列表可见 → 编辑保存 → 重启应用仍存在
- [ ] Tab（含 Draft/Pending/Approved/Rejected）筛选正确
- [ ] 关键字搜索与分页正确

---

## 13. 需求与用户验收（建议附录形态）

本节用于对内排期或与业务方对齐时引用；具体条文可拆到独立文档并在此挂链接。

### 13.1 每条需求的最低信息（需求入口门禁）

- **业务叙述**：谁在什么场景下要完成什么。
- **数据影响**：是否改表 / 新建 command / 只改 UI。
- **验收标准**：可勾选、可复查（示例见下）。
- **非目标**：本需求明确不包含什么，防止范围漂移。

### 13.2 验收描述模板（可拷贝）

- **Given** 当前用户角色为 `{角色}`，且数据库中存在 `{前置数据}`，
- **When** 用户在 `{页面}` 执行 `{操作}`，
- **Then** `{可观察结果}`（含 DB/API 层面的持久化或可查询结果）。

### 13.3 与各阶段的映射（摘要）

| 阶段 | 建议固化验收包 |
|------|----------------|
| 阶段 1 | 笔录列表/筛选/分页/新建草稿/编辑保存/重启后仍在 |
| 阶段 2 | 待审批列表、通过/驳回后状态与首页统计一致、日志有审批记录 |
| 阶段 5 | 管理员可禁用账户、重置密码生效、导出/备份含审计或由日志证明 |

---

## 14. 安全、合规与权限（占位）

本节在实现前可先采用「占位矩阵」，迭代中逐步填空。

### 14.1 角色建议（可按机构调整）

- **Admin**：用户管理、备份、策略类配置。
- **User**：日常录入笔录、发起审批。
- **Approver**：审批中心操作。
- （可选）**Auditor**：只读日志与导出审计。

### 14.2 权限矩阵（页面 × 操作）

用表格维护：`登录 / 查看列表 / 新建 / 编辑 / 审批 / 导出 / 备份 / 用户管理`。实现方式可为：Rust command 层校验角色 + UI 按钮按角色隐藏（**隐藏不等于安全**，服务端命令必须兜底拒绝）。

### 14.3 数据与密钥

- 默认密码哈希策略以现有 Rust 为准；新用户必须走 PBKDF2 路径，逐步淘汰明文 MD5 示例数据（若生产使用）。
- 导出内容是否脱敏（身份证号等）须在阶段 4/5 定稿。
- CSP、文件访问（附件/照片路径）在引入上传或导出时单列安全评审。

---

## 15. 数据治理与迁移策略

- **现状**：初始化依赖 `init_db.sql` 一次性脚本；尚无显式 migration 编号体系。
- **目标**：任一表结构变更必须带 **migration 版本号 + 升级脚本 + 回滚说明（或备份恢复预案）**。
- **兼容性**：新版本客户端启动时对旧库的检测与渐进升级（例如在 `setup` 中执行 `_migrations` 表）。
- **备份**：重大 migration 前自动提示用户备份（与阶段 5 备份功能打通）。

---

## 16. 性能、检索与容量

- **量级假设**：在项目启动时写入「目标」——例如单笔录正文上限、五年内预期 `records` 行数，用于决定是否引入 **SQLite FTS（全文检索）** 或对 `content` 做摘要索引。
- **分页**：所有列表接口强制分页；默认 `page_size` 上限。
- **索引**：随查询模式增补复合索引（如 `status + created_at`）；变更前列出 EXPLAIN QUERY PLAN 抽样。

---

## 17. 无障碍与本地化

- **无障碍**：键盘可达性（表单与弹窗焦点）、对比度、`user-select`/只读场景的可用性（监管场景常见于长时间阅览）。
- **本地化**：当前以 **简体中文**为主；若需维汉等双语，将 i18n 工具与文案抽取列为独立迭代，避免零散硬编码扩散。

---

## 18. 运维发布与 CI 对齐

- **流水线**：与本仓库 `.github/workflows`（构建 release、Pages 预览）对齐；明确「哪些是正式安装包」「哪些是静态演示」。
- **发布清单示例**：版本号、`tauri.conf.json`/`Cargo.toml` 一致、changelog、Smoke、回滚备份说明。
- **macOS**：若纳入正式发布，补足 `bundle` 目标、签名/notarization 策略（可列为阶段 7 子任务）。
- **自动更新**：若未来需要 updater，单列阶段（与安全、签名捆绑）。

---

## 19. 培训、试运行与知识转移

- **操作手册**：管理员（备份/账户）与经办人（笔录/审批）分册或分章节。
- **试运行**：建议固定周期内收集缺陷分级（阻塞/严重/一般），再进「发布冻结」。
- **知识转移**：Rust 指令清单、数据库路径（`PRISONSIS_DB` 环境变量约定）、常见问题（白屏、`init_db.sql`）。

---

## 20. 文档版本与修订记录

| 版本 | 日期 | 修订摘要 |
|------|------|----------|
| v1.0 | （首次落盘） | 初版主计划 |
| v1.1 | （本轮） | 修正 §8 格式；增补 §13～§19 附录维度；§11 补导出行；§0 补 DB 脚本可靠化 |

**维护约定**：任一阶段结案时更新 §6 里程碑完成度、§11 追溯表状态及本修订记录表。
