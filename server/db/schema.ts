import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  extractionProgress: integer("extraction_progress").notNull().default(0),
  createdAt: text("created_at").notNull(),
  archivedAt: text("archived_at"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const papers = sqliteTable("papers", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  shortName: text("short_name").notNull(),
  authors: text("authors").notNull().default(""),
  venue: text("venue").notNull(),
  year: integer("year").notNull(),
  abstract: text("abstract"),
  doi: text("doi"),
  arxivId: text("arxiv_id"),
  sourceUrl: text("source_url"),
  fileHash: text("file_hash"),
  r2Key: text("r2_key"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  createdAt: text("created_at").notNull(),
  // 项目/文献管理 CRUD 新增字段
  readingStatus: text("reading_status").notNull().default("待读"),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  tagsJson: text("tags_json").notNull().default("[]"),
  fileName: text("file_name"),
  pageCount: integer("page_count"),
  outlineJson: text("outline_json"),
  archivedAt: text("archived_at"),
});

/** PDF 文件本体:存储在 Turso 数据库内(替代 R2;每篇论文至多一行,随论文级联删除)。 */
export const paperFiles = sqliteTable("paper_files", {
  paperId: text("paper_id").primaryKey().references(() => papers.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  data: blob("data", { mode: "buffer" }).$type<Uint8Array>().notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectPapers = sqliteTable(
  "project_papers",
  {
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.paperId] }),
    index("project_papers_order_idx").on(table.projectId, table.sortOrder),
  ],
);

export const matrices = sqliteTable(
  "matrices",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    extractionProgress: integer("extraction_progress").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("matrices_project_created_idx").on(table.projectId, table.createdAt)],
);

export const matrixPapers = sqliteTable(
  "matrix_papers",
  {
    matrixId: text("matrix_id").notNull().references(() => matrices.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.matrixId, table.paperId] }),
    index("matrix_papers_order_idx").on(table.matrixId, table.sortOrder),
  ],
);

export const dimensions = sqliteTable(
  "dimensions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    matrixId: text("matrix_id"),
    groupKey: text("group_key").notNull(),
    groupLabel: text("group_label").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("dimensions_order_idx").on(table.projectId, table.sortOrder), index("dimensions_matrix_order_idx").on(table.matrixId, table.sortOrder)],
);

