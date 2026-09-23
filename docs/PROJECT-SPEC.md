# ArguMesh 项目定位与产品目标

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

ArguMesh（论脉）是什么、为谁做、做到哪、以及明确不做什么。

## 定位

**ArguMesh（论脉）** — 本地优先的开源研究工作台。品牌语：*把证据连成研究脉络。*

面向研究人员、研究生和论文作者，把研究流程收进一条可追溯的链路：

```text
Literature → Evidence Matrix → Research Thread → Experiments → Writing
                              ↑                      ↓
                              └── Research Agent ────┘
```

解决的痛点：不再在 PDF 阅读器、表格、笔记 App 和聊天 AI 之间来回倒腾信息。

## 四个硬约束

1. **零云依赖** — 所有数据在一个本地 SQLite 文件里。无注册、无厂商锁定。**不要把 Cloudflare 绑定、wrangler 或 Turso 账号要求重新引进本项目**（早前的 Cloudflare 版本在 `../prototype`，是刻意拆出去的）。
2. **开箱即用** — `pnpm install && pnpm run db:seed && pnpm run dev`，无需登录。
3. **单用户** — 无账号、无鉴权、无 token。没有 `accountId`、没有归属层、没有跨账号视图，**不要重新引入**（prototype 的 `ownership.ts` 模型在这里不适用）。
4. **AI 可选** — 接任意 OpenAI 兼容端点（Base URL 以 `/anthropic` 结尾时自动走 Anthropic Messages API）。不配 AI，所有手工流程照样能用；AI 功能返回明确的「未配置」提示。

> ⚠ 默认只听 localhost 且**无鉴权**。不要把 API 端口暴露到不可信网络。要公网部署必须自己加网络限制和 HTTPS 反代（如 Caddy / Nginx）。

## 功能范围

### 项目优先的工作区

打开应用落在项目列表。项目内侧栏跟随研究阶段：**AI 研究助手 → 文献 → 证据矩阵 → 研究脉络 → 实验 → 写作**。

项目首页是一个常驻的 **Research Agent**，基于 Pi `AgentSession`（`@earendil-works/pi-coding-agent`）：多轮工具循环，带有界项目上下文（论文、矩阵、研究脉络、实验结果、论文源文件与编译状态）。领域白名单工具可以起草洞见、关联 RQ 证据、设计实验、提议论文 Diff、编译 LaTeX 等，并返回**可跳转的引用**。内置的编码工具（`bash` / `write` / `edit`）保持关闭，写入永远是草稿。

### 六个阶段

| 阶段 | 做什么 |
| --- | --- |
| **Literature** | 按 DOI / arXiv ID / URL 导入并自动取元数据，或批量上传 PDF（≤25 MB）。阅读状态、收藏、标签、按项目备注。多选批量删除。**`literature/` 文件夹同步**：项目绑定本地工作区后，把 PDF 丢进固定子文件夹即可一键导入（SHA-256 去重，≤50 文件/次，≤25 MB/个） |
| **Evidence Matrix** | 论文为列 × 研究维度为行。AI 抽取给每格填证据、置信度、来源位置（页码 + 摘录），再由人核验并锁定 |
| **Research Thread** | 一个页面两个视图：**洞见**（发现、矛盾、缺口、概念）和**研究问题**（提升洞见为 RQ、挂证据、跟踪状态） |
| **Experiments** | AI 辅助设计主实验与消融，导入 CSV / JSON / 粘贴的结果，做带证据引用的分析。**ArguMesh 不替你跑实验** |
| **Writing** | 绑定本地工作区，编辑 `main.tex` / `references.bib`，快照，AI Diff 需显式接受，可选 Tectonic / latexmk 编译出真 PDF |
| **Research Agent** | 贯穿以上所有的常驻协作者，产出可跳转引用 |

### 横向能力

- **PDF 阅读器** — OCR、划词气泡、页内高亮、锚定批注、双语对照。详见 [`PAGE-STRUCTURE.md`](PAGE-STRUCTURE.md)。
- **AI Paper Card** — Problem / Method / Data / Findings / Limitations 五字段，每字段带原文摘录。
- **全局搜索 + 任务中心** — 跨项目搜索；每个长 AI 任务显示范围、模型、进度，可取消。
- **自带 AI** — 设置页配一个 OpenAI 兼容端点；key 只存服务端，永不返回浏览器。

## 产品原则（每加一个功能都要过）

- **证据优先** — 每个 AI 研究判断必须持久化来源 / 位置 / 模型 / 时间，并把来源显著展示出来。不能只给一个「听起来像模型」的结论。
- **对象优先** — Paper、Evidence、Gap、Idea、Experiment 是一等可链接对象，不是聊天附件。
- **用户可编辑** — AI 建议，用户拥有最终内容和确认状态。
- **单用户，无租户** — 见上文硬约束 3。
- **无静默历史覆盖** — 重新生成、Idea 编辑、评审修订、LaTeX patch 都保留版本 / 快照历史。
- **锁定/确认的内容永不被批量 AI 静默覆盖** — `routes/matrix.ts` 的 PATCH 守卫。
- **外部输入不可信** — AI prompt 必须防注入；AI 输出必须过 Zod 才能落库。
- **Agent 写入受控** — 每轮最多一个白名单动作，只通过 `routes/` 处理器写入，全部记入 `ai_actions`。
- **成本可见** — 长 AI 任务显示范围、模型、进度、取消。

## 状态机

- **Paper**：待读 → 粗读 → 精读 → 已复现 → 核心文献（归档已移除——「归档」就是删除）
- **Evidence**：`draft` / `confirmed` / `conflict` / `missing`
- **Idea**：Inbox → Draft → Reviewing → Revise → Approved → Experimenting → Writing → Archived
- **Research Question**（阅读器/研究脉络页展示）：open → investigating → evidenced → concluded

## 明确不做什么

- **不执行实验** — 只帮你规划、导入、解读。
- **不承诺学术保证** — Gap 发现和新颖性判断**不是**学术意义上的保证。帮助文案必须写明能力边界。
- **不做账号 / 权限 / 多租户** — 单机单用户。
- **不接云存储** — PDF 存本地 SQLite BLOB。
- **不对外发布安装包** — 见 [`TODO.md`](../TODO.md) 的「已暂缓」一节；打包链路本身是可用的。
- **不做整篇文档翻译** — 阅读器翻译是逐段 / 按页的，且有明确字符上限。

## 参考

- 路线图与阶段计划：根目录 `ARGUMESH-RESEARCH-WORKBENCH-PLAN.md`、`FOLDER-PICKER-PLAN.md`
- 同类产品对照与可借鉴点：[`reference-projects.md`](reference-projects.md)
- 品牌识别（logo、字体、色彩）：[`brand-guidelines.md`](brand-guidelines.md)
- 视觉与交互规范：[`../DESIGN.md`](../DESIGN.md)
