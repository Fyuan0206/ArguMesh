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
