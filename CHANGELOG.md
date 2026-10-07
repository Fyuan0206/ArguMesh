# Changelog / 更新记录

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

ArguMesh（论脉）的版本历史。README 只保留指向本文件的入口。

**约定**：每个版本英文在前、中文在后。用户可见的功能变更必须在同一任务内追加条目（见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) 的文档规则）。

---

## Docs (2026-10-07) — Homepage content corrections

- Restored the reproduced reading status, clarified desktop-specific host features, split the reader description, and distinguished published v3.3.0 downloads from unreleased v3.3.1 source changes.
- 补全「已复现」阅读状态，明确桌面宿主能力，拆分阅读器说明，区分 v3.3.0 正式安装包与 v3.3.1 未发布源码。

## Docs (2026-10-07) — Chinese repository homepage

- Made README.md the Chinese homepage, with an English link to README.en.md. README.zh-CN.md remains available for existing links. Updated agent documentation rules for the new language layout.
- 仓库主页改为中文，英文通过 README.en.md 跳转；保留 README.zh-CN.md 兼容已有链接，并同步调整 agent 文档规则。

## Unreleased — v3.3.1 (2026-10-07) — bundled PDF parser runtime

- v3.3.1 desktop builds include an isolated Python 3.13.16 / MinerU 3.4.2 CPU runtime with locked, hash-verified dependencies. Users no longer need to install Python, MinerU or configure PATH.
- Parsing models download automatically on the first precise translation, with model-group progress, cancellation and retry. Model files and partial downloads live in user data and survive upgrades; subsequent parsing uses local models. PDFs are parsed locally; translation still sends only the active page's passages or OCR text to the configured API.
- Windows 安装包内置独立 Python / MinerU CPU 环境，用户无需额外安装或配置 PATH。首次精确翻译自动下载模型，显示模型组进度，可取消、失败后可继续；模型与下载缓存位于用户数据目录，升级后复用。解析在本机完成，翻译仍只发送当前页分段或图内 OCR 文字。
- v3.3.1 installer publication is pending. No database migration is required; existing research data and AI settings remain compatible. / v3.3.1 安装包尚未发布；无新增数据库迁移，兼容现有研究数据与 AI 配置。
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
