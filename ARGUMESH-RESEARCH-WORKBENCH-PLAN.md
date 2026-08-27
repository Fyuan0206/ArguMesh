# ArguMesh 研究工作台优化 PLAN

> 状态：主体功能与自动化验收已完成；浏览器标注对应界面已完成同视口自动视觉复核，等待用户端最终确认
>
> 目标版本：开源本地版下一阶段
>
> 更新日期：2026-08-26

## 0. 实施状态（2026-08-26）

- 已完成顶层导航收敛：文献、证据矩阵、研究脉络、实验、论文写作，并以项目级 AI 研究助手作为持续入口。
- 已完成研究脉络：研究洞见与研究问题合并在同一页面，通过子视图区分；兼容旧 Knowledge、Ideas、Gaps 与 Research Questions 数据。
- 已完成实验工作台：仅负责主实验/消融实验设计、CSV/JSON/粘贴结果导入和证据引用式分析，不运行实验；每次分析会 append-only 回挂为研究问题结论草稿。
- 已完成持久 Research Agent：保存多轮会话、装配含文献摘要、证据矩阵、研究脉络、实验结果、论文源文件和编译状态的有界项目上下文，输出可跳转引用；每回合最多执行一个结构化白名单动作，现已覆盖洞见、RQ 证据、实验/消融、结果分析、论文/BibTeX 提案与安全编译。
- 已完成 LaTeX 写作：固定工作区文件、版本冲突保护、快照、AI Diff、危险命令拦截、可选 Tectonic/latexmk 编译与真实 PDF 预览；接受正文 Diff 后自动编译，编译问题可生成新的 AI 修复 Diff。
- 当前自动化验收：82 项测试通过，`pnpm run typecheck`、`pnpm run test` 和 `pnpm run build` 均通过。核心前端路由和 API 运行时检查为 HTTP 200。已按用户标注的 1047 × 698 视口完成 Research Agent、实验工作台、AI 实验设计弹窗以及包含主实验、两项消融、真实 CSV 结果、AI 结论和行列证据的完整数据态复核；据此修正了次级/图标/表内操作按钮与结果深链接定位。用户所用内置浏览器仍需刷新确认，详见 `design-qa.md`。

## 1. 目标

把 ArguMesh 从多个相互重叠的研究对象页面，收敛为一条清晰、可由 AI 持续协作的研究链路：

```text
文献 → 证据矩阵 → 研究脉络 → 实验 → 论文写作
                       ↑          ↓
                       └── Research Agent ──┘
```

最终用户能够在一个项目中：

1. 管理和阅读文献。
2. 用证据矩阵对比论文并核验证据。
3. 将发现、矛盾、缺口和构想统一整理为研究洞见，并进一步形成研究问题。
4. 让 AI 辅助设计主实验和消融实验，导入已有实验结果并完成分析。
5. 基于项目证据、研究问题和实验结果写作论文，完成 LaTeX 编辑、编译和 PDF 预览。
6. 通过持续存在的项目 AI 对话管理上述研究资产，而不是依赖一次性命令面板。

## 2. 产品原则

### 2.1 证据优先

- AI 生成的洞见、研究问题、结果分析和论文段落必须能回到具体文献、证据矩阵单元或实验结果。
- 来源缺失时明确显示“缺少依据”，不得把推测包装成事实。
- AI 不得补造论文引用、实验指标或不存在的实验结果。

### 2.2 一个研究流程，而不是对象仓库

- 顶层导航只表达用户的研究阶段。
- 数据层可以保留不同对象，界面不再要求用户理解 Knowledge、Gap、Idea 等内部概念。
- 每个阶段都提供清晰的“下一步”，例如“提升为研究问题”“用于设计实验”“写入论文草稿”。

### 2.3 AI 自动协作，但不静默覆盖

- 读取、分析、检索项目上下文、创建新草稿可以自动执行，不设置独立审批中心。
- 已确认的证据、已完成的结果分析和论文正文不可被 AI 静默覆盖。
- 修改既有论文正文时显示 Diff，用户可以接受或撤销。
- 所有 AI 产物记录模型、生成时间、来源对象和状态。

### 2.4 本地优先

- 数据库继续使用本地 SQLite/libSQL `file:`。
- LaTeX 源文件、BibTeX 和图片存放在项目的 `workspacePath` 下。
- 不引入云端账号、远程任务执行、GPU 管理或服务端队列依赖。

