# 参考项目索引

> 记录 ArguMesh 产品/架构设计时可对照的开源与商业产品。  
> 首次整理：**2026-08-27** · 增补：**2026-09-13**（Open Science Desktop / 小绿鲸 / Agentero）

| 项目 | 链接 | 一句话 |
| --- | --- | --- |
| **ARIS** | [wanshuiyin/Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) · [README_CN](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/README_CN.md) | Skill 驱动的「睡觉做科研」全流程（文献→idea→实验→写作→审稿） |
| **autoresearch** | [karpathy/autoresearch](https://github.com/karpathy/autoresearch) | 单 GPU 上 AI agent 自主跑实验、测指标、保留改进 |
| **pi-autoresearch** | [davebcn87/pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) | 把 autoresearch 循环接到 pi 终端 agent（`.auto/` 会话文件） |
| **Mimir** | [1692775560/Mimir](https://github.com/1692775560/Mimir) | DeepSeek Harness 插件：八视图研究工作台（文献·实验·写作·组会） |
| **Open Science Desktop** | [ai4s-research/open-science](https://github.com/ai4s-research/open-science) · [中文 README](https://github.com/ai4s-research/open-science/blob/master/README.zh.md) · [官网](https://openedscience.com/) | 本地优先、模型无关的 AI 科研桌面工作台（Tauri + MCP + skills；Claude Science 开源替代） |
| **小绿鲸** | [xljsci.com](https://www.xljsci.com/) | 商业英文文献阅读器：学科翻译、速读、笔记、引用与汇报 PPT（云端多端） |
| **Agentero** | [poco-ai/agentero](https://github.com/poco-ai/agentero) · [官网](https://agentero.poco-ai.com) | Agent 原生本地文献工作台：Vault + ACP BYOA + Zotero/PDF/双链笔记 |

---

## 1. ARIS（Auto-claude-code-research-in-sleep）

- **定位**：纯 Markdown skill 层的自主 ML/论文科研工作流，可在 Claude Code / Codex / Cursor / Trae 等 agent 环境运行；也可作为 `dsh-aris` 插件挂到 DeepSeek Harness。
- **核心机制**：**跨模型协作** — 执行 agent 读文件、写代码、跑实验；外部 LLM（如 Codex MCP）做评审、找弱点、建议修复；二者不评自己的作业。
- **典型能力**：`/research-lit` 文献、`/idea-creator` idea、`/experiment-bridge` 实验、`/paper-write` 写作、`/research-review` 审稿；`research_wiki` 持久化 claim/idea/experiment 节点；watchdog / iteration log 防通宵 loop 卡死。
- **与 ArguMesh 的关系**：
  - ArguMesh 是**本地 SQLite 工作台 + 结构化对象**（Paper / Evidence / RQ / Idea）；ARIS 是 **agent-first、skill 编排、无固定 DB**。
  - 可借鉴：跨模型审稿、证据-claim 分层审计、citation 验证、overnight pipeline 的状态文件与 resume 设计。
  - Mimir 在 Acknowledgments 中明确写明 workflow 灵感来自 ARIS。

---

## 2. karpathy / autoresearch

- **定位**：让 AI agent 在**固定 benchmark**（如 nanochat 单卡训练）上**自动循环**：改代码 → 跑实验 → 读指标 → keep/discard → 重复。
- **核心思想**：*Try an idea, measure it, keep what works, discard what doesn't, repeat forever.*
- **与 ArguMesh 的关系**：
  - ArguMesh **不执行**用户实验（Experiments 页负责规划、导入结果、带证据的分析）；autoresearch 侧重**代码/训练侧的自动优化 loop**。
  - 可借鉴：明确的 **metric + direction（越高/越低越好）**、baseline 对比、append-only 实验日志、会话可 resume。
  - pi-autoresearch 是其终端 agent 化实现，见下一节。

---

## 3. pi-autoresearch

- **定位**：[pi](https://pi.dev/) 的扩展 + skill，把 autoresearch 循环产品化。
- **关键文件**（项目根 `.auto/`）：

  | 文件 | 作用 |
  | --- | --- |
  | `.auto/prompt.md` | 会话目标、已尝试方案、死胡同 — 新 agent 可单独据此续跑 |
  | `.auto/measure.sh` | Benchmark 脚本，输出 `METRIC name=number` |
  | `.auto/log.jsonl` | 每次 run 的 append-only 日志 |
  | `.auto/checks.sh` | （可选）正确性回压：测试/类型检查失败则 discard |

- **工具**：`init_experiment` / `run_experiment` / `log_experiment`；`/autoresearch export` 实时 dashboard；confidence score（MAD 噪声地板）。
- **与 ArguMesh 的关系**：
  - ArguMesh 已有 **任务中心**、Research Agent **白名单动作**、实验 **结果导入 + 分析**；缺的是「改代码 → 自动 benchmark → git keep/revert」的闭环（且 OSS 版刻意不做远程 GPU 执行）。
  - 可借鉴：`.auto/` 式**可恢复会话目录**、metric 方向与 confidence、finalize 成独立 review branch。

---

## 4. Mimir（dsh-mimir）

- **定位**：`npm install` 的 **DeepSeek Harness 插件**（`dsh plugin --profile web add dsh-mimir`），单包内含八视图 Web 工作台 + agent tools + 9 个 bundled research skills。
- **视图**：Overview · Paper（LaTeX 编辑/编译/PDF）· Library（arXiv + 检索 + PDF 阅读）· Experiments · Figures · Meetings（组会 PPT）· Servers（GPU 探测/远程 job）· Ledger（成长时间线）。
- **Agent 面**：`/research-idea` `/research-plan` `/research-review` `/paper-write` `/paper-compile`；`arxiv_search` `web_search` `latex_compile` `meeting_deck` 等。
- **数据**：wiki 持久化在 `~/.dsh/storages/research_wiki.json`；产物在 `./.research`。
- **与 ArguMesh 的关系**：
  - **模块重叠度最高**：文献库、证据/实验、LaTeX 写作、Research Agent — 与 ArguMesh `Literature → Evidence → Research Thread → Experiments → Writing` 同赛道。
  - **差异**：Mimir 绑定 dsh 与 DeepSeek 生态；ArguMesh 是**零云依赖、本地 SQLite、单用户、任意 OpenAI 兼容 API**。
  - 可借鉴：Figures / Meetings 视图、Ledger 时间线、Zotero 集成思路、venue 模板与 compile-fix 一键流。

---

## 5. Open Science Desktop（ai4s-research/open-science）

- **定位**：本地优先、模型无关的 **AI 科研桌面工作台**（macOS / Windows / Linux）；开源替代 Claude Science 一类产品。站点：[openedscience.com](https://openedscience.com/)，中文说明见仓库 [`README.zh.md`](https://github.com/ai4s-research/open-science/blob/master/README.zh.md)。
- **核心机制**：Tauri 桌面壳 + MCP + agent skills；把智能体、笔记本、文件、图表、报告、运行记录与审查连成**可审计、可复现**的桌面工作流；支持 ACP 双向驱动（本应用内跑 Codex / Claude Code 等，或从 Zed 等驱动本工作台）；另有无头 `osd` CLI / 网关。
- **典型能力**：端到端科研闭环（探索→综述→实验→写作）、run record 溯源、分屏多模型会话、浏览器控制、项目级记忆、ResearchClawBench 等评测语境。
- **与 ArguMesh 的关系**：
  - 同属「本地优先科研工作台」赛道；Open Science 更偏 **agent + notebook + 可复现实验执行**，ArguMesh 更偏 **证据对象 + 矩阵核验 + 单用户 SQLite Web**。
  - 可借鉴：工件溯源 / run record、ACP 互操作、skills 包形态、无头 `osd` 驱动与网关访问。
  - **分发形态实测（2026-09-20）**：v0.5.2（2026-09-08）、1670 stars；Windows 主力资产为 NSIS `x64-setup.exe`（77.4 MB，占该版本下载量 67%），`nsis.installMode: "currentUser"` 按用户安装免管理员；Windows/Linux 未签名，仅 macOS 签名公证。**「让用户下载」的完整调研与 ArguMesh 打包路线见 [`DISTRIBUTION-RESEARCH-2026-09-20.md`](./DISTRIBUTION-RESEARCH-2026-09-20.md)。**

---

## 6. 小绿鲸（xljsci.com）

- **定位**：**商业**英文文献阅读器（桌面 / 平板 / Web 多端），面向 SCI 阅读效率：翻译、速读、笔记、管理、写作与汇报。官网：[www.xljsci.com](https://www.xljsci.com/)。
- **典型能力**：划词 / 学科 / 全文 / 截图翻译；AI 提炼要点与思维导图、图表解读、边读边问；术语库与笔记模板；题录 / 文件夹 / 标签；Word/WPS 一键引用；AI 文献汇报 PPT；参考/引证/相似文献；ISO 27001 / 27701 安全宣传。
- **与 ArguMesh 的关系**：
  - 重叠在 **阅读器体验**（翻译、划词问答、笔记、文献管理）；小绿鲸是云端产品闭环，ArguMesh 是本地证据工作台。
  - 可借鉴：学科术语翻译 UX、速读六要点、汇报 PPT 模板、引用插件与多端同步的产品预期（ArguMesh 不必照搬云端架构）。

---

## 7. Agentero（poco-ai/agentero）

- **定位**：Agent 时代的 **本地优先** 文献工作台；强调 Agent 友好 / Agent 原生的文献管理（Context is everything）。[GitHub](https://github.com/poco-ai/agentero) · [agentero.poco-ai.com](https://agentero.poco-ai.com)。
- **核心机制**：Tauri 2 + React；本地 **Vault** 为事实来源；通过 **ACP** 接入本机 Agent（BYOA，不锁定模型）；兼容 Zotero 导入/导出；内置 CLI 与 MCP。
- **典型能力**：Cool Papers / 魔搭 / RSS / 推荐导入；PDF 分屏阅读 + 划词对话 / 翻译 / 高亮；Markdown 双链笔记；Skill 安装；S3 兼容同步与 SSH 远程 Vault。
- **与 ArguMesh 的关系**：
  - 文献库 + PDF 阅读 + Agent 协作重叠高；Agentero 以 **桌面 Vault + ACP Host** 为中心，ArguMesh 以 **Web + SQLite 证据对象（Matrix / RQ / Idea）** 为中心。
  - 可借鉴：ACP BYOA、Vault/Catalog 本地事实源、Zotero 互通、划词对话与 Skill 市场形态。

---

## 对照 ArguMesh 现状（2026-09）

| 能力 | ArguMesh | ARIS | autoresearch / pi-autoresearch | Mimir | Open Science | 小绿鲸 | Agentero |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 本地优先 / 无账号 | ✅ SQLite | ✅ skill 文件 | ✅ 本地 git + `.auto/` | ⚠️ 依赖 dsh | ✅ 本地文件夹 | ❌ 云端账号 | ✅ Vault + SQLite catalog |
| 文献库 + PDF | ✅ | skill | — | ✅ Library | ✅ | ✅ 核心 | ✅ 核心 |
| 证据矩阵 + 人工核验 | ✅ 核心 | 部分（audit skills） | — | 部分 | 部分（可审计工件） | — | — |
| 实验「执行」 | ❌ 只导入/分析 | ✅ bridge/queue | ✅ 核心 | ✅ Servers | ✅ runs / Slurm 等 | — | — |
| LaTeX / 写作 | ✅ workspace | ✅ paper skills | — | ✅ Paper | ✅ 报告/写作 | 引用 + PPT | BibTeX 导出 |
| Agent 多轮 + 结构化动作 | ✅ Research Agent | ✅ 80+ skills | ✅ autoresearch loop | ✅ slash + tools | ✅ ACP + skills | AI 问答（产品内） | ✅ ACP BYOA |
| 睡觉/无人值守 pipeline | 部分（任务中心） | ✅ 核心 | ✅ 核心 | 部分 | ✅ 自主 agent / 无头 osd | — | 部分 |

---

## 本地镜像说明

- 未 vendoring 上述仓库源码；仅在本文件保留链接与摘要。小绿鲸为商业产品，无开源仓库。
- 若需离线阅读 ARIS 中文 README，可 clone 后查看仓库根目录 `README_CN.md`；Open Science 见 `README.zh.md`。
- 更新本索引时：补充「可借鉴点」与 ArguMesh 差异，并在 `README.md` / `README.zh-CN.md` 的参考项目小节加一行链接（若有对外暴露需求）。
