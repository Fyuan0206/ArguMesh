# ArguMesh 页面与路由结构

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

路由定义在 `src/App.tsx`。**没有登录门**——单用户本地工作台，直接进入 `/projects`。研究相关内容全部挂在项目下。

## 路由表

| 路由 | 组件 | 说明 |
| --- | --- | --- |
| `/`、`/home`、`*` | → `/projects` | 重定向 |
| `/projects` | `ProjectsPage` | 项目列表：创建、搜索、进入 |
| `/projects/:projectId` | `ProjectHomePage` | 项目首页：Research Agent + 项目概览 |
| `/projects/:projectId/library` | `LibraryPage` | 文献库：导入、阅读状态、Paper Card 入口、批量删除、`literature/` 同步 |
| `/projects/:projectId/library/:paperId` | `PaperPage` | 论文详情 |
| `/projects/:projectId/library/:paperId/read` | `ReaderPage` | **PDF 阅读器（唯一的 lazy 路由）** |
| `/projects/:projectId/matrices` | `MatricesIndexPage` | 矩阵列表 |
| `/projects/:projectId/matrices/:matrixId` | `MatrixPage` | 证据矩阵，全屏无侧栏 chrome |
| `/projects/:projectId/research` | `ResearchThreadPage` | 研究脉络：合并了 Knowledge/Gaps/Ideas/Research Questions 的子视图 |
| `/projects/:projectId/experiments` | `ExperimentsPage` | 实验：设计、导入结果、AI 分析 |
| `/projects/:projectId/writing` | `WritingPage` | LaTeX 写作 |
| `/tasks` | `TasksPage` | 任务中心：AI 任务的范围、模型、进度、取消 |
| `/search` | `SearchPage` | 跨项目全局搜索 |
| `/settings` | `SettingsPage` | AI 配置与本地数据控制 |

### 旧路由兼容

`LegacyResearchRedirect` 把它们重写进规范 URL（保留 `?project=` 查询参数的支持）：

- `/questions`、`/projects/:projectId/questions` → `…/research?view=questions`
- `/gaps`、`/ideas`、`/knowledge`、`/projects/:projectId/gaps` → `…/research?view=insights[&type=…]`

另外仍在路由表里、但不带项目前缀的：`/library`、`/matrices`、`/knowledge/matrices/:projectId`、`/experiments`、`/ideas/:ideaId/canvas`（`IdeaCanvasPage`）。

`src/pages/` 里还有**未接线的残留页面**：`KnowledgePage`、`GapsPage`、`IdeasPage`、`ResearchQuestionsPage`。为数据兼容保留的死代码，**不要扩展它们**。

## Chrome 布局

`AppShell` 按路径选容器类：

- `matrix-workspace` — 任何 `/matrices/` 详情页，全屏
- `reader-workspace` — `…/library/:paperId/read`
- `route-workspace` — 其他所有页面

侧栏在窗口宽度 ≤ 900px 时自动收起，也可通过 `paperidea:toggle-sidebar` 事件切换。

## 项目内导航顺序

侧栏跟随研究阶段：**AI 研究助手 → 文献 → 证据矩阵 → 研究脉络 → 实验 → 写作**。

## 重点页面行为

### 证据矩阵（`MatrixPage`）

论文为列 × 研究维度为行。AI 抽取给每格填上证据、置信度和来源位置（页码 + 摘录），然后由人核验：标记 原文一致 / 需要修订 / 标记冲突，对信任的格执行 确认并锁定。**锁定的格永不被批量 AI 静默覆盖**。论文较多时（如 50+）矩阵横向滚动，列宽固定，左侧维度列 sticky，用顶部搜索框过滤论文。

### PDF 阅读器（`ReaderPage`）

最重的页面，行为约束也最多：

- **划词气泡** — 选中文字后在选区位置弹出气泡，翻译 / 高亮 / 笔记 / 证据一步到位。
- **划词翻译** — 结果内联渲染在气泡里（侧栏卡片保留上次结果）。**只发送选中文字、页码和论文标题**，绝不发送整篇。重复选同一段免费（内存缓存）。单次上限 8,000 字符；超长会被**明确拒绝**而不是静默截断。这是逐段翻译器，不是整篇翻译器。
- **原文高亮 + 锚定批注** — 高亮、笔记、证据以彩色标记画在 PDF 页上，锚定到具体文字。标记按 **PDF 页面单位**存储，缩放、翻页、刷新都不移位。点标记可跳回侧栏对应笔记。
- **双语对照（左英文 / 右中文）** — 侧栏「对照」标签把**当前页**切成 ~400 字符的段落，英文在上、下方是翻译槽。**不按「翻译本页」什么都不发送**；按下后每次 3 段，带 `已完成 x / y 段` 计数和取消按钮（取消会保留并缓存已完成部分）。「宽屏对照」隐藏侧栏，PDF ≈55% / 翻译 ≈45%。翻译按「论文 + 页 + 语言」缓存在 IndexedDB，翻回读过的页即时且免费；**缓存会存每段原文并重新校验**，所以替换 PDF 绝不会显示上一篇的翻译。这是**按页**的，不是整篇：翻页后要再按一次。扫描版 PDF 会给一个行内的「OCR 本页」按钮，而不是死路。
- **存为笔记 / 主张 / 证据**时保留论文引用和页码。向 AI 提问时只发送选中文字、页码和问题。

### 研究脉络（`ResearchThreadPage`）

一个页面两个视图：**洞见**（发现、矛盾、缺口、概念——旧 Knowledge/Gap/Idea 对象的统一视图）和**研究问题**（把洞见提升为 RQ、挂证据、跟踪状态：open → investigating → evidenced → concluded）。每个 AI 草稿都保留出处（`source` / `model` / `generatedAt`），确认过的内容不被静默覆盖。

### 写作（`WritingPage`）

固定工作区 `main.tex` + `references.bib`，快照，AI Diff 提议需用户显式接受，危险 shell 命令被拦截，接受正文 Diff 可触发编译，编译问题可生成修复 Diff。可选接 Tectonic / latexmk 做真实 PDF 预览。

## 组件规范

共享 UI 的写法约定见 [`COMPONENT-GUIDELINES.md`](COMPONENT-GUIDELINES.md)。