### 2.5 控制首期复杂度

- 首期采用一个 Research Agent，不建设真正的多 Agent 调度系统。
- 用专家模式、限定工具和结构化输出完成分工。
- 只有独立审稿确实产生价值后，再加入有轮次上限的 Reviewer Agent。

## 3. 信息架构

### 3.1 最终项目导航

```text
AI 研究助手
概览
文献
证据矩阵
研究脉络
实验
论文写作
```

全局区域继续保留：

```text
全局搜索
任务中心（后续评估是否并入 AI 任务记录）
所有项目
设置
```

### 3.2 删除的顶层入口

以下入口不再独立显示：

- 知识
- Ideas
- 发现缺口
- 研究问题

它们不会在第一阶段直接删除数据或数据库表，而是通过“研究脉络”统一呈现，保证现有数据和旧链接可迁移。

### 3.3 研究脉络

研究脉络是一个页面，包含两个子视图：

#### 洞见池

统一展示四类内容：

| 类型 | 含义 | 典型来源 |
| --- | --- | --- |
| 发现 | 证据支持的研究判断 | 文献、证据矩阵 |
| 矛盾 | 多篇文献或结果之间不一致 | 证据矩阵、AI 对比 |
| 缺口 | 尚未被覆盖或证据不足的部分 | 文献综述、矩阵空白 |
| 构想 | 可能的解释、假设或方法方向 | 用户、AI 推演 |

洞见卡片包含：

- 标题与摘要
- 类型
- 来源与引用数量
- AI/人工来源标识
- 草稿/已确认状态
- 关联研究问题
- “提升为研究问题”动作

#### 研究问题

研究问题是经过筛选、可被验证的正式研究对象，包含：

- 问题陈述
- 研究目标
- 来源洞见
- 关联文献和证据
- 当前证据充分度
- 关联实验设计
- 状态：待研究 / 分析中 / 已有证据 / 已形成结论 / 已搁置

#### 页面关系

```text
证据或矩阵分析
   ↓
洞见（发现 / 矛盾 / 缺口 / 构想）
   ↓ 提升
研究问题
   ↓
实验设计或论文论点
```

界面提供“全部 / 洞见 / 研究问题”筛选，但避免重复的独立管理页面。

### 3.4 实验

实验模块不运行代码、不管理服务器、不启动训练任务，只负责：

```text
实验设计 + 消融设计 + 结果导入 + 结果分析
```

包含两个子视图。

#### 实验设计

一个实验设计包含：

- 关联研究问题
- 实验目标
- 核心假设
- 数据集或样本选择
- 基线与对照组
- 自变量、因变量和控制变量
- 评价指标
- 实验步骤
- 成功标准
- 风险、偏差和混杂因素
- 消融实验列表

每个消融实验包含：

- 被移除、替换或冻结的组件
- 要验证的具体假设
- 对照组
- 保持不变的条件
- 观察指标
- 预期变化（明确标为预期，不作为真实结果）

AI 可以从研究问题生成初稿，也可以检查设计是否缺少基线、控制变量、评价指标或必要消融。

#### 结果分析

支持的数据来源：

- 手工录入表格
- CSV
- JSON
- 结构化文本粘贴

AI 分析能力：

- 汇总核心指标
- 比较基线、主实验和消融组
- 计算绝对变化和相对变化
- 分析组件贡献
- 识别异常值、方差、不一致和缺失数据
- 判断结果支持、部分支持或不支持研究问题
- 生成论文表格和图表建议
- 起草 Results、Analysis 和 Limitations 内容

明确非目标：

- 不执行训练脚本
- 不启动远程任务
- 不管理 GPU 或 SSH
- 不把预测值当作实验结果
- 不自动补齐缺失指标

### 3.5 论文写作

论文写作页面采用三栏工作台：

```text
章节目录 | LaTeX 编辑器 / AI Diff | PDF 预览 / 编译问题
```

子能力包括：

1. 初始化论文目录和基础模板。
2. 编辑 `main.tex` 和 `references.bib`。
3. 解析 `section` / `subsection` 生成章节目录。
4. 调用本机 `tectonic` 或 `latexmk` 编译。
5. 解析错误与警告，跳转到对应文件和行。
6. 在项目 AI 对话中执行“撰写本节”“根据证据改写”“插入引用”“分析编译错误”。
7. 对 AI 修改显示 Diff，并支持接受、拒绝和撤销。
8. 编译成功后在右侧预览 PDF。