export const evidenceCells = sqliteTable(
  "evidence_cells",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    matrixId: text("matrix_id"),
    paperId: text("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
    dimensionId: text("dimension_id").notNull().references(() => dimensions.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    status: text("status", { enum: ["draft", "confirmed", "conflict", "missing"] }).notNull().default("draft"),
    confidence: integer("confidence").notNull().default(0),
    claim: text("claim").notNull(),
    sourcePage: text("source_page").notNull(),
    sourceSection: text("source_section").notNull(),
    sourceExcerpt: text("source_excerpt").notNull(),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("evidence_project_paper_dimension_idx").on(table.projectId, table.paperId, table.dimensionId),
  ],
);

export const extractionJobs = sqliteTable(
  "extraction_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    matrixId: text("matrix_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    plan: text("plan"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [index("extraction_jobs_project_created_idx").on(table.projectId, table.createdAt)],
);

/** 登录账户:默认种子 admin/admin123(管理员),admin 可通过 /api/users 管理其他账户。 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "researcher"] }).notNull().default("researcher"),
  createdAt: text("created_at").notNull(),
});

/** 账户级 AI 配置:设置页表单填写(Base URL / API Key / 模型名称),优先于环境变量里的厂商配置。 */
export const aiSettings = sqliteTable("ai_settings", {
  accountId: text("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  model: text("model").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

// ═══════════════════════════════════════════════════════════════════════
// 研究弧(Research Arc,迁移 0007,v2.0):Knowledge → EvidenceLayer → Gap → Idea → Review → Experiment,
// 以 ResearchQuestion 为脊柱(迁移 0013)。port 自 prototype/ Cloudflare 版。
// ═══════════════════════════════════════════════════════════════════════

/**
 * 知识对象(迁移 0007):Knowledge 一等对象。把原来只存在前端 localStorage 的
 * notes / claims / evidence 持久化到数据库,并承载 AI 提炼结果。
 * - Atomic Evidence:页面级原子证据(本表 kind=evidence),与 evidence_cells(矩阵格)是不同粒度,不合并。
 * - provenance 是硬约束:quote=原文、content=AI/人工整理后内容(二者分离)、page、model、generatedAt、
 *   source(ai/human)、status(draft/confirmed)。AI 提炼由后端直接插 draft,前端无法伪造来源。
 * - ownerId 存归属账号(普通字符串,无 FK 耦合降低改动风险);paperId/projectId 走外键级联。
 */
export const knowledgeItems = sqliteTable(
  "knowledge_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["note", "claim", "evidence"] }).notNull().default("note"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    quote: text("quote").notNull().default(""),
    note: text("note").notNull().default(""),
    page: integer("page").notNull().default(1),
    location: text("location"),
    source: text("source", { enum: ["human", "ai"] }).notNull().default("human"),
    status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
    model: text("model"),
    generatedAt: text("generated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("knowledge_items_project_created_idx").on(table.projectId, table.createdAt),
    index("knowledge_items_owner_idx").on(table.ownerId),
  ],
);

/**
 * 知识关系(迁移 0008):两条 knowledge_items 之间的语义关联。
 * - type:supports(支撑)/contradicts(矛盾)/duplicates(重复)。三者对称,故规范化端点(sourceId<targetId),
 *   去重由唯一索引 (projectId, sourceId, targetId, type) 兜底(任一方向插入都命中同一条)。
 * - 两端外键级联:删掉任一条知识对象,其关系自动清除。
 */
export const knowledgeRelations = sqliteTable(
  "knowledge_relations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    targetId: text("target_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["supports", "contradicts", "duplicates"] }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_relations_edge_type_idx").on(table.projectId, table.sourceId, table.targetId, table.type),
    index("knowledge_relations_project_idx").on(table.projectId),
  ],
);

/**
 * 研究问题(迁移 0013,v2.0 Research Core):Research Question 一等对象。
 * 把 Project 从"文件夹"升级为"以问题为中心的研究":RQ 是脊柱,
 * Paper → Evidence → Gap → Idea 都挂到它上面。
 * - 状态机:open(提出)→ investigating(调研中)→ evidenced(证据充分)→ concluded(已结论)
 *   或任一阶段 → abandoned(已搁置)。
 * - provenance:source(human/ai)、model、generatedAt。ownerId 存归属账号;projectId 走外键级联。
 */
export const researchQuestions = sqliteTable(
  "research_questions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    goal: text("goal").notNull().default(""),
    status: text("status", { enum: ["open", "investigating", "evidenced", "concluded", "abandoned"] }).notNull().default("open"),
    source: text("source", { enum: ["human", "ai"] }).notNull().default("human"),
    model: text("model"),
    generatedAt: text("generated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("rq_project_created_idx").on(table.projectId, table.createdAt),
    index("rq_owner_idx").on(table.ownerId),
  ],
);

/** RQ ↔ Paper 多对多关联(迁移 0013):一个研究问题可关联多篇论文,一篇论文也可服务于多个问题。 */
export const rqPapers = sqliteTable(
  "rq_papers",
  {
    rqId: text("rq_id").notNull().references(() => researchQuestions.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("related"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.rqId, table.paperId] }),
    index("rq_papers_project_idx").on(table.projectId),
  ],
);

/**
 * 研究缺口(迁移 0009):Gap 一等对象。
 * - 状态机:candidate(候选)→ searching(补充检索)→ evidenced(证据充分)→ converted(已转 Idea)
 *   或任一阶段 → rejected(已否决)。
 * - provenance:source(human/ai)、model、generatedAt;AI Gap Discovery 由后端直接插 draft。
 */
export const gaps = sqliteTable(
  "gaps",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    paperId: text("paper_id").references(() => papers.id, { onDelete: "set null" }),
    rqId: text("rq_id").references(() => researchQuestions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    status: text("status", { enum: ["candidate", "searching", "evidenced", "converted", "rejected"] }).notNull().default("candidate"),
    source: text("source", { enum: ["human", "ai"] }).notNull().default("human"),
    model: text("model"),
    generatedAt: text("generated_at"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("gaps_project_created_idx").on(table.projectId, table.createdAt),
    index("gaps_owner_idx").on(table.ownerId),
    index("gaps_rq_idx").on(table.rqId),
  ],
);

/** 缺口与证据的关联(迁移 0009):一条缺口可挂多条 knowledge_items 作为支撑/反驳/上下文证据。 */
export const gapEvidence = sqliteTable(
  "gap_evidence",
  {
    id: text("id").primaryKey(),
    gapId: text("gap_id").notNull().references(() => gaps.id, { onDelete: "cascade" }),
    knowledgeItemId: text("knowledge_item_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    stance: text("stance", { enum: ["supports", "contradicts", "context"] }).notNull().default("supports"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("gap_evidence_gap_item_idx").on(table.gapId, table.knowledgeItemId),
    index("gap_evidence_gap_idx").on(table.gapId),
  ],
);

/**
 * Idea 一等对象(迁移 0010):研究想法。Idea 围绕 Version 设计(C7):每一次人工修改/AI 生成/review revise
 * 都落新的 idea_versions 行,从不在原版上覆盖;本表只保留指向「当前版本」的指针 currentVersionId。
 * - 状态机:Inbox → Draft → Reviewing → Revise → Approved → Experimenting → Writing → Archived。
 * - provenance:sourceGapId(由缺口转换而来,可空)、currentVersionId(指向当前版本)。
 */
export const ideas = sqliteTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sourceGapId: text("source_gap_id").references(() => gaps.id, { onDelete: "set null" }),
    rqId: text("rq_id").references(() => researchQuestions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status", {
      enum: ["Inbox", "Draft", "Reviewing", "Revise", "Approved", "Experimenting", "Writing", "Archived"],
    }).notNull().default("Inbox"),
    currentVersionId: text("current_version_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("ideas_project_created_idx").on(table.projectId, table.createdAt),
    index("ideas_owner_idx").on(table.ownerId),
    index("ideas_gap_idx").on(table.sourceGapId),
    index("ideas_rq_idx").on(table.rqId),
  ],
);

/** Idea 版本链(迁移 0010):Idea 的每一次演化都是一条不可变快照(C7 —— 不覆盖旧版)。 */
export const ideaVersions = sqliteTable(
  "idea_versions",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    title: text("title").notNull(),
    canvasJson: text("canvas_json").notNull().default("{}"),
    summary: text("summary").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    createdBy: text("created_by", { enum: ["human", "ai"] }).notNull().default("human"),
    model: text("model"),
    generatedAt: text("generated_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idea_versions_idea_no_idx").on(table.ideaId, table.versionNo),
    uniqueIndex("idea_versions_idea_no_uniq").on(table.ideaId, table.versionNo),
  ],
);

/** Idea 关联的知识证据(迁移 0010):一个 Idea 版本可挂多条 knowledge_items 作为支撑证据。 */
export const ideaEvidence = sqliteTable(
  "idea_evidence",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    knowledgeItemId: text("knowledge_item_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["supports", "contradicts", "context"] }).notNull().default("supports"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idea_evidence_idea_item_idx").on(table.ideaId, table.knowledgeItemId),
    index("idea_evidence_idea_idx").on(table.ideaId),
  ],
);

