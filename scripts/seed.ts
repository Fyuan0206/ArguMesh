import "dotenv/config";
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * 全新安装入口:建表(IF NOT EXISTS)+ 演示项目(单用户本地版,无账户)。
 * 幂等可重复运行:演示数据使用固定 id(INSERT OR IGNORE)。
 * 所有迁移文件会在 __drizzle_migrations 登记为已应用,后续 schema 升级用 db:migrate。
 */

const url = process.env.DATABASE_URL ?? "file:./data/argumesh.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
// 本地文件库:确保 data/ 目录存在(libsql 不会自动建目录)。
mkdirSync("data", { recursive: true });

const client = createClient({ url, authToken });

await client.executeMultiple(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    description text,
    extraction_progress integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL,
    archived_at text,
    sort_order integer DEFAULT 0 NOT NULL,
    workspace_path text
  );
  CREATE TABLE IF NOT EXISTS papers (
    id text PRIMARY KEY NOT NULL,
    title text NOT NULL,
    short_name text NOT NULL,
    authors text DEFAULT '' NOT NULL,
    venue text NOT NULL,
    year integer NOT NULL,
    abstract text,
    doi text,
    arxiv_id text,
    source_url text,
    file_hash text,
    r2_key text,
    mime_type text,
    file_size integer,
    created_at text NOT NULL,
    reading_status text DEFAULT '待读' NOT NULL,
    favorite integer DEFAULT false NOT NULL,
    tags_json text DEFAULT '[]' NOT NULL,
    file_name text,
    page_count integer,
    outline_json text,
    archived_at text
  );
  CREATE TABLE IF NOT EXISTS project_papers (
    project_id text NOT NULL,
    paper_id text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    PRIMARY KEY (project_id, paper_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade
  );
  CREATE TABLE IF NOT EXISTS matrices (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    description text,
    extraction_progress integer DEFAULT 0 NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  );
  CREATE TABLE IF NOT EXISTS matrix_papers (
    matrix_id text NOT NULL,
    paper_id text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    PRIMARY KEY (matrix_id, paper_id),
    FOREIGN KEY (matrix_id) REFERENCES matrices(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade
  );
  CREATE TABLE IF NOT EXISTS dimensions (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    matrix_id text,
    group_key text NOT NULL,
    group_label text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS dimensions_order_idx ON dimensions (project_id, sort_order);
  CREATE INDEX IF NOT EXISTS dimensions_matrix_order_idx ON dimensions (matrix_id, sort_order);
  CREATE TABLE IF NOT EXISTS evidence_cells (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    matrix_id text,
    paper_id text NOT NULL,
    dimension_id text NOT NULL,
    value text NOT NULL,
    status text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'confirmed', 'conflict', 'missing')),
    confidence integer DEFAULT 0 NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    claim text NOT NULL,
    source_page text NOT NULL,
    source_section text NOT NULL,
    source_excerpt text NOT NULL,
    locked integer DEFAULT false NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade,
    FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE cascade
  );
  CREATE UNIQUE INDEX IF NOT EXISTS evidence_project_paper_dimension_idx
    ON evidence_cells (project_id, paper_id, dimension_id);
  CREATE INDEX IF NOT EXISTS project_papers_order_idx
    ON project_papers (project_id, sort_order);
  CREATE INDEX IF NOT EXISTS matrix_papers_order_idx
    ON matrix_papers (matrix_id, sort_order);
  CREATE TABLE IF NOT EXISTS extraction_jobs (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    matrix_id text,
    provider text NOT NULL,
    model text NOT NULL,
    status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    candidate_count integer DEFAULT 0 NOT NULL,
    plan text,
    error text,
    created_at text NOT NULL,
    completed_at text,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS extraction_jobs_project_created_idx
    ON extraction_jobs (project_id, created_at);
  CREATE TABLE IF NOT EXISTS paper_files (
    paper_id text PRIMARY KEY NOT NULL,
    data blob NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade
  );
  CREATE TABLE IF NOT EXISTS ai_settings (
    account_id text PRIMARY KEY NOT NULL DEFAULT 'local',
    base_url text NOT NULL,
    api_key text NOT NULL,
    model text DEFAULT '' NOT NULL,
    updated_at text NOT NULL
  );

  -- ═══ 研究弧(迁移 0007,v2.0):Knowledge → EvidenceLayer → Gap → Idea → Review → Experiment,以 RQ 为脊柱 ═══
  CREATE TABLE IF NOT EXISTS knowledge_items (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    paper_id text NOT NULL,
    kind text DEFAULT 'note' NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    quote text DEFAULT '' NOT NULL,
    note text DEFAULT '' NOT NULL,
    page integer DEFAULT 1 NOT NULL,
    location text,
    source text DEFAULT 'human' NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    model text,
    generated_at text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS knowledge_items_project_created_idx ON knowledge_items (project_id, created_at);
  CREATE TABLE IF NOT EXISTS knowledge_relations (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    source_id text NOT NULL,
    target_id text NOT NULL,
    type text NOT NULL,
    note text DEFAULT '' NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (source_id) REFERENCES knowledge_items(id) ON DELETE cascade,
    FOREIGN KEY (target_id) REFERENCES knowledge_items(id) ON DELETE cascade
  );
  CREATE UNIQUE INDEX IF NOT EXISTS knowledge_relations_edge_type_idx ON knowledge_relations (project_id, source_id, target_id, type);
  CREATE INDEX IF NOT EXISTS knowledge_relations_project_idx ON knowledge_relations (project_id);
  CREATE TABLE IF NOT EXISTS research_questions (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    question text NOT NULL,
    goal text DEFAULT '' NOT NULL,
    status text DEFAULT 'open' NOT NULL,
    source text DEFAULT 'human' NOT NULL,
    model text,
    generated_at text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS rq_project_created_idx ON research_questions (project_id, created_at);
  CREATE TABLE IF NOT EXISTS rq_papers (
    rq_id text NOT NULL,
    paper_id text NOT NULL,
    project_id text NOT NULL,
    role text DEFAULT 'related' NOT NULL,
    created_at text NOT NULL,
    PRIMARY KEY(rq_id, paper_id),
    FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS rq_papers_project_idx ON rq_papers (project_id);
  CREATE TABLE IF NOT EXISTS gaps (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    paper_id text,
    rq_id text,
    title text NOT NULL,
    description text DEFAULT '' NOT NULL,
    rationale text DEFAULT '' NOT NULL,
    status text DEFAULT 'candidate' NOT NULL,
    source text DEFAULT 'human' NOT NULL,
    model text,
    generated_at text,
    note text DEFAULT '' NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE set null,
    FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE set null
  );
  CREATE INDEX IF NOT EXISTS gaps_project_created_idx ON gaps (project_id, created_at);
  CREATE INDEX IF NOT EXISTS gaps_rq_idx ON gaps (rq_id);
  CREATE TABLE IF NOT EXISTS gap_evidence (
    id text PRIMARY KEY NOT NULL,
    gap_id text NOT NULL,
    knowledge_item_id text NOT NULL,
    stance text DEFAULT 'supports' NOT NULL,
    note text DEFAULT '' NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (gap_id) REFERENCES gaps(id) ON DELETE cascade,
    FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE cascade
  );
  CREATE UNIQUE INDEX IF NOT EXISTS gap_evidence_gap_item_idx ON gap_evidence (gap_id, knowledge_item_id);
  CREATE INDEX IF NOT EXISTS gap_evidence_gap_idx ON gap_evidence (gap_id);
  CREATE TABLE IF NOT EXISTS ideas (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    source_gap_id text,
    rq_id text,
    title text NOT NULL,
    summary text DEFAULT '' NOT NULL,
    status text DEFAULT 'Inbox' NOT NULL,
    current_version_id text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (source_gap_id) REFERENCES gaps(id) ON DELETE set null,
    FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE set null
  );
  CREATE INDEX IF NOT EXISTS ideas_project_created_idx ON ideas (project_id, created_at);
  CREATE INDEX IF NOT EXISTS ideas_gap_idx ON ideas (source_gap_id);
  CREATE INDEX IF NOT EXISTS ideas_rq_idx ON ideas (rq_id);
  CREATE TABLE IF NOT EXISTS idea_versions (
    id text PRIMARY KEY NOT NULL,
    idea_id text NOT NULL,
    version_no integer NOT NULL,
    title text NOT NULL,
    canvas_json text DEFAULT '{}' NOT NULL,
    summary text DEFAULT '' NOT NULL,
    rationale text DEFAULT '' NOT NULL,
    created_by text DEFAULT 'human' NOT NULL,
    model text,
    generated_at text,
    created_at text NOT NULL,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS idea_versions_idea_no_idx ON idea_versions (idea_id, version_no);
  CREATE UNIQUE INDEX IF NOT EXISTS idea_versions_idea_no_uniq ON idea_versions (idea_id, version_no);
  CREATE TABLE IF NOT EXISTS idea_evidence (
    id text PRIMARY KEY NOT NULL,
    idea_id text NOT NULL,
    knowledge_item_id text NOT NULL,
    role text DEFAULT 'supports' NOT NULL,
    note text DEFAULT '' NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE cascade,
    FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE cascade
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idea_evidence_idea_item_idx ON idea_evidence (idea_id, knowledge_item_id);
  CREATE INDEX IF NOT EXISTS idea_evidence_idea_idx ON idea_evidence (idea_id);
  CREATE TABLE IF NOT EXISTS idea_reviews (
    id text PRIMARY KEY NOT NULL,
    idea_id text NOT NULL,
    reviewer text NOT NULL,
    verdict text DEFAULT 'viable' NOT NULL,
    strengths text DEFAULT '' NOT NULL,
    weaknesses text DEFAULT '' NOT NULL,
    risks text DEFAULT '' NOT NULL,
    suggestions_json text DEFAULT '[]' NOT NULL,
    source text DEFAULT 'human' NOT NULL,
    model text,
    generated_at text,
    reviewed_version_id text,
    revised_version_id text,
    status text DEFAULT 'open' NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE cascade,
    FOREIGN KEY (reviewed_version_id) REFERENCES idea_versions(id) ON DELETE set null,
    FOREIGN KEY (revised_version_id) REFERENCES idea_versions(id) ON DELETE set null
  );
  CREATE INDEX IF NOT EXISTS idea_reviews_idea_created_idx ON idea_reviews (idea_id, created_at);
  CREATE TABLE IF NOT EXISTS experiments (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    idea_id text,
    rq_id text,
    title text NOT NULL,
    hypothesis text DEFAULT '' NOT NULL,
    config_json text DEFAULT '{}' NOT NULL,
    repo_url text DEFAULT '' NOT NULL,
    commit_hash text DEFAULT '' NOT NULL,
    checkpoint_path text DEFAULT '' NOT NULL,
    status text DEFAULT 'planned' NOT NULL,
    conclusion text DEFAULT '' NOT NULL,
    source text DEFAULT 'human' NOT NULL,
    model text,
    generated_at text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE set null,
    FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE set null
  );
  CREATE INDEX IF NOT EXISTS experiments_project_created_idx ON experiments (project_id, created_at);
  CREATE INDEX IF NOT EXISTS experiments_idea_idx ON experiments (idea_id);
  CREATE INDEX IF NOT EXISTS experiments_rq_idx ON experiments (rq_id);
  CREATE TABLE IF NOT EXISTS experiment_results (
    id text PRIMARY KEY NOT NULL,
    experiment_id text NOT NULL,
    run_no integer NOT NULL,
    metrics_json text DEFAULT '{}' NOT NULL,
    figures_json text DEFAULT '[]' NOT NULL,
    notes text DEFAULT '' NOT NULL,
    created_at text NOT NULL,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS experiment_results_exp_idx ON experiment_results (experiment_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS experiment_results_exp_run_uniq ON experiment_results (experiment_id, run_no);
  CREATE TABLE IF NOT EXISTS evidence_layers (
    id text PRIMARY KEY NOT NULL,
    project_id text NOT NULL,
    paper_id text NOT NULL,
    knowledge_item_id text,
    parent_id text,
    level text DEFAULT 'raw' NOT NULL,
    content text NOT NULL,
    quote text DEFAULT '' NOT NULL,
    page integer DEFAULT 1 NOT NULL,
    location text,
    status text DEFAULT 'draft' NOT NULL,
    promoted_to text,
    source text DEFAULT 'human' NOT NULL,
    model text,
    generated_at text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE cascade,
    FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE cascade
  );
  CREATE INDEX IF NOT EXISTS evidence_layers_project_created_idx ON evidence_layers (project_id, created_at);
  CREATE INDEX IF NOT EXISTS evidence_layers_knowledge_idx ON evidence_layers (knowledge_item_id);
  CREATE INDEX IF NOT EXISTS evidence_layers_parent_idx ON evidence_layers (parent_id);
`);

const now = new Date().toISOString();

// --- 演示项目(固定 id,幂等)---
const projectId = "demo-occluded-pose";
await client.execute({
  sql: "INSERT OR IGNORE INTO projects (id, name, description, extraction_progress, created_at, sort_order) VALUES (?, ?, ?, 0, ?, 0)",
  args: [projectId, "示例项目:遮挡姿态估计", "演示数据,展示「项目 → 文献 → 证据矩阵」完整流程。全部论文为占位示例,请替换为真实文献后使用。", now],
});

const demoPapers = [
  { id: "demo-paper-1", title: "示例论文 1:遮挡场景下的人体姿态估计研究综述", shortName: "示例论文 1", authors: "示例作者 A 等", venue: "示例期刊(演示数据)", year: 2024 },
  { id: "demo-paper-2", title: "示例论文 2:基于图卷积的多人姿态回归方法", shortName: "示例论文 2", authors: "示例作者 B 等", venue: "示例会议(演示数据)", year: 2023 },
  { id: "demo-paper-3", title: "示例论文 3:自监督关键点补全与遮挡推理", shortName: "示例论文 3", authors: "示例作者 C 等", venue: "示例期刊(演示数据)", year: 2025 },
  { id: "demo-paper-4", title: "示例论文 4:轻量化姿态估计模型的边缘部署实践", shortName: "示例论文 4", authors: "示例作者 D 等", venue: "示例工作坊(演示数据)", year: 2022 },
  { id: "demo-paper-5", title: "示例论文 5:面向拥挤场景的多人姿态基准与误差分析", shortName: "示例论文 5", authors: "示例作者 E 等", venue: "示例会议(演示数据)", year: 2024 },
];
for (const [index, paper] of demoPapers.entries()) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO papers (id, title, short_name, authors, venue, year, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [paper.id, paper.title, paper.shortName, paper.authors, paper.venue, paper.year, now],
  });
  await client.execute({
    sql: "INSERT OR IGNORE INTO project_papers (project_id, paper_id, sort_order) VALUES (?, ?, ?)",
    args: [projectId, paper.id, index],
  });
}

const demoDimensions = [
  { id: "demo-dim-1", groupKey: "research", groupLabel: "研究问题", label: "解决的核心问题" },
  { id: "demo-dim-2", groupKey: "research", groupLabel: "研究问题", label: "与既有方法的差异" },
  { id: "demo-dim-3", groupKey: "method", groupLabel: "方法", label: "模型/方法架构" },
  { id: "demo-dim-4", groupKey: "method", groupLabel: "方法", label: "训练数据与实验设置" },
  { id: "demo-dim-5", groupKey: "evidence", groupLabel: "证据", label: "主要实验结果" },
  { id: "demo-dim-6", groupKey: "evidence", groupLabel: "证据", label: "局限性与失败案例" },
  { id: "demo-dim-7", groupKey: "gap", groupLabel: "研究空白", label: "可复现性与开源资源" },
];
for (const [index, dimension] of demoDimensions.entries()) {
  await client.execute({
    sql: "INSERT OR IGNORE INTO dimensions (id, project_id, group_key, group_label, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
    args: [dimension.id, projectId, dimension.groupKey, dimension.groupLabel, dimension.label, index],
  });
  for (const paper of demoPapers) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO evidence_cells (id, project_id, paper_id, dimension_id, value, status, confidence, claim, source_page, source_section, source_excerpt, locked, updated_at)
            VALUES (?, ?, ?, ?, '待提取', 'draft', 0, '尚未从论文原文中提取该维度(演示数据,可运行 AI 提取或手动填写)。', '—', '待提取', '', 0, ?)`,
      args: [`${projectId}:${dimension.id}:${paper.id}`, projectId, paper.id, dimension.id, now],
    });
  }
}
console.log("已确保演示项目(5 篇示例论文 × 7 个研究维度)。");

// --- 把全部迁移登记为已应用(避免 seed 建表后 db:migrate 重复执行历史迁移)---
await client.execute(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash text NOT NULL,
    created_at numeric
  );
`);
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{ idx: number; when: number; tag: string }>;
};
for (const entry of journal.entries) {
  const sql = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
  const migrationHash = createHash("sha256").update(sql).digest("hex");
  await client.execute({
    sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: [migrationHash, entry.when],
  });
}
console.log(`已登记 ${journal.entries.length} 个 Drizzle 迁移。`);

client.close();
console.log("种子完成:演示项目 demo-occluded-pose。运行 pnpm run dev 即可开始使用。");