建议的项目目录：

```text
<workspacePath>/
  paper/
    main.tex
    references.bib
    figures/
    main.pdf
  .argumesh/
    paper-snapshots/
```

首期只支持 `main.tex`；多文件章节和期刊模板作为后续增强。

## 4. Research Agent 设计

### 4.1 架构决策

首期使用一个持久化 Research Agent：

```text
项目对话
  ↓
Research Orchestrator
  ├─ 项目上下文组装
  ├─ 专家模式选择
  ├─ 受限工具调用
  ├─ 结构化结果校验
  └─ 消息、动作和来源记录
```

不在首期引入多个并发 Agent，原因：

- 当前 ArguMesh 只有单次 Completion 服务，没有通用 Tool Loop 和持久会话。
- 多 Agent 会同时引入调度、预算、冲突合并、上下文同步和失败恢复问题。
- 当前核心任务是让一个 AI 真正理解并管理项目资产，而不是提高并行度。

### 4.2 专家模式

同一个 Agent 根据任务切换提示词和工具范围：

| 模式 | 职责 |
| --- | --- |
| Evidence Analyst | 对比文献和矩阵，提炼发现、矛盾和缺口 |
| Research Framer | 将洞见整理为可验证的研究问题 |
| Experiment Designer | 设计主实验、基线、指标和消融实验 |
| Result Analyst | 分析用户提供的真实结果并形成结论 |
| Manuscript Writer | 基于证据和结果撰写或修改论文段落 |
| LaTeX Fixer | 只处理编译问题，不改动无关学术内容 |

模式是内部路由，不需要用户手动选择。用户只需正常对话。

### 4.3 Agent 工具边界

只提供明确、类型化的领域工具，不提供任意 SQL、任意文件路径或无限制 Shell：

#### 读取工具

- `project_summary`
- `literature_list`
- `paper_read`
- `evidence_matrix_read`
- `research_thread_read`
- `experiment_design_read`
- `experiment_results_read`
- `paper_source_read`
- `latex_compile_status`

#### 写入工具

- `insight_create_draft`
- `research_question_create_draft`
- `research_question_link_evidence`
- `experiment_design_create_draft`
- `ablation_design_add`
- `result_analysis_create_draft`
- `paper_patch_propose`
- `bibliography_entry_propose`
- `latex_compile`

AI 默认只能新建草稿。已确认对象的修改必须走现有状态保护或论文 Diff。

### 4.4 会话与动作记录

建议新增：

- `ai_conversations`：项目会话、标题、模式、创建和更新时间
- `ai_messages`：角色、正文、引用、模型、消耗信息、状态
- `ai_actions`：工具名、参数摘要、结果摘要、来源、错误、创建时间

消息和动作分离，便于：

- 对话历史恢复
- 显示工具执行过程
- 失败重试
- 研究来源追溯
- 后续任务暂停和继续

首期不实现复杂任务图；一次用户消息对应一个有界 Agent 回合，并设置最大工具调用数和超时。

### 4.5 后续可选 Reviewer Agent

只有在单 Agent 稳定后再加入独立 Reviewer Agent，用于：

- 引用与证据一致性检查
- 实验设计完整性检查
- 结果结论是否过度外推
- 论文结构与论证链审阅

Reviewer 只提出问题和修改建议，不直接覆盖内容；单次审阅最多 3 轮，避免无界循环。

## 5. 关键交互

### 5.1 项目首页 / AI 对话

沿用已选择的融合方向：

- 左侧为持久对话和工具执行记录。
- 右侧为当前研究任务、阶段和项目上下文。
- 底部固定输入框。
- 对话引用可直接跳转到文献、证据、研究问题、实验或论文位置。
- 原 `CommandPalette` 的一次性动作迁入对话快捷提示，不继续作为主 AI 入口。

推荐快捷入口：

- 总结当前研究进展
- 从证据矩阵提炼洞见
- 将这条洞见转成研究问题
- 为研究问题设计实验和消融
- 分析这份实验结果
- 根据已确认结论撰写论文段落

### 5.2 洞见提升为研究问题

1. 用户或 AI 创建洞见草稿。
2. AI 显示引用证据和推理摘要。
3. 用户点击“提升为研究问题”。
4. 系统生成可编辑的问题陈述、目标和验证建议。
5. 保存研究问题并保留来源洞见关系。

