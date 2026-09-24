# TODO / 开发计划

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

ArguMesh 的当前进度、明确**不要开工**的项、已知欠账，以及 backlog 的真实位置。

> 本文件是索引与状态汇总，不是设计文档。设计意图在 [`docs/PROJECT-SPEC.md`](docs/PROJECT-SPEC.md)，实施步骤在根目录的计划文档。

## 当前状态

- **版本**：`3.2.5`（`package.json`）
- **已发布能力**：项目工作区、文献库（含 `literature/` 文件夹同步）、PDF 阅读器（OCR / 划词气泡 / 页内高亮 / 双语对照）、AI Paper Card、证据矩阵、研究脉络（洞见 + 研究问题）、实验工作台、LaTeX 写作、常驻 Research Agent（Pi `AgentSession`）、全局搜索、任务中心。
- **阶段计划**：`ARGUMESH-RESEARCH-WORKBENCH-PLAN.md` 的第 0 节记录了 2026-08-26 的实施状态，其中列出的导航收敛、研究脉络、实验工作台、Research Agent、LaTeX 写作均已完成。
- **分发**：`v3.2.5` 已发布到 [GitHub Releases](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5)，附带 Windows NSIS 安装包 `ArguMesh_3.2.5_x64-setup.exe`（2026-09-24，用户重新提出后手动发布）。安装包**未签名**、**不带数据库和 AI 配置**，这三条事实同时写在 release notes、`README` / `README.zh-CN.md` 的「下载安装」章节与 `CHANGELOG.md` 里。后续版本的发布是手工三步：提交 → 打 tag → `gh release create` 附带新构建的安装包。

## ⛔ 已暂缓 —— 不要开工

以下各项用户已明确决定推迟。**不要主动实施，不要排进待办，也不要往 README 里加对应章节**，除非用户重新提出。

| 项 | 决定时间 | 说明 |
| --- | --- | --- |
| **`.github/workflows/release.yml`** | 2026-09-22 | CI 自动出包仍未实施，v3.2.5 是本机手工构建后上传的。补齐前每次发布都要重跑 `docs/DEPLOYMENT.md` §3 的三步 |
| **代码签名** | 2026-09-22 | Windows / Linux 未签名是参考项目 Open Science Desktop 的既有做法，不是阻塞项 |

> **已解除暂缓**：~~对外发布安装包~~、~~分发路线实施~~ 与 ~~双语 README 的「下载 / 安装」章节~~ —— 用户于 2026-09-24 重新提出，`v3.2.5` 已带上 Windows 安装包发布，两份 README 也已补上「下载安装」章节（含安装包里是空库、没有代码签名、应用无鉴权这三条事实）。方案文档 [`docs/DISTRIBUTION-RESEARCH-2026-09-20.md`](docs/DISTRIBUTION-RESEARCH-2026-09-20.md) 与构建方法 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §3 保持不变，仍然有效。

## 已知欠账

| 项 | 影响 | 备注 |
| --- | --- | --- |
| `.env.example` 缺 `LATEX_ENGINE_PATH` | `server/env.ts` 会读它；`.env.example` 随安装包发布 | 一行即可补上 |
| 本 checkout **没有 CI 配置** | typecheck / test / build 全是手动门禁 | 见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| 设计 QA 的同浏览器最终确认未完成 | 自动化截图用的是 headless Edge，不是用户实际选用的内置浏览器 | 待用户提供一张刷新截图，见 [`DESIGN.md`](DESIGN.md) |
| 矩阵 / 研究脉络截图是初始进入态 | 宣传效果弱于实际能力 | P3 抛光，见 [`DESIGN.md`](DESIGN.md) |
| `build-sidecar.mjs` 注释与 `tauri.conf.json` 矛盾 | 注释写「不传则跳过（由 externalBin 提供）」，但配置里没有 `externalBin`，node.exe 实际走 `resources` | 要么改注释为「必需」，要么让脚本默认取 `process.execPath` |
| `src/pages/` 有 4 个未接线残留页面 | `KnowledgePage` / `GapsPage` / `IdeasPage` / `ResearchQuestionsPage` | 为数据兼容保留，**不要扩展** |
| **证据分层（Evidence Layers）后端就绪但无前端** | `server/routes/evidenceLayers.ts`（`/interpret` `/imply` `/promote`）与 `evidence_layers` 表都在，`src/` 里没有任何消费者 | 新功能不是缺陷修复，需单独排期。删除这行前先补 UI |
| `capabilities.ts` 的 `readerSummarize` 是唯一剩下的零调用方能力 | 没有 `POST /reader/summarize` 路由消费它 | 刻意保留：将来加概括端点时它就是对的原语。不要为「用它」而硬造路由 |
| `researchQuestionEvidence` 表没有写入口 | 只被 `researchThread.ts` 读，从不写 | 记录现状，不加接口 |
| `projects.extractionProgress` / `papers.r2Key` 是只读不写的废弃列 | 恒为 0 / 恒为空 | 已在 `schema.ts` 标注；删列需要表重建迁移，暂不做 |
| 10 个 route 没有测试文件 | `card` / `extraction` / `gaps` / `evidenceLayers` / `ideas` / `reviews` / `researchQuestions` / `library` / `papers` / `projects` | 超出修 bug 批次范围，需要时按 `tests/api/helpers.ts` 的模式补 |
| `GET /projects/:projectId/matrix` 端点零调用方 | `src/api.ts` 的 `getMatrix()` helper 已删，端点本身保留 | 与 `GET /matrices/:matrixId` 口径已对齐（进度取项目下矩阵最大值）；确认无人用后可删端点 |

## 后续可选（未排期）

-  Reviewer Agent（`ARGUMESH-RESEARCH-WORKBENCH-PLAN.md` §4.5 提到，作为可选后续）
- Bun `--compile` 探针（分发调研里记为「有希望但需 1 天验证」，随分发一起暂缓）
- 桌面壳打磨、已有安装的升级迁移路径

## Backlog 在哪里

| 内容 | 位置 |
| --- | --- |
| 当前阶段计划 | 根目录 `ARGUMESH-RESEARCH-WORKBENCH-PLAN.md` |
| 文件夹选择器计划 | 根目录 `FOLDER-PICKER-PLAN.md` |
| 共享产品基线与路线图 | `../docs/product/03-ROADMAP.md`、`../docs/product/02-PAGE-INVENTORY.md` |
| 同类产品对照 | [`docs/reference-projects.md`](docs/reference-projects.md) |
| 每次任务的影响分析 | `docs/tasks/`（**gitignored 本机草稿**，全新 clone 里没有） |

> 旧文档里提到的 `docs/product/05-CC-TODO.md` **不存在**，不要去找它——backlog 就在上表这些位置。
