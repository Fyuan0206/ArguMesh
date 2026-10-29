# Changelog / 更新记录

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

ArguMesh（论脉）的版本历史。README 只保留指向本文件的入口。

**约定**：每个版本英文在前、中文在后。用户可见的功能变更必须在同一任务内追加条目（见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) 的文档规则）。

---

## Release (2026-10-29) — v3.3.3 Apple Silicon Mac installer

- Built `ArguMesh_3.3.3_aarch64.dmg` from upstream `main` commit `9855070` and published it with a SHA-256 file on the [FakeNirvana fork's Mac Release](https://github.com/FakeNirvana/ArguMesh/releases/tag/v3.3.3-macos). The DMG is 317,170,141 bytes; SHA-256: `d25c52e246ba0dfe7ecf6d518cf217407fe9c9d742687b0db90634b364b342f2`. The upstream v3.3.3 Release still requires a maintainer to attach this Mac asset separately.
- Verified the DMG checksum and single app, arm64 app and Node binaries, app version 3.3.3, ad hoc resource seal, replacement installation at `/Applications/ArguMesh.app`, desktop startup, health/static assets and project write/read with an isolated test data directory. The app has no Apple Developer signature or notarization. Parsing model download and AI translation were not exercised.
- 基于上游 `main` 提交 `9855070` 构建 `ArguMesh_3.3.3_aarch64.dmg`，连同 SHA-256 文件发布到 [FakeNirvana fork 的 Mac Release](https://github.com/FakeNirvana/ArguMesh/releases/tag/v3.3.3-macos)。DMG 大小 317,170,141 字节，SHA-256：`d25c52e246ba0dfe7ecf6d518cf217407fe9c9d742687b0db90634b364b342f2`。上游 v3.3.3 Release 仍需维护者单独添加 Mac 附件。
- 已验证 DMG 校验和、单份应用、arm64 主程序和 Node、应用版本 3.3.3、ad hoc 资源签名、覆盖安装到 `/Applications/ArguMesh.app`、桌面启动、健康接口与静态资源，并在独立测试数据目录完成项目写入/读取。未进行 Apple 开发者签名或公证；未测试解析模型下载与 AI 翻译。

## Release (2026-10-29) — v3.3.3 Windows desktop installer

- Published [v3.3.3](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.3.3) as the latest stable release, with the verified Windows x64 installer and its SHA-256 file. The installer is 223,546,607 bytes (213.2 MiB); SHA-256: `9d80bf60c76ad8d5096806670efb49088bb5c20248db6c6ed95f47ddcdf3ca19`. The tag points to build commit `51bd4e3`; release documentation is synchronized afterward.
- Fresh installations contain an empty database and no user AI configuration. The installer is unsigned; the app has no authentication and listens only on loopback. Existing desktop databases receive the additive `0015_agent_skills` upgrade without replacing projects, messages or saved AI settings. Validation results and limitations are recorded in the build entry below.
- This release includes Windows only. The latest Apple Silicon Mac DMG remains v3.3.2; its existing download is retained separately in both READMEs.
- 将 [v3.3.3](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.3.3) 发布为最新正式版本，附已验收的 Windows x64 安装包和 SHA-256 文件。安装包 223,546,607 字节（213.2 MiB），SHA-256 为 `9d80bf60c76ad8d5096806670efb49088bb5c20248db6c6ed95f47ddcdf3ca19`；标签指向构建提交 `51bd4e3`，发布后同步文档。
- 新安装为空库，不带用户 AI 配置；安装包未签名，应用无鉴权且仅监听本机。已有桌面数据库增量补齐 `0015_agent_skills`，不替换项目、消息或保存的 AI 配置；构建验证与已知范围见下方条目。
- 本次仅发布 Windows，Apple Silicon Mac 最新 DMG 仍为 v3.3.2；两份 README 分开保留对应平台下载链接。

## v3.3.3 (2026-10-29) — Local Windows desktop build

- Bump package, Tauri and Cargo versions to 3.3.3. Prepare a local Windows x64 installer with the current reader alignment, PDF persistence, Paper Card comparison and eleven bundled Nature text workflows. No GitHub Release or new Mac DMG is published by this packaging task.
- Reuse the existing additive `0015_agent_skills` migration in a transaction before desktop API requests. Upgrades from v3.3.2 retain projects, messages and AI settings; concurrent first requests share the migration and failures can retry. Source databases still use the custom migration command. No new migration number.
- Fresh installations contain an empty schema-only database, no user data or AI credentials. The installer is unsigned; the application has no authentication and binds to loopback. Nature Python/R/MCP execution and PPTX/DOCX/figure generation remain unavailable.
- 统一 package、Tauri 与 Cargo 版本号为 3.3.3，本地 Windows x64 安装包纳入阅读器双栏对齐、PDF 重启持久化、Paper Card 对照填写与 11 个 Nature 技能文本包。本次打包不发布 GitHub Release，也未生成新版 Mac DMG。
- 桌面 API 请求前以事务复用已有 `0015_agent_skills` 增量迁移，兼容 v3.3.2 旧库并保留项目、消息与 AI 配置；并发首请求共用迁移，失败可重试。源码旧库仍使用 custom 迁移命令，无新增迁移编号。
- 新安装为空结构库，不含用户数据或 AI 密钥；安装包未签名，应用无鉴权、仅监听本机。Nature 的 Python/R/MCP 执行及 PPTX/DOCX/图表生成尚未接入。
- Validation: typecheck and production build passed; 335/335 tests passed in 66 files using `pnpm run test --pool=forks`, plus 5/5 Rust tests. The packaged sidecar passed fresh-template, skill-resource, PDF/workspace/OCR restart and v3.3.2 upgrade checks, including retained AI settings and repeat-start idempotence. The default thread pool returned a nonzero exit after passing its assertions on this Windows host; the isolated fork pool completed successfully.
- 验证：类型检查、生产构建通过；`pnpm run test --pool=forks` 共 66 个文件、335/335 测试通过，Rust 测试 5/5 通过。打包 sidecar 的空库、技能资源、PDF/工作区/OCR 重启及 v3.3.2 旧库升级检查通过，含 AI 配置保留和重复启动幂等。本机默认线程池在断言通过后返回非零，改用独立进程池成功结束。

## Docs (2026-10-29) — Community links and README languages

- Added centered links to the WeChat community and [official website](https://argumesh.nekocfy.com/) near the top of both READMEs, and moved QR-code display and expiry notices to [community issue #4](https://github.com/Fyuan0206/ArguMesh/issues/4). Replaced the QR image with the supplied original, valid before November 5, 2026. Kept `README.md` for Chinese and `README.en.md` for English, removed the duplicate `README.zh-CN.md`, and updated contributor documentation rules. No database migration.
- 中英文 README 顶部新增居中的微信交流群与[官网](https://argumesh.nekocfy.com/)入口，群二维码展示与有效期统一移至[交流群 Issue #4](https://github.com/Fyuan0206/ArguMesh/issues/4)；二维码更新为用户提供的原图，按微信提示于 2026 年 11 月 5 日前有效。中文只保留 `README.md`，英文保留 `README.en.md`，移除重复的 `README.zh-CN.md` 并同步更新协作文档规则。无需数据库迁移。

## Unreleased (2026-10-23) — Reader pane alignment and shared controls

- Moved translation actions, view tabs and navigation into a shared top toolbar, with progress and fallback notices above both panes. Matched page origins and margins, fitted both pages to the narrower pane and preserved manual zoom on height-only changes. Linked scrolling now follows both horizontal and page-relative vertical position, including the first page's leading margin; independent scrolling remains available. No database migration or new installer release.
- 将翻译操作、视图页签与阅读导航集中到顶部公共工具栏，进度和降级提示单独展示，不再将右侧纸页向下推移。统一两栏纸页起点、留白和缩放，窄栏按较小可用宽度适配；仅高度变化时保留手动缩放。双屏关联同时同步横向和页内纵向位置，首页保留顶部留白，关闭关联可独立滚动。无需数据库迁移，尚未发布新安装包。

## Unreleased (2026-10-23) — PDF persistence across restarts

- Save uploaded PDF filenames with their contents in the local database. Restore the Read action for existing database PDFs that have no filename when browser storage is empty after a desktop restart or update. Reader uploads now report database failures before marking an attachment saved. No database migration; no new installer release.
- 修复桌面版重启或更新后文献重新显示「上传 PDF」的问题：文件名随 PDF 本体持久化，浏览器缓存为空时也为数据库中已有的 PDF 恢复「阅读」入口；阅读器上传入库失败会明确报错。无需数据库迁移，已入库附件无需重新导入；仅存于旧浏览器缓存、从未入库的文件仍需重新选择一次。尚未发布新安装包。

## Unreleased (2026-10-22) — Bundled Nature research skills

- Replaced the three default research workflows with eleven bundled Nature text packages: academic search, citation, data availability, figures, paper-to-patent, paper presentations, polishing, reading, reviewer responses, simulated peer review and writing. The existing left-sidebar skill manager and turn selection remain; bundled content is read-only, can be enabled/disabled and cannot be uninstalled.
- Added reviewable source assets under `server/skills/nature/<name>/` with a catalog and compatibility notes, included in Web/source use and desktop sidecar resources. Existing user installations with the same name take precedence, including disabled installations. Previous message snapshots retain their original content, including the former default workflows.
- Retained the per-package limits of 64 text files, 64 KiB per file and 512 KiB in total. Omitted non-runtime metadata and binary figure collections, archived the oversized citation script in text chunks, and documented missing `_shared` references in four original packages. Python/R/MCP execution, figure rendering and PPTX/DOCX generation are not connected. No new database migration or installer release; source databases without skills support still need `0015_agent_skills`.

<details>
<summary>中文</summary>

- 以 11 个内置 Nature 文本包替代原三个默认科研工作流，覆盖检索、引用、数据可用性、绘图、论文转专利、论文汇报 PPT、润色、阅读、审稿回复、模拟审稿与写作。保留左侧「管理技能」及对话选择；内置内容只读、可启停、不可卸载。
- 在 `server/skills/nature/<name>/` 保存可审阅的源码资产、清单及兼容说明，供 Web/源码运行与桌面 sidecar 分发。已有同名用户安装优先，包括停用状态；旧消息继续保留原技能内容快照，也保留此前默认工作流的历史。
- 每包继续限制为 64 个文本文件、单文件 64 KiB、总量 512 KiB。剔除非运行元数据与二进制图集，超限 citation 脚本按文本分块归档；四个原包缺失的 `_shared` 资料已明确标注。尚未接入 Python/R/MCP、图表渲染及 PPTX/DOCX 生成工具链。本次无新数据库迁移、未发布新安装包；尚无 skills 支持的源码旧库仍需 `0015_agent_skills`。

</details>

## Unreleased (2026-10-21) — Skill management in the sidebar

- Moved **管理技能** from the Research Agent composer to the left sidebar. It opens the existing management dialog for skills shared across projects; the composer retains automatic, no-skill and specific-skill selection. No database migration or new installer release.
- 将「管理技能」从 Research Agent 输入区移到左侧栏，点击打开现有管理弹窗，技能由所有项目共用；输入区保留自动选择、不使用技能和指定技能。本次入口调整无数据库迁移，尚未发布新安装包。

## Unreleased (2026-10-21) — Research Agent skills

- Added three bundled research skills for evidence review, experiment planning and manuscript review, plus local `SKILL.md` / skill-folder preview and installation in Research Agent. Users can inspect and enable/disable skills, uninstall user-installed skills, and choose automatic selection, a specific skill or no skills for a turn. Installations stay in the local database and are shared across projects; this source change is not yet available in published installers.
- Added bounded `skill_load` / `skill_read` tools, retaining the actual loaded skill's source, content hash, load time and full text snapshot with its message, including failed or cancelled turns. Previous snapshots survive uninstall/reinstall. Disabled Pi's implicit skill, extension, prompt and context-file discovery; imported scripts are text resources only and are never executed. Existing draft-only domain tools and the one-write-per-turn guard remain in place.
- Added the incremental custom migration `0015_agent_skills`: an `agent_skills` table and `ai_messages.skills_json` / `skill_selection_json` columns. Existing research data remains; run the custom migration on source databases before using the feature. No cloud services, accounts or new keyboard shortcuts.
- Research Agent 新增证据梳理、实验规划与论文审查三个内置技能，并支持预览安装本地 `SKILL.md` / 技能文件夹。可查看、启停技能，卸载用户技能，并为对话选择自动使用、指定技能或不使用技能；安装内容在本机数据库保存，所有项目共用。本次为源码新增，尚未发布新安装包。
- 新增有界 `skill_load` / `skill_read` 工具，按消息保留实际加载技能的来源、内容哈希、时间与完整文本快照，包括失败或取消的回合；卸载或重装不改写旧快照。关闭 Pi 隐式扫描技能、扩展、提示词与上下文文件；导入的脚本仅作为文本资料保存，不执行。保留领域工具的草稿写入与每轮一个写入动作限制。
- 新增增量 custom 迁移 `0015_agent_skills`：`agent_skills` 表与 `ai_messages.skills_json` / `skill_selection_json` 列。保留已有研究数据；源码旧库使用该功能前需执行 custom 迁移。无新增云服务、账号或键盘快捷键。

## Docs (2026-10-21) — Research Agent skills integration status

- Documented the existing Pi SDK skill discovery and manual `/skill:name` expansion, including user-level `.agents/skills` discovery, startup-directory scope and the temporary agent directory. Distinguished these SDK mechanisms from the missing model-visible catalog, controlled skill-resource loading, management and version tracking, and general script execution. Synchronized development, architecture, status and all three README documents, and aligned the development guide's README language rule with `AGENTS.md`. Documentation only; no application, dependency or database migration changes.
- 补充 Research Agent 的 skills 接入现状：记录 Pi SDK 已有的技能发现与 `/skill:名称` 手动展开、用户级 `.agents/skills` 扫描、服务启动目录范围和临时 Agent 目录；明确模型可见技能列表、受限技能资源读取、管理与版本追踪及通用脚本执行仍未完整接入。同步开发指南、架构、进度与三份 README，按 `AGENTS.md` 修正开发指南的 README 语言规则。本次仅更新文档，无应用功能、依赖或数据库迁移变更。

## Unreleased (2026-10-18) — Reader readability and Paper Card comparison (#2)

- Increased annotation/Q&A input text to 16px and excerpt/answer body text to 15px, strengthened text contrast and enlarged actions and selection-translation bubbles across platforms. Buttons wrap on narrow screens.
- Added a Paper Card reader tab and a direct comparison entry from paper details. Reused the existing editor alongside the PDF, with side-by-side desktop panes and independently scrolling stacked panes on narrow screens. Unsaved card drafts survive tab switches; saving uses the existing card persistence and provenance flow. Opening the view does not trigger AI. No database migration.
- 修复批注与问答字号过小、颜色偏淡：输入文字 16px、摘录与回答正文 15px，增加文字对比度，放大操作按钮与划词翻译气泡；窄屏按钮可换行，对 Windows、macOS 与 iOS 共用界面生效。
- 阅读器新增 Paper Card 页签，文献详情新增「对照 PDF 填写」入口；复用现有编辑器与 PDF 阅读器，宽屏左右并排，窄屏上下独立滚动。切换页签保留未保存卡片草稿，保存沿用原有卡片持久化与来源记录；仅打开界面不调用 AI。无需数据库迁移。

## Docs (2026-10-14) — Agentero competitor analysis

- Expanded the existing Agentero reference into a priority-competitor analysis with 10 modules and 40 numbered capabilities, pinned source links, release/source distinctions, platform limits, and an ArguMesh comparison. Updated the official site and corrected the former BibTeX-only writing description to include current-main TeX editing/compilation; synchronized all three READMEs. Source/docs review only, without Agentero runtime testing; no application or database migration changes.
- 将已有 Agentero 简介扩展为重点竞品分析：10 个模块、40 项编号能力，固定源码来源，区分正式版本与主干、注明平台限制并对照 ArguMesh。更新官网链接，修正旧“仅 BibTeX 导出”描述，补充主干 TeX 编辑/编译，同步三份 README。本次为源码/文档盘点，未运行验收 Agentero；无应用功能或数据库迁移变更。

## v3.3.2 (2026-10-12) — Windows and Apple Silicon Mac installers

- Set the package, Tauri bundle, and Cargo version to 3.3.2. Published the rebuilt Windows x64 EXE and the updated Apple Silicon Mac DMG with SHA-256 checksums. Both the Mac app metadata and bundled server report 3.3.2; archive integrity and its empty database template passed inspection. No new database schema migration.
- 统一 package、Tauri 与 Cargo 版本号为 3.3.2，发布重新构建的 Windows x64 EXE 与更新后的 Apple Silicon Mac DMG，附 SHA-256 校验文件；Mac 应用元数据与内置服务均为 3.3.2，归档完整性和空模板库核验通过；无新增数据库结构迁移。
- Known limitations: shared workspace snapshots can overwrite changes when multiple entry points stay open, and loading an existing shared workspace can replace browser-only Paper Cards. Back up the workspace and use one entry point at a time. Existing source-run databases at `./data/argumesh.db` are not automatically moved to the new default directory; retain an explicit `DATABASE_URL` until data migration is arranged. The Mac DMG is inspected on Windows, without a macOS launch test.
- 已知限制：多个入口同时打开时，共享工作区快照可能覆盖另一入口的修改；已有共享工作区可能替换浏览器独有的 Paper Card。请备份工作区并一次只使用一个入口。源码旧库 `./data/argumesh.db` 不会自动迁入新默认目录，迁移前请显式保留 `DATABASE_URL`。Mac DMG 在 Windows 上核验，未在本次任务中实机启动。

- Prevent the bundled Python parser from rewriting bytecode inside the installed app: all isolated parser checks and runs now use `-B`. This keeps the macOS bundle's sealed resources intact after use. No data migration.
- 修复内置 Python 解析器运行后改写应用包内字节码的问题：构建检查和解析过程均使用 `-B`，避免 Mac 应用资源签名在使用后失效。无需迁移数据。

- Persist local OCR text and page translations in the shared application data directory so they survive a desktop sidecar port change and remain available to the local web entry point. / 将 OCR 文本与逐页译文保存在共用应用数据目录，修复客户端换端口后译文消失，并供本地网页端读取。
- Fixed local workspace data disappearing from the UI when the desktop sidecar restarted on a new port. The Mac app and locally started web server now use the same application data directory and shared workspace file; persisted matrices are also restored from the database.
- 修复桌面服务换端口后 Paper Card 与矩阵等本地状态在界面中消失的问题。Mac 客户端与本机启动的网页端共用应用数据目录和工作区文件，已有矩阵也会从数据库恢复。
- Added a local macOS arm64 DMG build using the existing Tauri desktop shell, with bundled Node, libSQL, and a hash-locked private Python/MinerU runtime. The app stores its database and parser models under `~/Library/Application Support/ArguMesh`; existing Windows packaging remains available. Desktop HTTP now binds explicitly to `127.0.0.1`, and Mac update checks select a matching DMG asset when one is published.
- 新增 Apple Silicon Mac DMG 构建：沿用 Tauri 桌面壳，随包提供 Node、libSQL、独立 Python/MinerU；数据库与解析模型保存在 `~/Library/Application Support/ArguMesh`。保留 Windows 打包流程，桌面 HTTP 明确只监听 `127.0.0.1`；应用更新检查会选择对应 DMG。Mac 包未签名、未公证。
## Unreleased (2026-10-11) — Research Agent turn recovery

- Stop and dispose interrupted/failed Pi sessions before retrying, restore bounded saved history, and wait for SDK retries to finish before completing a turn. Live turns are no longer marked failed after 25 seconds; duplicate submissions cannot mutate a running session. Add SSE keepalives, a five-minute timeout, terminal-event stream cleanup and page-exit cancellation. Preserve message/action history, show Chinese busy/timeout guidance, prevent late replies from reviving failed turns, and enforce one whitelist write per turn. No database migration.
- 修复 Research Agent 连接中断后重试反复提示 “Agent is already processing”：停止旧会话并恢复已保存的上下文，等待 SDK 后台重试结束后再完成回合。正常长回合不再因超过 25 秒被误判失败，重复提交不修改运行中的会话。增加流心跳、5 分钟超时、终止事件清理与页面离开取消，保留消息和动作历史；迟到回复不能恢复失败回合，忙碌/超时提示改为中文，每轮最多一个白名单写入动作。无数据库迁移。

## Unreleased (2026-10-11) — Matrix source navigation and batch confirmation

- Fixed matrix Open source using an asynchronous popup that could fail in desktop WebView. Source links now enter the in-app PDF reader in the correct project and use readable evidence page labels ahead of the saved reading position, clamped to the PDF page count.
- Added per-paper and entire-matrix confirmation with an explicit scope/count dialog. Batch confirmation locks sourced drafts and skips confirmed, locked, missing, conflicting and unextracted cells; entire-matrix scope includes search-hidden papers. Server updates are transactional, validate every requested cell's membership and recheck eligibility; local matrices use a single state update. Source content stays unchanged and existing AI overwrite guards remain active. No database migration.
- 修复证据矩阵「打开原文」在桌面 WebView 中弹窗失效，改为进入正确项目的应用内阅读器；可识别的证据页码优先于上次阅读位置，并限制在实际 PDF 页数内。新增「确认本篇」「确认整个矩阵」，先展示范围、数量与跳过规则，再确认并锁定有来源的草稿。全矩阵包含搜索隐藏的文献；已确认、锁定、缺失、冲突与待提取内容不变。服务端整批事务写入并校验范围，本地矩阵一次更新，保留来源与 AI 覆盖守卫，无数据库迁移。

## Unreleased (2026-10-11) — Continuous reader scrolling

- Replaced previous/next pagination with continuous vertical sheets for the PDF and translation panes. The page indicator follows scrolling; linked scrolling aligns page boundaries even when translated pages have different heights. Outline/search/annotation jumps and last-page restoration remain available.
- Render only nearby canvases and translated sheets while retaining page heights; scrolling only reads existing page caches, and selected passages keep their actual source-page identity. No database migration or translation-cache invalidation.
- 阅读器改为原文与译文纸页连续下滑，移除上一页/下一页按钮；页码随滚动更新，双屏关联按同页位置同步，译文高度不同也能跨页对照。保留目录、搜索、批注与页码跳转及上次页码恢复；只渲染附近页面，滚动只读缓存、不触发 AI，划词保留实际所属页。无需数据库迁移，已有译文缓存继续复用。

## Unreleased (2026-10-11) — OCR and reader recovery

- Bundled the English OCR worker, embedded WASM core and language data for local Web/desktop use. Added distinct preparation/loading/recognition states, bounded canvas size, rendering and recognition timeouts, and cancellation. Short saved OCR text remains usable for translation.
- Added current-page translation from native or OCR text without requiring MinerU; requests remain bounded to page passages, preserve provenance and completed translations, and can be cancelled. Precise whole-paper parsing can fall back to readable native/OCR page text with a visible approximate-layout notice.
- Kept reader tabs visible independently of translation controls; paused/failed translation no longer hides the route back to annotations/Q&A. Added actionable, safe model API failure messages. No database migration; OCR assets are included in rebuilt bundles/installers.
- 英文 OCR 资源随构建内置，移除运行时 CDN 下载；显示准备、加载引擎与识别阶段，限制画布大小，加入渲染/识别超时和取消。短 OCR 文字也可翻译。新增“翻译本页”，直接处理原生或 OCR 本页分段，保留来源与已完成译文；精确解析失败时可用已有文字继续全文翻译并显著提示近似版面。
- 阅读页签始终可用，暂停或失败不影响切回批注与问答；模型调用失败显示连接、密钥/权限、额度/限流、超时等可操作原因。无需数据库迁移，新 OCR 资源需重新构建应用/安装包后生效。

## Unreleased (2026-10-11) — Paper Card model display

- Removed the hardcoded `step-3.7-flash` fallback and the use of previous-card provenance in the Paper Card generation notice. The UI now reads the active model configuration and refreshes it before each generation; completed drafts use the model returned by the server. Shared model lookup now honors saved settings over environment defaults. No database migration.
- 修复 Paper Card 已接入 `step-5-preview` 却提示 `step-3.7-flash` 的问题：生成按钮与进度改为读取当前配置，每次生成前刷新；完成后以服务端返回的模型记录来源，旧卡片的历史模型保持原样。共享模型读取优先使用设置页配置，无数据库迁移。

## Unreleased (2026-10-11) — Paper-style translation

- Reworked the translated sheet following the supplied Little Green Whale examples: centered title, continuous serif prose, source columns and spanning figures/tables in their corresponding vertical sections. Linked scrolling can be toggled.
- Keep figure, table and equation pixels intact; translate prose, captions and notes instead of OCR labels or table cells. Preserve original merged cells when table pixels are unavailable. Academic prompts preserve names, citations and terminology; validated translation responses carry generation timestamps, retained with source/model details in the local cache and available on hover.
- No database migration. Parser geometry and the new translation flow use separate cache versions; previous caches remain, and the first new run reparses/retranslates pages.
- 参考用户提供的小绿鲸示例，译文改为标题居中、衬线正文连续排版、单双栏与跨栏图表按原页位置穿插；支持切换双屏关联。图表与公式保留原貌，仅翻译正文、图表说明与注释，不再自动翻译图中文字和表格单元格；译文保留来源、模型和生成时间。无数据库迁移，新解析与译文使用独立缓存，旧缓存保留，首次需重新解析和翻译。

## Unreleased (2026-10-11) — AI connection check

- Fixed Settings showing “environment not detected” when a saved custom AI configuration is active. The badge now shows the actual configuration source and model; clearing custom settings refreshes the environment fallback. `AI_PROVIDERS` now works without requiring legacy `STEPFUN_*` variables.
- Added a cancellable connection check using the same OpenAI-compatible / Anthropic Messages request path as AI features. It sends a fixed short message, displays model, API format, latency and timestamp, and gives safe failure hints without exposing API keys. Edited settings must be saved first; the check has a 30-second timeout. No database migration is required.
- 修复已保存自定义 AI 配置却显示「未检测到」的问题，改为展示实际配置来源与模型；清除配置后刷新环境回退，并修复单独使用 `AI_PROVIDERS` 时的检测。
- 新增可取消的「连接自检」，通过固定短消息真实调用验证连接，展示模型、接口类型、耗时与检查时间；按密钥/权限、额度/限流、接口/模型、网络与超时提示失败原因，不回显上游敏感错误。修改配置需先保存，30 秒超时，无数据库迁移。

## Docs (2026-10-07) — Homepage content corrections

- Restored the reproduced reading status, clarified desktop-specific host features, split the reader description, and distinguished published v3.3.0 downloads from unreleased v3.3.1 source changes.
- 补全「已复现」阅读状态，明确桌面宿主能力，拆分阅读器说明，区分 v3.3.0 正式安装包与 v3.3.1 未发布源码。

## Docs (2026-10-07) — Chinese repository homepage

- Made README.md the Chinese homepage, with an English link to README.en.md. README.zh-CN.md remains available for existing links. Updated agent documentation rules for the new language layout.
- 仓库主页改为中文，英文通过 README.en.md 跳转；保留 README.zh-CN.md 兼容已有链接，并同步调整 agent 文档规则。

## v3.3.1 (2026-10-07) — bundled PDF parser runtime

- v3.3.1 desktop builds include an isolated Python 3.13.16 / MinerU 3.4.2 CPU runtime with locked, hash-verified dependencies and app-local Microsoft Visual C++ 14.44.35211 libraries. The build checks the complete inference imports and their private DLL paths. Users no longer need to install Python, MinerU or configure PATH.
- Parsing models download automatically on the first precise translation, with model-group progress, cancellation and retry. Model files and partial downloads live in user data and survive upgrades; subsequent parsing uses local models. Downloads use the official ModelScope mirror; interrupted configuration writes recover automatically. Unused C++ static link archives are excluded from the runtime. PDFs are parsed locally; translation still sends only the active page's passages or OCR text to the configured API.
- Windows 安装包内置独立 Python / MinerU CPU 环境，用户无需额外安装或配置 PATH。首次精确翻译自动下载模型，显示模型组进度，可取消、失败后可继续；模型与下载缓存位于用户数据目录，升级后复用。解析在本机完成，翻译仍只发送当前页分段或图内 OCR 文字。
- Published the Windows installer and SHA-256 checksum on GitHub Releases. Close the app and install v3.3.1 over the current version; v3.3.0 users receive the in-app update notice. No database migration is required; existing research data and AI settings remain compatible. / 已发布 Windows 安装包与 SHA-256 校验文件，请关闭应用后覆盖安装；v3.3.0 用户可收到应用内更新提醒。无新增数据库迁移，兼容现有研究数据与 AI 配置。
- Fixed the parser progress prefix boundary so valid download progress messages reach the reader. / 修复解析进度消息的前缀截取，确保模型下载进度可显示。

## Docs (2026-10-07) — README presentation refresh

- Refreshed both READMEs with a compact centered introduction, prominent acknowledgments, capability tables and a three-column screenshot gallery. Detailed feature descriptions remain expandable.
- 参考 jev-chat README 的组织方式，同步更新中英文页首、靠前的致谢区、功能表格与三列截图；完整功能说明可展开。

## Docs (2026-10-07) — WeChat group QR code

- Replaced the community QR code with the supplied PNG and updated both READMEs with its validity window (before October 14, 2026).
- 更新微信群二维码，保留用户提供的 PNG 原图；中英文 README 同步注明有效期（2026 年 10 月 14 日前）。

## Docs (2026-10-07) — README layout

- Reorganized both READMEs with a centered title, language switch and section navigation. Download and local setup now precede the feature tour; secondary screenshots and the coding-agent deployment prompt are expandable. Acknowledgments now appear near the end.
- 同步整理中英文 README：居中页首、语言切换与章节导航；下载安装和本地部署前置，次要截图与 AI 部署提示词可展开，致谢移至文末。

## v3.3.0 (2026-10-07) — structured translation and update reminders

- Desktop startup now checks the latest stable GitHub release and offers a dismissible installer download notice. Settings includes manual update checks; offline failures never block the workspace. Only public release metadata is requested.
- 桌面版新增启动更新提醒和设置页手动检查更新，直接下载新安装包；关闭当前版本提醒后，下一版本仍会提示。网络失败不影响工作台，不发送研究内容。
- Upgrade by closing the app and installing v3.3.0 over the current version; existing local data and AI settings are retained. New installations ship an empty database with no developer AI configuration. The installer is unsigned (SmartScreen may warn); the app has no authentication, so keep its local port off untrusted networks. MinerU 3.x is required separately for precise translation and is not bundled.
- 请关闭应用后覆盖安装 v3.3.0，保留现有数据和 AI 配置；新安装使用空库，不带开发者 AI 配置。安装包未签名，SmartScreen 可能提示；应用无鉴权，不要向不可信网络暴露本地端口。本机 MinerU 3.x 需另装，未随包分发。

- Added local MinerU parsing for the current PDF page. Tables now retain rows, columns, and merged cells; only labels are translated, while numeric results and model identifiers stay exact. Display equations and figures retain their source images; figure text can be OCR'd locally and translated after low-confidence OCR marks are filtered. Parsed pages use a PDF-hash cache, and MinerU translations have a separate IndexedDB cache version.
- 新增本机 MinerU 当前页精确解析。表格保留行列与合并单元格，只翻译文字标签，实验数值和模型标识原样保留；公式和图片保留原图，图中文字在本机 OCR 过滤低置信度杂点后翻译。解析结果按 PDF 哈希缓存，译文使用独立的本机解析版本缓存。
- Simplified the reader toolbar to one “精确解析并翻译全文” action. One click now parses and translates every page in sequence, starting with the visible page. It shows the model and page-level progress, can be cancelled, and resumes from cached page translations; only the page being processed is sent to the model. Removed the separate parse-only and plain-text translation actions.
- 阅读器工具栏只保留「精确解析并翻译全文」入口。点击一次从当前页开始逐页解析、翻译整篇论文，显示模型和逐页进度，可取消并复用已缓存的译文；模型每次只接收正在处理的单页分段。移除单独解析和仅翻译文字按钮。
- Locked numbers in mixed table labels and captions during translation, then restored the exact source values. This prevents cells such as “Model 1” from silently becoming “模型一”.
- 翻译带数字的表格标签与表题时先锁定数字，再恢复原文数值；避免「Model 1」被模型改写成「模型一」。
- Send only the source passage to the translation model and ignore cached responses that echo request metadata, so those passages are translated again on resume.
- 翻译请求只向模型提供原文段落；缓存若混入请求字段，继续翻译时会跳过并重新翻译该段。
- Retry transient empty API responses while parsing pages in the whole-paper job, avoiding a manual restart after a local development server reload.
- 全文任务遇到本地开发服务短暂重载导致的空响应时自动重试当前页，减少手动续跑。
- Fixed DeepSeek translation requests that could return an empty answer after consuming the token budget on internal reasoning; figure OCR translation now asks for readable labels only.
- 修复 DeepSeek 翻译偶尔将 token 耗在内部推理而返回空正文的问题；图中文字只翻译可辨认的标签，不猜测模糊片段。

- The PDF reader now opens in a two-page comparison view: original PDF on the left, a translated paper page on the right, with matched page turns and synchronized scrolling. One explicit click starts sequential page translation, with OCR, progress, and cancellation. Notes and Q&A remain one click away.
- Translation now reconstructs paragraphs and section headings from PDF text geometry and uses the source page's column count. It no longer splits every page into arbitrary ~400-character chunks or forces single-column originals into a two-column translation. Layout-aware translations use a separate cache key, preserving earlier cached results without displaying them under the wrong structure; affected pages need a new translation.

<details><summary>中文</summary>

- PDF 阅读器默认左右对照：左侧原文 PDF，右侧译文纸页，同页翻页并同步滚动。点击一次逐页完成整篇翻译，并保留 OCR、进度和取消；批注与问答可随时切回。
- 译文现在利用 PDF 文字坐标恢复段落和章节标题，并跟随原页单栏或双栏，不再按约 400 字任意截断或强制双栏。新版译文使用独立缓存键，旧译文仍保留但不以错误结构展示；相关页面需要重新翻译一次。

</details>

## Docs (2026-09-24) — README download & install section

- **Both READMEs gained a Download / 下载安装 section** linking the v3.2.5 Windows installer from [GitHub Releases](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5), with a short entry in each top feature list. The section repeats the three installer facts the release notes carry — **the installer ships an empty database** (re-enter your AI provider on the Settings page), **the build is unsigned** (SmartScreen will warn), **the app has no auth** (never expose its port) — plus install steps (`currentUser`, no administrator rights), first-launch latency (8–75 s against a 90 s budget), where data lives (`%LOCALAPPDATA%\ArguMesh\data`, written on first launch only so upgrades never touch it), and the `sidecar.log` troubleshooting entry.
- **The deferred README download item is now done.** Code signing and `.github/workflows/release.yml` stay deferred (see `TODO.md`).

<details><summary>中文</summary>

- **两份 README 都新增了「下载安装」章节**，指向 [GitHub Releases](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5) 上的 v3.2.5 Windows 安装包，并在开头的特性列表里加了一条入口。章节重复了发布说明里那三条安装包事实——**安装包里是空库**（装完要在设置页重填 AI 提供方）、**没有代码签名**（SmartScreen 会拦）、**应用无鉴权**（不要把端口暴露到不可信网络）——并写清安装步骤（`currentUser`，不需要管理员权限）、首次启动耗时（8–75 秒，壳等 90 秒）、数据位置（`%LOCALAPPDATA%\ArguMesh\data`，只在首次启动写入，升级不动它）与 `sidecar.log` 排错入口。
- **「README 下载章节」这条暂缓项就此完成**；代码签名与 `.github/workflows/release.yml` 仍暂缓（见 `TODO.md`）。

</details>

---

## Release (2026-09-24) — v3.2.5 on GitHub Releases

- **First GitHub Release**: [`v3.2.5`](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5) carries everything since v3.2.4, with a Windows NSIS installer (`ArguMesh_3.2.5_x64-setup.exe`, ~29.8 MB, `currentUser` install — no administrator rights) attached as a downloadable asset. The user re-raised distribution on 2026-09-24; the deferred-installer note in `TODO.md` is lifted for publishing, while code signing and `release.yml` CI stay unimplemented. At release time the READMEs still had no download section — it was added the same day (see the entry above).
- **Three facts the release notes state up front** (any future download section must repeat them): the installer ships an **empty database** — projects, papers, evidence and AI settings are not in it, so re-enter your provider on the Settings page after installing; the build is **unsigned**, so SmartScreen warns about an unknown publisher; the app has **no authentication**, so never expose its port to an untrusted network.
- **Release process is manual and documented**: commit → tag → `gh release create` with a freshly built installer. The three-step build (`build` → `build:sidecar -- --node-exe` → `tauri build`) is in `docs/DEPLOYMENT.md` §3; the v3.2.5 artifact was verified by booting the sidecar directly and exercising the `PORT=0` / `ARGUMESH_PORT=` handshake, `/api/health`, the SPA and a static asset.

<details><summary>中文</summary>

- **第一个 GitHub Release**：[`v3.2.5`](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5) 涵盖 v3.2.4 之后的全部变更，并附带 Windows NSIS 安装包 `ArguMesh_3.2.5_x64-setup.exe`（约 29.8 MB，`currentUser` 安装，不需要管理员权限）作为可下载资产。用户于 2026-09-24 重新提出发布；`TODO.md` 中「安装包暂不发布」的暂缓就此解除，但**代码签名与 `release.yml` CI 仍未做**。发布当时 README 还没有下载章节，当日补上（见上方条目）。
- **发布说明开头写明的三条事实**（日后再加下载章节必须一并重复）：安装包里是**空库**——项目、文献、证据、AI 配置都不在里面，装完请到设置页重新填写提供方；构建**未签名**，SmartScreen 会提示发布者未知；应用**无鉴权**，不要把端口暴露到不可信网络。
- **发布流程是手工的，且有文档**：提交 → 打 tag → `gh release create` 附带新构建的安装包。三步构建见 `docs/DEPLOYMENT.md` §3；v3.2.5 的产物在发布前验证过——直接启动 sidecar，走通 `PORT=0` / `ARGUMESH_PORT=` 握手、`/api/health`、SPA 首页与静态资源。

</details>

---

## Fixes (2026-09-23) — Correctness & dead-code sweep

- **Experiment results no longer 500 after a delete**: `runNo` was allocated as `count + 1`, which collides with the `(experiment_id, run_no)` unique index once a middle result is deleted. It now takes `max(runNo) + 1`, matching `routes/ideas.ts`'s `nextVersionNo`. Covered by a new regression test (add → delete → add).
- **`hasFile` is real now**: it read `papers.r2_key`, a column nothing ever writes, so it was permanently `false` and the matrix's 打开原文 button never appeared. Both `GET /api/papers` and both matrix endpoints now derive it from the `paper_files` table. `r2_key` is annotated as an R2-era leftover.
- **Honest upload result**: `PUT /api/papers/:paperId/file` wrote the PDF into local SQLite but returned `cloudStored: true`. It now returns `false`, so the library shows 已保存到本地文献库 instead of a branch that could never render.
- **Matrix verification pane shows only real evidence**: the fabricated `Results on COCO` / `Method and analysis` headings, the two sentences of boilerplate English prose, and the hardcoded HRNet-W48 / 0.669 / 0.877 / 0.731 / 0.928 / 0.872 metric table are gone. The pane renders the cell's own `sourcePage`, `sourceSection`, `sourceExcerpt`, `claim`, `confidence` and `status`, with an explicit 尚未提取原文摘录 empty state. The single-demo `ap:ochuman` preselection branch is gone too.
- **Two dead links**: the paper page's 查看知识 pointed at `/knowledge` (no project, no `?project=` → landed on `/projects`); it now goes to the project's research thread, labelled 项目研究脉络 so its project-wide scope is distinct from the sibling 阅读 PDF. Deleting an idea from the canvas now returns through `backTo`, keeping the `?project=` filter.
- **Corrected copy**: the matrix builder and empty state promised that papers added to a project later would auto-join existing matrices; they only describe creation-time inclusion now.
- **Removed dead code**: `src/components/ai/` (271 lines: `AiHero` + `CommandPalette`, a pre-Pi design with zero SSE references), `src/hooks/useRouteContext.ts`, the unused `.ai-hero*` / `.cmdk-*` CSS, the zero-caller `getMatrix()` API helper, 6 zero-caller AI capabilities (`generatePaperCard`, `runResearchAgentTurn`, `extractMatrixPaper`, `planExtraction`, `readerTranslate`, `readerAsk`), their now-orphaned prompt constants, `services/research-agent.ts`'s `executeResearchAgentTurn` + `sanitizeCitations`, and the `convertedIdeaId` gap field (a phantom with no column — the reverse link already lives on `ideas.source_gap_id`). `routes/card.ts` now imports `CARD_SYSTEM_PROMPT` from `server/ai/prompts.ts` instead of keeping a byte-identical copy.
- **No schema migration**: every change is query- or code-level; `schema.ts` only gained comments.

<details><summary>中文</summary>

- **实验结果删除后新增不再 500**：`runNo` 原先按「当前条数 + 1」分配，删掉中间一条再新增就会撞 `(experiment_id, run_no)` 唯一索引。现在取 `max(runNo) + 1`，与 `routes/ideas.ts` 的 `nextVersionNo` 同一模式，并补了「增 → 删 → 增」回归测试。
- **`hasFile` 恢复真实**：它读的是从不写入的 `papers.r2_key`，因此恒为 `false`，矩阵里的「打开原文」按钮从来没出现过。`GET /api/papers` 与两个矩阵端点都改为查 `paper_files` 表；`r2_key` 已标注为 R2 时期遗留列。
- **上传结果不再谎报**：`PUT /api/papers/:paperId/file` 把 PDF 写进本地 SQLite，却返回 `cloudStored: true`。现在返回 `false`，文献库据此显示「已保存到本地文献库」——原先那条分支永远走不到。
- **矩阵核验区只显示真实证据**：删掉硬编码的 `Results on COCO` / `Method and analysis` 标题、两句英文样板散文，以及 HRNet-W48 / 0.669 / 0.877 / 0.731 / 0.928 / 0.872 假指标表。核验区改为呈现该单元格自己的 `sourcePage` / `sourceSection` / `sourceExcerpt` / `claim` / `confidence` / `status`，没有摘录时给出「尚未提取原文摘录」空态。单篇演示版的 `ap:ochuman` 预选分支一并移除。
- **两处死链接**：论文页的「查看知识」指向 `/knowledge`（无 projectId、无 `?project=`，最终落到 `/projects`），改为跳转本项目的研究脉络并改名「项目研究脉络」，与旁边的「阅读 PDF」（论文级）区分作用域；Idea 画布删除后改走已有的 `backTo`，保留 `?project=` 过滤。
- **文案修正**：矩阵新建弹窗与空态承诺「之后项目新增论文会自动加入矩阵」，改为只描述创建时纳入项目全部论文。
- **清理死代码**：`src/components/ai/`（271 行，Pi 之前的设计，零 SSE 引用）、`src/hooks/useRouteContext.ts`、随之失效的 `.ai-hero*` / `.cmdk-*` 样式、零调用方的 `getMatrix()` API helper、6 个零调用方 AI 能力（`generatePaperCard`、`runResearchAgentTurn`、`extractMatrixPaper`、`planExtraction`、`readerTranslate`、`readerAsk`）及其随之孤立的 prompt 常量、`services/research-agent.ts` 的 `executeResearchAgentTurn` 与 `sanitizeCitations`，以及 `convertedIdeaId` 这个没有对应列的幽灵字段（反向链接本就在 `ideas.source_gap_id` 上）。`routes/card.ts` 改为从 `server/ai/prompts.ts` 导入 `CARD_SYSTEM_PROMPT`，不再保留逐字相同的一份。
- **零数据库迁移**：全部改动都在查询与代码层，`schema.ts` 只加注释。

</details>

---

## Docs (2026-09) — Reference projects

- **Docs restructured**: root documentation is now `AGENTS.md` (agent contract) + `README.md` / `README.zh-CN.md` (product) + `DESIGN.md` (visual) + `CHANGELOG.md` (history) + `TODO.md` (progress), with `docs/PROJECT-SPEC.md`, `ARCHITECTURE.md`, `PAGE-STRUCTURE.md`, `COMPONENT-GUIDELINES.md`, `DEVELOPMENT.md`, `DEPLOYMENT.md`. The changelog moved out of the READMEs into `CHANGELOG.md`; the READMEs keep a pointer plus a documentation map. The repo URL (`github.com/Fyuan0206/ArguMesh`) is now recorded at the top of every doc. **Acknowledgments moved up** — the StepFun thanks and logo now sit right after the intro bullets, before Features, instead of near the License.
- Expanded the reference index with **[Open Science Desktop](https://github.com/ai4s-research/open-science)**, **[小绿鲸](https://www.xljsci.com/)**, and **[Agentero](https://github.com/poco-ai/agentero)** (`docs/reference-projects.md` + README tables).
- **Reader: selection bubble + on-page highlights** (borrowed from 小绿鲸): selecting PDF text opens a floating bubble at the selection — inline 划词翻译 (cached per sentence), 高亮 / 笔记 / 证据 saved as coloured marks painted onto the page. Marks are stored in PDF page units so they survive zoom, page turns, and reload; click a mark to reopen its note.
- **Reader: 双语对照 (bilingual side-by-side)**: the sidebar's 对照 tab splits the current page into ~400-character passages (lossless, deterministic) and translates them on an explicit 翻译本页 click — 3 at a time, with progress and cancel. 宽屏对照 hides the sidebar for a 55/45 PDF/translation split. Results are cached per paper + page + language in IndexedDB and re-validated against the stored source text, so a replaced PDF never shows a stale translation.
- **Library batch delete**: multi-select checkboxes on the literature list + confirm to permanently delete selected papers.

<details><summary>中文</summary>

- **文档重组**：根目录文档整理为 `AGENTS.md`（agent 协作规范）+ `README.md` / `README.zh-CN.md`（产品）+ `DESIGN.md`（视觉）+ `CHANGELOG.md`（版本历史）+ `TODO.md`（进度），`docs/` 下为 `PROJECT-SPEC.md`、`ARCHITECTURE.md`、`PAGE-STRUCTURE.md`、`COMPONENT-GUIDELINES.md`、`DEVELOPMENT.md`、`DEPLOYMENT.md`。更新记录从 README 迁出到 `CHANGELOG.md`，README 只保留入口与文档索引；仓库地址（`github.com/Fyuan0206/ArguMesh`）写入每份文档顶部。**致谢上移**——StepFun 致谢与 logo 从 License 附近移到简介要点之后、功能特性之前。
- 参考索引新增 **[Open Science Desktop](https://github.com/ai4s-research/open-science)**、**[小绿鲸](https://www.xljsci.com/)**、**[Agentero](https://github.com/poco-ai/agentero)**（`docs/reference-projects.md` 与 README 表格同步）。
- **阅读器:选区气泡 + 原文高亮**（借鉴小绿鲸）：选中 PDF 文字即在该处浮出气泡，内联划词翻译（同句命中缓存）、高亮 / 笔记 / 证据以彩色标记绘在原文上。标记按 PDF 页面单位存储，缩放、翻页、刷新后仍锚定原处；点击标记可回到侧栏批注。
- **阅读器:双语对照（左英文 / 右中文）**：右栏「对照」标签把当前页切成约 400 字符一段（无损且确定性切分），点**翻译本页**后才按每批 3 段翻译，带进度与取消；**宽屏对照**隐藏侧栏，按 55/45 分栏顺读。译文按 论文 + 页码 + 目标语言 存入本机 IndexedDB，并逐段比对原文校验——换过 PDF 不会顶出旧译文。
- **文献库批量删除**：列表多选勾选 + 确认后永久删除所选文献。

</details>

---

## v3.2.5 (2026-08) — Research Agent web search

- **`web_search` tool**: Research Agent can query a self-hosted [SearXNG](https://docs.searxng.org/) instance (`SEARXNG_BASE_URL`, optional `SEARXNG_TIMEOUT_MS`). Results are read-only external hits (not project evidence). `/api/health` reports `webSearch: searxng|off`.
- **Clearer turn disconnects**: opaque `network error` / proxy drops map to a Chinese hint; failed turns force-heal stuck `pending` assistants.

<details><summary>中文</summary>

- **`web_search` 工具**：Research Agent 可查询自托管 [SearXNG](https://docs.searxng.org/)（`SEARXNG_BASE_URL`，可选 `SEARXNG_TIMEOUT_MS`）。结果为只读外部命中（不算项目内证据）。`/api/health` 返回 `webSearch: searxng|off`。
- **断开提示更清晰**：`network error` / 代理断开映射为中文说明；失败回合会清理卡住的 `pending` 助手消息。

</details>

---

## v3.2.4 (2026-08) — Evidence → Idea loop hardening

- **Research Agent markdown**: assistant replies render GFM (headings, lists, tables, code) instead of raw plain text.
- **Research Agent errors**: failed turns show the real cause (AI / network / stream interrupt); interrupted SSE no longer leaves forever-`pending` assistants; Vite `/api` proxy flushes SSE headers.
- **Reader → Research Thread**: saving a note/evidence excerpt now persists to server knowledge (with sync retry), so insights appear on the Research Thread and are visible to the Research Agent.
- **Research Thread write surface**: "New insight" creates finding / gap / concept drafts in the project DB (not local-only).
- **Pi citations restored**: SSE turns store jumpable citations derived from completed whitelisted tool actions (no longer always `[]`).
- **Acknowledgments**: README thanks [StepFun](https://www.stepfun.com/) for model API support (`docs/stepfun-logo.png`).

<details><summary>中文</summary>

- **Research Agent Markdown**：助手回复按 GFM 渲染（标题、列表、表格、代码），不再整段纯文本。
- **Research Agent 报错**：失败回合展示真实原因（AI / 网络 / 流中断）；中断的 SSE 不再留下永久 `pending` 助手消息；Vite `/api` 代理会刷新 SSE 头。
- **阅读器 → 研究脉络**：保存笔记/证据摘录会写入服务端 knowledge（失败可重试同步），洞见会出现在研究脉络，并对 Research Agent 可见。
- **研究脉络可写**：支持「新建洞见」，在项目库中创建发现 / 缺口 / 构想草稿（不再只写本地）。
- **恢复 Pi 引用**：SSE 回合根据已完成的白名单工具动作生成可跳转 citations（不再恒为 `[]`）。
- **项目致谢**：README 感谢 [阶跃星辰 / StepFun](https://www.stepfun.com/) 提供模型 API 支持（`docs/stepfun-logo.png`）。

</details>

---

## v3.2.3 (2026-08) — Pi as Research Agent foundation

- Research Agent **always** runs on Pi `AgentSession` (SSE). No engine picker / dual path.
- Full domain whitelist as Pi tools: context + insight / RQ / experiment / ablation / result analysis / paper Diff / BibTeX / LaTeX compile.
- Coding tools remain off; writes stay drafts. Settings-page AI config is the only credential bridge.
- Conversation mode stored as `research_agent` (legacy `pi_research` / `research_orchestrator` aliases accepted on create).

<details><summary>中文</summary>

- Research Agent **始终**运行在 Pi `AgentSession`（SSE）上；无引擎切换 / 双路径。
- 完整领域白名单作为 Pi 工具：上下文 + 洞见 / RQ / 实验 / 消融 / 结果分析 / 论文 Diff / BibTeX / LaTeX 编译。
- 编程工具保持关闭；写入仍为草稿。设置页 AI 配置为唯一凭证桥接。
- 会话 mode 存为 `research_agent`（创建时仍接受旧别名 `pi_research` / `research_orchestrator`）。

</details>

---

## v3.2.2 (2026-08) — Pi multi-step Research Agent (SDK embed)

- Embedded `@earendil-works/pi-coding-agent` for multi-step tool loops (superseded as sole path in v3.2.3).
- Reuses Settings-page OpenAI-compatible config; coding tools off; draft-only writes.

<details><summary>中文</summary>

- 嵌入 `@earendil-works/pi-coding-agent` 做多步工具循环（v3.2.3 起成为唯一路径）。
- 复用设置页 OpenAI 兼容配置；关闭编程工具；写入仅草稿。

</details>

---

## v3.2.1 (2026-08) — Literature folder sync

- **`literature/` inbox**: bind a project workspace, drop PDFs into `{workspacePath}/literature/`, click **Sync `literature/`** on the library page to import into the database (hash dedup, ≤ 50 files / sync, ≤ 25 MB each). API: `POST /api/projects/:projectId/library/scan-inbox`.
- **Evidence Matrix (many papers)**: fixed column widths + horizontal scroll and sticky dimension column when a matrix has 15+ columns; verification pane stays viewport-width; **AI extract** falls back to server-stored PDFs (e.g. after `literature/` sync), batches 3 papers per request, tolerates null/overlong AI fields, and skips failed papers instead of aborting the whole run.

<details><summary>中文</summary>

- **`literature/` 收件箱**：绑定项目工作区后，将 PDF 放入 `{workspacePath}/literature/`，在文献库点击 **「同步 literature/」** 即可导入数据库（哈希去重，每次 ≤ 50 篇，单文件 ≤ 25 MB）。API：`POST /api/projects/:projectId/library/scan-inbox`。
- **证据矩阵（文献较多）**：15 篇以上时使用固定列宽 + 横向滚动 + 左侧维度列固定；下方核验区不随矩阵横向撑宽；**AI 提取**会回退读取数据库中的 PDF（如 `literature/` 同步后），按每批 3 篇提交，容忍 AI 返回 null/超长字段，单篇失败不中断整批。

</details>

---

## v3.2.0 (2026-08) — Research workbench convergence

- Navigation converged to: **AI Research Assistant → Literature → Evidence Matrix → Research Thread → Experiments → Writing**.
- **Research Thread**: insights pool (finding / contradiction / gap / concept) + research questions; legacy Knowledge / Gaps / Ideas / Questions routes redirect for bookmark compatibility.
- **Experiments**: AI main/ablation design, CSV / JSON / paste import, evidence-cited analysis (does not execute experiments); analysis can append a conclusion draft onto the linked RQ.
- **Writing**: bind a local `workspacePath`, edit `main.tex` / `references.bib`, snapshots, AI Diff review, optional Tectonic / latexmk compile + PDF preview.
- **Persistent Research Agent**: Pi `AgentSession` substrate, multi-turn domain tool loops, bounded project context, whitelist draft actions with jumpable citations (`@earendil-works/pi-coding-agent`; coding tools off).
- **Single-user local edition**: removed accounts / auth / `APP_ACCESS_TOKEN` (`accounts` and `owner_id` dropped via `scripts/migrate-custom.ts`); global AI config is a single Settings row.
- Native folder picker for registering `workspacePath`.

<details><summary>中文</summary>

- 顶层导航收敛为：**AI 研究助手 → 文献 → 证据矩阵 → 研究脉络 → 实验 → 论文写作**。
- **研究脉络**：洞见池（发现 / 矛盾 / 缺口 / 构想）+ 研究问题；旧 Knowledge / Gaps / Ideas / Questions 路由保留重定向以兼容书签。
- **实验工作台**：AI 主实验 / 消融设计、CSV / JSON / 粘贴导入、带证据引用的结果分析（不执行实验本身）；分析可将结论草稿回挂到对应 RQ。
- **论文写作**：绑定本地 `workspacePath`、编辑 `main.tex` / `references.bib`、快照、AI Diff 审阅、可选 Tectonic / latexmk 编译与 PDF 预览。
- **持久 Research Agent**：以 Pi `AgentSession` 为底座的多步领域工具循环、有界项目上下文、白名单草稿动作与可跳转引用（`@earendil-works/pi-coding-agent`；编程工具关闭）。
- **单用户本地版**：移除账户 / 鉴权 / `APP_ACCESS_TOKEN`（`accounts` 与 `owner_id` 经 `scripts/migrate-custom.ts` 删除）；AI 配置改为设置页单行全局配置。
- 原生文件夹选择器，用于登记 `workspacePath`。

</details>

---

## v0.3.0 (2026-08-23) — Research arc

- **Research Core**: `research_questions` as the spine + `rq_papers` many-to-many linking.
- **Knowledge → Gap → Idea → Experiment** chain; each object is first-class with a state machine and provenance (`source` / `model` / `generatedAt`).
- **Evidence Layers**: refine a quote through `raw → interpretation → implication`, with explicit user-triggered promotion.
- Migration `0007_last_deathbird` adds the research-arc tables. Apply with `pnpm run db:migrate` (or a fresh `db:seed`).

<details><summary>中文</summary>

- **Research Core**：以 `research_questions` 为脊柱 + `rq_papers` 多对多关联。
- **知识 → 缺口 → Idea → 实验**主链；每个对象都是一等公民，带状态机与溯源（`source` / `model` / `generatedAt`）。
- **证据分层（Evidence Layer）**：单条原文经 `raw → interpretation → implication` 逐层提炼，由用户显式触发晋升。
- 迁移 `0007_last_deathbird` 新增研究弧表；执行 `pnpm run db:migrate`（或全新 `db:seed`）应用。

</details>

---

## v0.2.0 — AI-first reshape

- Extracted `server/ai/` capability layer (`completeJson` / `completeText` + centralized prompts); routes slimmed; AI output uses Zod validation + provenance.
- Three AI entry points: Sidebar assistant trigger, ProjectHome AI Hero, Research Agent launcher.
- Per-account AI config in Settings (later collapsed to a single global row in v3.2.0), overriding env fallback.
- Reader AI (summarize / translate / ask) — selection + page + question only.
- Workflow-style sidebar: Overview / Library / Matrix / Ideas + More.

<details><summary>中文</summary>

- 抽出 `server/ai/` capability layer（`completeJson` / `completeText` + 集中 prompts）；route 瘦身；AI 输出统一 Zod 校验 + provenance。
- 三入口 AI 工作台：Sidebar「AI 助手」、ProjectHome AI Hero、Research Agent launcher。
- 账号级 AI 配置（设置页 Base URL / API Key / 模型；在 v3.2.0 收敛为单行全局配置），优于环境变量兜底。
- 阅读器划选 AI（概括、翻译、问答），只提交选中原文 + 页码 + 问题。
- 侧栏 Workflow 化：概览 / 文献 / 矩阵 / Ideas +「更多」。

</details>

---

## v0.1.0 — Foundation research workbench

- React 19 + Vite 6 frontend, Hono 4 (`@hono/node-server`) backend, local SQLite (libSQL `file:`) + Drizzle.
- Multi-user accounts (PBKDF2-SHA256 + HMAC sessions) — later removed in v3.2.0.
- Project → Literature (DOI / arXiv / URL import, batch PDF ≤ 25 MB, reading status) → Evidence Matrix (papers × dimensions, AI extraction + human verification with locking).
- PDF reader (pdf.js + OCR), selection notes, Paper Card, global search, task center.
- Migrations `0000`–`0006`: projects / papers / paper_files / project_papers / matrices / matrix_papers / dimensions / evidence_cells / extraction_jobs / accounts / ai_settings.

<details><summary>中文</summary>

- React 19 + Vite 6 前端，Hono 4（`@hono/node-server`）后端，本地 SQLite（libSQL `file:`）+ Drizzle。
- 多用户账户体系（PBKDF2-SHA256 + HMAC 会话）——已在 v3.2.0 移除。
- 项目 → 文献（DOI / arXiv / URL 导入、批量 PDF ≤ 25 MB、阅读状态）→ 证据矩阵（论文 × 维度，AI 提取 + 人工核验锁定）。
- PDF 阅读器（pdf.js + OCR）、划选笔记、Paper Card、全局搜索、任务中心。
- 迁移 `0000`–`0006`：projects / papers / paper_files / project_papers / matrices / matrix_papers / dimensions / evidence_cells / extraction_jobs / accounts / ai_settings。

</details>