### 5.3 从研究问题设计实验

1. 选择研究问题。
2. AI 读取关联证据和限制条件。
3. 生成主实验设计。
4. 生成一组有明确验证目的的消融实验。
5. 用户直接编辑并保存草稿。
6. 系统检查必填项和设计缺口。

### 5.4 导入并分析结果

1. 用户选择对应实验设计。
2. 上传 CSV/JSON 或粘贴表格。
3. 显示字段识别结果和数据预览。
4. 用户确认指标、实验组和消融组的映射。
5. 保存原始导入内容和标准化结果。
6. AI 输出分析草稿，所有数值引用到具体行/列。
7. 分析可继续用于研究问题结论和论文写作。

### 5.5 证据驱动写作

1. 在论文目录中选择章节或文本范围。
2. 向 AI 提出写作或修改要求。
3. Agent 读取研究问题、确认洞见、相关文献和实验分析。
4. 生成带引用的 LaTeX Patch。
5. 页面显示原文与新文 Diff。
6. 接受后原子写入并创建快照。
7. 自动编译；出现错误时给出定位和“AI 修复”动作。

## 6. 数据与兼容策略

### 6.1 研究脉络采用聚合视图，首期不破坏旧表

现有 `knowledge_items`、`gaps`、`ideas` 和 `research_questions` 暂时保留。

新增一个统一的 API 读模型，将旧对象映射为洞见：

| 新界面类型 | 现有来源 |
| --- | --- |
| 发现 / 矛盾 | `knowledge_items` 与 `knowledge_relations` |
| 缺口 | `gaps` |
| 构想 | `ideas` 与当前 `idea_versions` |
| 研究问题 | `research_questions` |

建议新增来源关系表，而不是复制内容：

- `research_question_origins`
  - `rq_id`
  - `origin_type`：knowledge / gap / idea
  - `origin_id`
  - `created_at`

旧路由先重定向到研究脉络对应筛选，确认无数据遗漏后再考虑删除旧 UI。

### 6.2 实验数据复用现有表

复用 `experiments` 和 `experiment_results`：

- `experiments.config_json` 改为经过 Zod 校验的实验设计结构。
- 消融实验作为 `config_json.ablations[]` 的结构化数组，首期不拆新表。
- `experiment_results` 从“运行记录”重新定义为“导入结果集”，保持 append-only。
- `repo_url`、`commit_hash`、`checkpoint_path` 暂时保留以兼容旧数据，但不在新界面突出展示。
- 页面不再显示“运行中”“第 N 次跑动”等执行语义。

推荐的实验设计 JSON：

```json
{
  "objective": "",
  "hypothesis": "",
  "datasets": [],
  "baselines": [],
  "independentVariables": [],
  "dependentVariables": [],
  "controlledVariables": [],
  "metrics": [],
  "procedure": [],
  "successCriteria": [],
  "risks": [],
  "ablations": [
    {
      "name": "",
      "change": "",
      "hypothesis": "",
      "control": "",
      "fixedConditions": [],
      "metrics": [],
      "expectedDirection": ""
    }
  ]
}
```

### 6.3 结果导入保留原始数据

建议为 `experiment_results` 增加或配套存储：

- `source_type`：manual / csv / json / pasted
- `source_name`
- `raw_data_json`
- `normalized_data_json`
- `mapping_json`
- `analysis`
- `analysis_status`
- `model`
- `generated_at`

原始数据不可被 AI 改写，标准化映射和分析可以重新生成并保留版本。

### 6.4 论文文件安全

- 所有论文路径必须由 `workspacePath` 和固定相对路径解析。
- 拒绝绝对子路径、`..` 跳出和符号链接逃逸。
- 编译使用 `execFile`，不拼接 Shell 命令。
- LaTeX 引擎只允许 `tectonic`、`latexmk` 或用户明确配置的受支持绝对路径。
- 设置编译超时、输出大小上限和取消信号。
- 保存前比较文件版本或 `mtime`，冲突时不覆盖。
- 使用临时文件 + rename 原子写入。

项目尚未设置 `workspacePath` 时，论文写作页提示选择文件夹，不在未知目录中静默创建文件。

## 7. API 草案

### 7.1 AI 会话

