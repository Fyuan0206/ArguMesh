/**
 * 数据库迁移(单用户本地版)。
 *
 * 背景:drizzle-orm 的 libsql migrator 把所有待应用迁移批量放进一个事务执行,
 * 在 libsql 上会间歇性触发 "SQLITE_UNKNOWN_0: not an error" 并整体回滚
 * (新库只建出 1 张表)。逐条 execute() 则稳定成功。
 *
 * 因此本脚本逐条执行每条迁移语句(按 `--> statement-breakpoint` 切分),
 * 用 __drizzle_migrations 表的 hash 做幂等跟踪:
 *  - 0000-0007:从 drizzle/*.sql 文件逐条执行(跳过已应用的 hash)。
 *  - 0008(账号系统移除):逐条执行幂等语句(drop owner_id 列 / accounts 表 / 重建 ai_settings)。
 *
 * 导出 migrateDatabase() 供测试基建(helpers.ts)复用;
 * 直连运行(pnpm exec tsx scripts/migrate-custom.ts)用于迁移本地库。
 */

import { config } from "dotenv";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");

const DEFAULT_URL = "file:./data/argumesh.db";

// ─── Migration 0008:单用户本地化(移除账号系统) ───

/** 删除依赖 owner_id 的索引(必须先于 DROP COLUMN,否则 SQLite 报错并回滚)。 */
const OWNER_INDEXES = [
  "knowledge_items_owner_idx",
  "knowledge_relations_owner_idx",
  "rq_owner_idx",
  "gaps_owner_idx",
  "ideas_owner_idx",
  "idea_reviews_owner_idx",
  "experiments_owner_idx",
  "evidence_layers_owner_idx",
];

/** 带 owner_id 列的 11 张业务表。 */
const OWNER_TABLES = [
  "projects",
  "papers",
  "paper_files",
  "knowledge_items",
  "knowledge_relations",
  "research_questions",
  "gaps",
  "ideas",
  "idea_reviews",
  "experiments",
  "evidence_layers",
];

const MIGRATION_0008_HASH = "0008_drop_accounts";

async function applyMigration0008(client: Client): Promise<void> {
  // 1) 备份现有 ai_settings(迁移 0006 建的,带 FK 到 accounts;等下随 accounts 级联删除)。
  await client.execute("DROP TABLE IF EXISTS __ai_settings_backup");
  await client.execute(
    "CREATE TABLE __ai_settings_backup AS SELECT account_id, base_url, api_key, model, updated_at FROM ai_settings",
  );

  // 2) 删除依赖 owner_id 的索引。
  for (const idx of OWNER_INDEXES) {
    await client.execute(`DROP INDEX IF EXISTS ${idx}`);
  }

  // 3) 从 11 张业务表移除 owner_id 列(存在才删,幂等)。
  for (const table of OWNER_TABLES) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const hasOwner = info.rows.some((r) => (r as unknown as { name: string }).name === "owner_id");
    if (hasOwner) {
      await client.execute(`ALTER TABLE ${table} DROP COLUMN owner_id`);
    }
  }

  // 4) 删除 accounts 表 + 旧 ai_settings 表(迁移 0006 建的,FK 指向 accounts;数据已备份)。
  await client.execute("DROP TABLE IF EXISTS accounts");
  await client.execute("DROP TABLE IF EXISTS ai_settings");

  // 5) 重建 ai_settings 为全局单行(account_id 固定 'local',无 FK)。
  await client.execute(`
    CREATE TABLE ai_settings (
      account_id text PRIMARY KEY NOT NULL DEFAULT 'local',
      base_url text NOT NULL,
      api_key text NOT NULL,
      model text DEFAULT '' NOT NULL,
      updated_at text NOT NULL
    )
  `);

  // 6) 恢复 AI 配置为全局单行(account_id 归一为 'local')。
  await client.execute(
    "INSERT INTO ai_settings (account_id, base_url, api_key, model, updated_at) SELECT 'local', base_url, api_key, model, updated_at FROM __ai_settings_backup LIMIT 1",
  );

  // 7) 清理备份表。
  await client.execute("DROP TABLE IF EXISTS __ai_settings_backup");

  // 8) 登记到 __drizzle_migrations,标记 0008 已应用。
  await client.execute({
    sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: [MIGRATION_0008_HASH, 8],
  });
}


// ─── Migration 0009:项目关联本地文件夹(workspace_path) ───

const MIGRATION_0009_HASH = "0009_workspace_path";

/**
 * 为 projects 表增加 workspace_path 列(可选)。幂等:列已存在则跳过。
 * SQLite 的 ADD COLUMN 无 IF NOT EXISTS,故先查 PRAGMA table_info 判断。
 */
async function applyMigration0009(client: Client): Promise<void> {
  const info = await client.execute("PRAGMA table_info(projects)");
  const hasColumn = info.rows.some((r) => (r as unknown as { name: string }).name === "workspace_path");
  if (!hasColumn) {
    await client.execute("ALTER TABLE projects ADD COLUMN workspace_path text");
  }
  await client.execute({
    sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: [MIGRATION_0009_HASH, 9],
  });
}

