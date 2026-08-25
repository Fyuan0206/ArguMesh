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
 * 应用全部迁移(0000-0009)。
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

  client.close();
}

// 直接运行:迁移本地库(用 argv 判断;file:// 精确匹配在 tsx 下不可靠)。
const isMain = (process.argv[1] ?? "").replace(/\\/g, "/").toLowerCase().endsWith("migrate-custom.ts");
if (isMain) {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  console.log(`Migrating ${url} ...`);
  await migrateDatabase(url, authToken);
  console.log("Migration complete (0000-0009).");
}