```text
GET    /api/projects/:projectId/ai/conversations
POST   /api/projects/:projectId/ai/conversations
GET    /api/projects/:projectId/ai/conversations/:conversationId
POST   /api/projects/:projectId/ai/conversations/:conversationId/messages
POST   /api/projects/:projectId/ai/conversations/:conversationId/cancel
```

首期可以使用普通 JSON 响应；稳定后再增加 SSE 流式消息，避免首期同时解决流式协议和 Agent 工具循环。

### 7.2 研究脉络

```text
GET    /api/projects/:projectId/research-thread
POST   /api/projects/:projectId/insights
PATCH  /api/projects/:projectId/insights/:type/:id
POST   /api/projects/:projectId/insights/:type/:id/promote
```

聚合 API 只负责统一界面模型，实际写入继续调用现有领域服务，避免重复业务规则。

### 7.3 实验设计与结果分析

```text
POST   /api/projects/:projectId/experiments/design
PATCH  /api/projects/:projectId/experiments/:experimentId/design
POST   /api/projects/:projectId/experiments/:experimentId/design-with-ai
POST   /api/projects/:projectId/experiments/:experimentId/results/import
POST   /api/projects/:projectId/experiments/:experimentId/results/:resultId/analyze
GET    /api/projects/:projectId/experiments/:experimentId/results/:resultId
```

### 7.4 论文写作

```text
POST   /api/projects/:projectId/paper/initialize
GET    /api/projects/:projectId/paper/outline
GET    /api/projects/:projectId/paper/source
PUT    /api/projects/:projectId/paper/source
POST   /api/projects/:projectId/paper/patch
GET    /api/projects/:projectId/paper/bibliography
PUT    /api/projects/:projectId/paper/bibliography
POST   /api/projects/:projectId/paper/compile
GET    /api/projects/:projectId/paper/compile-status
GET    /api/projects/:projectId/paper/pdf
GET    /api/projects/:projectId/paper/snapshots
POST   /api/projects/:projectId/paper/snapshots/:snapshotId/restore
```

## 8. 前端页面和路由草案

```text
/projects/:projectId                         项目首页 + AI 对话
/projects/:projectId/library                 文献
/projects/:projectId/matrices                证据矩阵
/projects/:projectId/research                研究脉络
/projects/:projectId/research?view=insights  洞见池
/projects/:projectId/research?view=questions 研究问题
/projects/:projectId/experiments             实验设计
/projects/:projectId/experiments/:id         设计 + 结果分析
/projects/:projectId/writing                 论文写作
```

兼容重定向：

```text
/knowledge?project=:id       → /projects/:id/research?view=insights
/ideas?project=:id           → /projects/:id/research?view=insights&type=concept
/projects/:id/gaps           → /projects/:id/research?view=insights&type=gap
/projects/:id/questions      → /projects/:id/research?view=questions
```

## 9. 实施阶段

### Phase 0：基线与迁移保护

目标：在不破坏现有用户数据和未提交修改的前提下建立开发基线。

- 补齐现有路由、表和状态机测试基线。
- 记录当前脏工作区文件，后续不覆盖无关修改。
- 确认自定义迁移脚本对新增表/列的执行方式。
- 为旧路由和已有数据准备兼容测试。

完成标准：

- 当前 typecheck、tests、build 基线有明确结果。
- 现有 Knowledge、Gap、Idea、RQ、Experiment 数据均可被新方案读取。

### Phase 1：信息架构与研究脉络

目标：先解决导航重复和对象割裂。

- 精简 Sidebar。
- 新增 `/projects/:projectId/research`。
- 建立统一研究脉络 API 读模型。
- 实现洞见池和研究问题子视图。
- 实现洞见提升为研究问题及来源关系。
- 保留旧路由重定向。

完成标准：

- 顶层只出现“研究脉络”。
- 旧 Knowledge、Gap、Idea、RQ 数据在新页面无损可见。
- 任一洞见可形成研究问题并保留来源。
- 旧书签仍可访问正确内容。

### Phase 2：实验设计与结果分析

目标：移除运行管理语义，形成设计—消融—结果分析闭环。

- 重做实验页面为“实验设计 / 结果分析”。
- 定义并校验结构化实验设计 JSON。
- AI 生成主实验与消融实验草稿。
- 支持手工、CSV、JSON 和粘贴导入。
- 保存原始数据、字段映射和标准化数据。
- AI 生成带数值引用的结果分析。
- 将结论关联回研究问题。