/**
 * Idea 评审(迁移 0012):对某 Idea 当前版本的一次评审。
 * - verdict:整体判断(strong/viable/weak/reject)。
 * - suggestionsJson:结构化建议列表 JSON(每条 {id, target, issue, suggestion, priority})。
 * - reviewedVersionId:被评审的版本;revisedVersionId:采纳建议后落地的新版本(可空)。
 * - source:human|ai;ai 时 model + generatedAt 必填(provenance)。
 */
export const ideaReviews = sqliteTable(
  "idea_reviews",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    ideaId: text("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    reviewer: text("reviewer").notNull(),
    verdict: text("verdict", { enum: ["strong", "viable", "weak", "reject"] }).notNull().default("viable"),
    strengths: text("strengths").notNull().default(""),
    weaknesses: text("weaknesses").notNull().default(""),
    risks: text("risks").notNull().default(""),
    suggestionsJson: text("suggestions_json").notNull().default("[]"),
    source: text("source", { enum: ["human", "ai"] }).notNull().default("human"),
    model: text("model"),
    generatedAt: text("generated_at"),
    reviewedVersionId: text("reviewed_version_id").references(() => ideaVersions.id, { onDelete: "set null" }),
    revisedVersionId: text("revised_version_id").references(() => ideaVersions.id, { onDelete: "set null" }),
    status: text("status", { enum: ["open", "applied", "dismissed"] }).notNull().default("open"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idea_reviews_idea_created_idx").on(table.ideaId, table.createdAt),
    index("idea_reviews_owner_idx").on(table.ownerId),
  ],
);

/**
 * 实验(迁移 0014,v2.0 Research Core):把 Idea 落到可执行的实验方案。
 * - ideaId 可空 FK(set null):实验可独立于某个 Idea。
 * - configJson 存数据集/基线/指标/超参等结构化配置(JSON 文本)。
 * - 状态机:planned → running → done | failed;done/failed 后写 conclusion。
 */
export const experiments = sqliteTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    ideaId: text("idea_id").references(() => ideas.id, { onDelete: "set null" }),
    rqId: text("rq_id").references(() => researchQuestions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    hypothesis: text("hypothesis").notNull().default(""),
    configJson: text("config_json").notNull().default("{}"),
    repoUrl: text("repo_url").notNull().default(""),
    commitHash: text("commit_hash").notNull().default(""),
    checkpointPath: text("checkpoint_path").notNull().default(""),
    status: text("status", { enum: ["planned", "running", "done", "failed"] }).notNull().default("planned"),
    conclusion: text("conclusion").notNull().default(""),
    source: text("source", { enum: ["human", "ai"] }).notNull().default("human"),
    model: text("model"),
    generatedAt: text("generated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("experiments_project_created_idx").on(table.projectId, table.createdAt),
    index("experiments_owner_idx").on(table.ownerId),
    index("experiments_idea_idx").on(table.ideaId),
    index("experiments_rq_idx").on(table.rqId),
  ],
);

/**
 * 实验结果(迁移 0014):一次实验可多次跑动,每次一条 append-only 记录(C7 —— 不覆盖旧结果)。
 * - metricsJson:数值指标 JSON(如 {AP, mAP});figuresJson:图/表路径或描述 JSON。
 */
export const experimentResults = sqliteTable(
  "experiment_results",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
    runNo: integer("run_no").notNull(),
    metricsJson: text("metrics_json").notNull().default("{}"),
    figuresJson: text("figures_json").notNull().default("[]"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("experiment_results_exp_idx").on(table.experimentId, table.createdAt),
    uniqueIndex("experiment_results_exp_run_uniq").on(table.experimentId, table.runNo),
  ],
);

/**
 * 证据分层(迁移 0015):把单条知识证据拆成 raw(quote 原文) → interpretation(理解) → implication(研究启发) 三层。
 * - parentId:纯 text 列(非 FK)—— 层可独立存在也可按 parentId 串链;悬挂引用由 route 层归属校验防住。
 * - status:draft/confirmed(confirmed 需用户确认;AI 生成的层默认 draft,对齐 "AI vs human 分离")。
 * - promotedTo(迁移 0016):晋升到 knowledge/gap/idea 后的目标指针,避免重复晋升。
 * - provenance:source(human/ai)、model、generatedAt。
 */
export const evidenceLayers = sqliteTable(
  "evidence_layers",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    paperId: text("paper_id").notNull().references(() => papers.id, { onDelete: "cascade" }),
    knowledgeItemId: text("knowledge_item_id").references(() => knowledgeItems.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    level: text("level", { enum: ["raw", "interpretation", "implication"] }).notNull().default("raw"),
    content: text("content").notNull(),
    quote: text("quote").notNull().default(""),
    page: integer("page").notNull().default(1),
    location: text("location"),
    status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
    promotedTo: text("promoted_to"),
    source: text("source", { enum: ["human", "ai"] }).notNull().default("human"),
    model: text("model"),
    generatedAt: text("generated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("evidence_layers_project_created_idx").on(table.projectId, table.createdAt),
    index("evidence_layers_owner_idx").on(table.ownerId),
    index("evidence_layers_knowledge_idx").on(table.knowledgeItemId),
    index("evidence_layers_parent_idx").on(table.parentId),
  ],
);