// ─── Migration 0010:研究问题来源(洞见 → RQ) ───

const MIGRATION_0010_HASH = "0010_research_question_origins";

async function applyMigration0010(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS research_question_origins (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      rq_id text NOT NULL,
      origin_type text NOT NULL CHECK (origin_type IN ('knowledge', 'gap', 'idea')),
      origin_id text NOT NULL,
      created_at text NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
      FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE cascade
    )
  `);
  await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS rq_origins_origin_uniq ON research_question_origins (project_id, origin_type, origin_id)");
  await client.execute("CREATE INDEX IF NOT EXISTS rq_origins_rq_idx ON research_question_origins (rq_id)");
  await client.execute("CREATE INDEX IF NOT EXISTS rq_origins_project_idx ON research_question_origins (project_id)");
  await client.execute({
    sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: [MIGRATION_0010_HASH, 10],
  });
}

// ─── Migration 0011:实验结果导入与分析元数据 ───

const MIGRATION_0011_HASH = "0011_experiment_result_analysis";

async function applyMigration0011(client: Client): Promise<void> {
  const columns = new Map<string, string>([
    ["source_type", "text NOT NULL DEFAULT 'manual'"],
    ["source_name", "text NOT NULL DEFAULT ''"],
    ["raw_data_json", "text NOT NULL DEFAULT '{}'"],
    ["normalized_data_json", "text NOT NULL DEFAULT '[]'"],
    ["mapping_json", "text NOT NULL DEFAULT '{}'"],
    ["analysis_json", "text NOT NULL DEFAULT ''"],
    ["analysis_status", "text NOT NULL DEFAULT 'pending'"],
    ["model", "text"],
    ["generated_at", "text"],
  ]);
  const info = await client.execute("PRAGMA table_info(experiment_results)");
  const existing = new Set(info.rows.map((row) => String((row as unknown as { name: string }).name)));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) await client.execute(`ALTER TABLE experiment_results ADD COLUMN ${name} ${definition}`);
  }
  await client.execute({
    sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    args: [MIGRATION_0011_HASH, 11],
  });
}

// ─── Migration 0012:持久 Research Agent 会话 ───

const MIGRATION_0012_HASH = "0012_research_agent_conversations";

async function applyMigration0012(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      title text NOT NULL DEFAULT '新研究对话',
      mode text NOT NULL DEFAULT 'research_orchestrator',
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
      created_at text NOT NULL,
      updated_at text NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS ai_conversations_project_updated_idx ON ai_conversations (project_id, updated_at);
    CREATE TABLE IF NOT EXISTS ai_messages (
      id text PRIMARY KEY NOT NULL,
      conversation_id text NOT NULL,
      project_id text NOT NULL,
      role text NOT NULL CHECK (role IN ('user', 'assistant')),
      content text NOT NULL,
      citations_json text NOT NULL DEFAULT '[]',
      model text,
      status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
      error text NOT NULL DEFAULT '',
      created_at text NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE cascade,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx ON ai_messages (conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS ai_actions (
      id text PRIMARY KEY NOT NULL,
      conversation_id text NOT NULL,
      message_id text NOT NULL,
      project_id text NOT NULL,
      tool_name text NOT NULL,
      input_json text NOT NULL DEFAULT '{}',
      output_json text NOT NULL DEFAULT '{}',
      status text NOT NULL CHECK (status IN ('completed', 'failed', 'cancelled')),
      error text NOT NULL DEFAULT '',
      created_at text NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE cascade,
      FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE cascade,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS ai_actions_conversation_created_idx ON ai_actions (conversation_id, created_at);
  `);
  await client.execute({ sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", args: [MIGRATION_0012_HASH, 12] });
}

// ─── Migration 0013:实验分析回挂研究问题结论 ───

const MIGRATION_0013_HASH = "0013_research_question_conclusions";

async function applyMigration0013(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS research_question_conclusions (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      rq_id text NOT NULL,
      experiment_id text NOT NULL,
      result_id text NOT NULL,
      summary text NOT NULL,
      support_level text NOT NULL CHECK (support_level IN ('supports', 'partial', 'not_supported', 'insufficient')),
      limitations_json text NOT NULL DEFAULT '[]',
      source text NOT NULL DEFAULT 'ai' CHECK (source IN ('human', 'ai')),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
      model text,
      generated_at text,
      created_at text NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
      FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE cascade,
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE cascade,
      FOREIGN KEY (result_id) REFERENCES experiment_results(id) ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS rq_conclusions_rq_created_idx ON research_question_conclusions (rq_id, created_at);
    CREATE INDEX IF NOT EXISTS rq_conclusions_result_idx ON research_question_conclusions (result_id);
    CREATE INDEX IF NOT EXISTS rq_conclusions_project_idx ON research_question_conclusions (project_id);
  `);
  await client.execute({ sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", args: [MIGRATION_0013_HASH, 13] });
}

// ─── Migration 0014:研究问题直接关联原子证据 ───

const MIGRATION_0014_HASH = "0014_research_question_evidence";

async function applyMigration0014(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS research_question_evidence (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      rq_id text NOT NULL,
      knowledge_item_id text NOT NULL,
      stance text NOT NULL DEFAULT 'context' CHECK (stance IN ('supports', 'contradicts', 'context')),
      note text NOT NULL DEFAULT '',
      created_at text NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
      FOREIGN KEY (rq_id) REFERENCES research_questions(id) ON DELETE cascade,
      FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE cascade
    );
    CREATE UNIQUE INDEX IF NOT EXISTS rq_evidence_rq_item_uniq ON research_question_evidence (rq_id, knowledge_item_id);
    CREATE INDEX IF NOT EXISTS rq_evidence_project_idx ON research_question_evidence (project_id);
    CREATE INDEX IF NOT EXISTS rq_evidence_rq_idx ON research_question_evidence (rq_id);
  `);
  await client.execute({ sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", args: [MIGRATION_0014_HASH, 14] });
}

// ─── Migration runner (逐条执行) ───

/** 本地 file: 库需要 data/ 目录存在。 */
function ensureDataDir(url: string): void {
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    const dir = dirname(filePath);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  }
}

/** 按 `--> statement-breakpoint` 切分迁移文件为单条语句。 */
function splitStatements(sql: string): string[] {
  return sql
    .split(/--> statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 读取已应用的迁移 hash 集合。 */
async function getAppliedHashes(client: Client): Promise<Set<string>> {
  try {
    const result = await client.execute("SELECT hash FROM __drizzle_migrations");
    return new Set(result.rows.map((r) => String((r as unknown as { hash: string }).hash)));
  } catch {
    // __drizzle_migrations 不存在(全新库),返回空集合
    return new Set();
  }
}

/** 应用 0000-0007 的迁移文件(逐条执行,跳过已应用的 hash)。 */
async function applyMigrationFiles(client: Client, applied: Set<string>): Promise<void> {
  // 按 journal 顺序读取迁移文件(排除 0008,它由 applyMigration0008 处理)
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!existsSync(file)) continue;

    const sql = readFileSync(file, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");

    if (applied.has(hash)) continue; // 已应用,跳过

    console.log(`Applying migration ${entry.tag}...`);
    const statements = splitStatements(sql);
    for (const stmt of statements) {
      await client.execute(stmt);
    }

    // 记录 hash (使用 journal 的 idx 作为 created_at,保持与 drizzle migrator 一致)
    await client.execute({
      sql: "INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      args: [hash, entry.idx],
    });
  }
}

/**
 * 应用全部迁移(0000-0014)。
 * 幂等:多次调用安全(已应用的迁移跳过)。
 */
export async function migrateDatabase(
  url: string = process.env.DATABASE_URL ?? DEFAULT_URL,
  authToken?: string,
): Promise<void> {
  ensureDataDir(url);
  const client = createClient({ url, authToken });

  // 确保 __drizzle_migrations 表存在
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  // 1) 应用 0000-0007 迁移文件
  const applied = await getAppliedHashes(client);
  await applyMigrationFiles(client, applied);

  // 2) 应用 0008(单用户本地化)
  if (!applied.has(MIGRATION_0008_HASH)) {
    console.log("Applying migration 0008_drop_accounts...");
    await applyMigration0008(client);
  }

  // 3) 应用 0009(projects.workspace_path)
  if (!applied.has(MIGRATION_0009_HASH)) {
    console.log("Applying migration 0009_workspace_path...");
    await applyMigration0009(client);
  }

  // 4) 应用 0010(洞见提升为研究问题的来源关系)
  if (!applied.has(MIGRATION_0010_HASH)) {
    console.log("Applying migration 0010_research_question_origins...");
    await applyMigration0010(client);
  }

  // 5) 应用 0011(实验结果导入与分析元数据)
  if (!applied.has(MIGRATION_0011_HASH)) {
    console.log("Applying migration 0011_experiment_result_analysis...");
    await applyMigration0011(client);
  }

  // 6) 应用 0012(持久 Research Agent 会话、消息和动作)
  if (!applied.has(MIGRATION_0012_HASH)) {
    console.log("Applying migration 0012_research_agent_conversations...");
    await applyMigration0012(client);
  }

  // 7) 应用 0013(实验分析回挂研究问题结论)
  if (!applied.has(MIGRATION_0013_HASH)) {
    console.log("Applying migration 0013_research_question_conclusions...");
    await applyMigration0013(client);
  }

  // 8) 应用 0014(研究问题直接关联原子证据)
  if (!applied.has(MIGRATION_0014_HASH)) {
    console.log("Applying migration 0014_research_question_evidence...");
    await applyMigration0014(client);
  }

  client.close();
}

// 直接运行:迁移本地库(用 argv 判断;file:// 精确匹配在 tsx 下不可靠)。
const isMain = (process.argv[1] ?? "").replace(/\\/g, "/").toLowerCase().endsWith("migrate-custom.ts");
if (isMain) {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  console.log(`Migrating ${url} ...`);
  await migrateDatabase(url, authToken);
  console.log("Migration complete (0000-0014).");
}