完成标准：

- 页面没有启动、运行、GPU、服务器或任务调度入口。
- 每个消融项都有验证假设、对照和指标。
- AI 分析中的每个数值都能定位到导入数据。
- 缺失数据不会被自动推断为真实结果。

### Phase 3：持久 AI 对话与研究工具

目标：用持续对话替换一次性 Command Palette。

- 新增会话、消息和动作表。
- 实现项目上下文组装器。
- 实现一个有界 Research Agent 回合。
- 接入研究脉络和实验工具。
- 项目首页改为对话 + 当前研究任务布局。
- 支持历史会话、新建会话、取消和失败重试。
- 引用可跳转到对应项目对象。

完成标准：

- 刷新页面后对话和动作历史仍存在。
- Agent 能读取项目资产并创建结构化草稿。
- 单回合工具数、超时和上下文大小有明确上限。
- AI 配置缺失、模型失败和工具失败都有可恢复提示。

### Phase 4：论文写作与 LaTeX

目标：完成证据驱动的写作—编译—预览闭环。

- 初始化 `paper/main.tex` 和 `references.bib`。
- 实现章节目录、编辑器和 PDF 预览。
- 自动检测 Tectonic / latexmk。
- 实现编译、错误解析、行定位和取消。
- Agent 接入论文上下文和 Patch 工具。
- 实现 Diff 接受/拒绝、原子保存和快照恢复。
- 实现引用检查和 BibTeX 基础管理。

完成标准：

- 用户可以从模板生成并编辑论文。
- 编译成功后能在页面预览 PDF。
- 编译错误能显示文件、行号和消息。
- AI 写作能引用真实项目文献与证据。
- AI 修改不静默覆盖用户正在编辑的内容。

### Phase 5：增强项（不进入首轮开发承诺）

- CVPR、NeurIPS、ACL、IEEE、ACM 等模板。
- 多文件章节编辑。
- 图片资产管理和一键插入。
- 论文引用完整性审计。
- 独立 Reviewer Agent，最多 3 轮。
- SSE 流式响应。
- 研究任务暂停和跨会话恢复。

## 10. 预计代码影响面

### 前端

- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/ai/*`
- `src/hooks/useRouteContext.ts`
- `src/pages/ProjectHomePage.tsx`
- 新增 `src/pages/ResearchThreadPage.tsx`
- 重构 `src/pages/ExperimentsPage.tsx`
- 新增 `src/pages/WritingPage.tsx`
- `src/api.ts`
- `src/styles.css`

### 后端

- `server/db/schema.ts`
- `server/index.ts`
- 新增 `server/routes/conversations.ts`
- 新增 `server/routes/researchThread.ts`
- 重构 `server/routes/experiments.ts`
- 新增 `server/routes/writing.ts`
- 新增 `server/services/research-agent.ts`
- 新增 `server/services/project-context.ts`
- 新增 `server/services/paper-files.ts`
- 新增 `server/services/latex.ts`
- 复用 `server/services/ai.ts` 和 `server/services/stepfun.ts`

### 测试

- 研究脉络聚合与兼容路由 API 测试
- 洞见提升与来源关系测试
- 实验设计 Schema、消融和结果导入测试
- AI 结构化输出与 prompt injection 防护测试
- 会话持久化和工具调用上限测试
- 工作区路径逃逸、原子写入和保存冲突测试
- LaTeX 引擎检测、超时和日志解析测试
- 关键页面 happy-dom 单元测试

## 11. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 旧 Knowledge/Gap/Idea 数据语义不一致 | 聚合后出现重复或类型模糊 | 首期保留来源类型和原对象链接，不做破坏性合并 |
| Agent 上下文过大 | 成本高、响应慢、遗漏重要证据 | 分层摘要、按任务检索、限制每类对象数量 |
| AI 返回不稳定 JSON | 写入错误或空数据 | Zod 校验、有限重试、失败不落库 |
| Prompt injection 来自论文文本 | Agent 被文献中的指令干扰 | 明确区分数据与指令，工具参数后端校验 |
| 结果字段格式不统一 | 分析错误 | 导入预览、显式字段映射、保留原始数据 |
| Windows 没有 LaTeX 引擎 | 无法编译 | 设置页检测并给出 Tectonic/TeX Live 指引；编辑功能不阻塞 |
| AI 与用户同时修改 LaTeX | 内容覆盖 | mtime/版本检查、文件锁、Diff 和原子写入 |
| 一次改动过大 | 难以验证和回滚 | 按 Phase 独立交付，每阶段保持旧数据兼容 |

## 12. 首轮开发边界

首轮建议只承诺 Phase 0 和 Phase 1：

- 精简导航。
- 建立研究脉络统一页面。
- 复用现有 Knowledge、Gap、Idea、RQ 数据。
- 完成洞见到研究问题的清晰转化。
- 为后续 Agent、实验和论文写作建立稳定对象边界。

不建议一次性同时修改 AI 会话、实验 Schema 和 LaTeX 文件系统。先把信息架构和数据语义稳定下来，后续每个阶段都能形成独立可用的增量。

## 13. 全项目完成定义

只有同时满足以下条件，才视为本轮优化完成：

1. 项目导航收敛为“文献、证据矩阵、研究脉络、实验、论文写作”。
2. AI 对话持久化，并能读取和管理当前项目的研究资产。
3. 研究脉络能够表达证据到洞见、研究问题和实验设计的关系。
4. 实验模块只负责设计、消融和真实结果分析，不承担运行任务。
5. 论文模块能够编辑、编译和预览 LaTeX，并基于真实证据辅助写作。
6. 旧数据和旧链接有兼容迁移路径。
7. 所有 AI 写入都经过结构校验，已确认内容不会被静默覆盖。
8. `pnpm run typecheck`、`pnpm run test` 和 `pnpm run build` 全部通过。

## 14. 参考实现

- DeepSeek Harness：参考项目文件夹、持续对话和工具执行界面。
  - https://github.com/deepseek-ai/deepseek-harness
- Mimir：参考论文工作台、LaTeX 编译、PDF 预览、快照和 AI 修复思路。
  - https://github.com/1692775560/dsh-Mimir-Academic-research
- pi-autoresearch：参考有界研究循环、目标/评价标准、追加式日志和失败保护；不采用无限自动运行和 Git 驱动实验。
  - https://github.com/davebcn87/pi-autoresearch

上述项目只作为产品与架构参考。ArguMesh 保持 React + Hono + SQLite 的单用户本地架构，不引入 DSH 插件运行时，也不复制远程实验执行能力。

## 15. 当前完成定义审计（2026-08-26）

| 完成定义 | 当前证据 | 结论 |
| --- | --- | --- |
| 导航收敛 | `Sidebar.tsx` 项目导航仅保留 AI 研究助手、文献、证据矩阵、研究脉络、实验、论文写作 | 已实现 |
| 持久 AI 对话管理研究资产 | 会话/消息/动作持久化；Agent 有界上下文覆盖文献、矩阵、洞见、RQ、实验结果、论文和编译状态；11 项会话 API 测试覆盖九种白名单动作 | 已实现 |
| 证据到洞见、RQ、实验的关系 | 研究脉络聚合、洞见提升来源、RQ 直接证据、RQ 实验结论与跳转链均已落库 | 已实现 |
| 实验只设计和分析 | 页面仅含 AI 主实验/消融设计、真实结果导入、行列引用分析和汇总表，无运行/GPU/SSH 控件 | 已实现 |
| LaTeX 编辑、编译、预览和证据写作 | 固定文件、版本保护、Diff、快照、真实引擎编译、PDF 服务、自动编译和修复 Diff；本机无引擎时明确显示 unavailable | 已实现 |
| 旧数据和旧链接兼容 | 聚合旧 Knowledge/Gap/Idea/RQ 表；旧 Knowledge/Ideas/Gaps/Questions 路由重定向 | 已实现 |
| AI 写入安全 | Zod 结构校验、项目归属校验、结果行列校验、草稿/提案语义、正文版本保护、危险 LaTeX 拦截、固定编译器参数 | 已实现 |
| 自动化门禁 | `pnpm run typecheck`、82 项 `pnpm run test`、`pnpm run build` 均以 0 退出；核心路由 HTTP 200 | 已实现 |
| 浏览器视觉验收 | 已根据两轮标注完成重构，并取得 1047 × 698 的 Agent、实验空态、设计弹窗和完整实验/消融/结果分析表截图；自动复核通过，用户所用内置浏览器的同实例确认仍待刷新截图 | 自动通过；待用户确认 |
