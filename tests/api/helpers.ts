import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../../server/auth/password";
import app from "../../server/index";
import type { AppBindings } from "../../server/types";

export interface TestContext {
  bindings: AppBindings;
  dbUrl: string;
  /** admin / admin123 的会话 token。 */
  adminToken: string;
  /** researcher / researcher123 的会话 token。 */
  researcherToken: string;
  cleanup(): void;
}

/**
 * 每个 API 测试文件一个独立的临时 SQLite 文件库:
 * 应用真实迁移 + 兜底建 accounts 表 + 种子 admin 与 researcher 两个账户。
 */
export async function createTestContext(): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), "argumesh-api-test-"));
  const dbUrl = `file:${join(dir, "test.db")}`;

  const client = createClient({ url: dbUrl });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });
  // accounts 表由 0005 迁移创建;迁移尚未生成时兜底建表,保证测试独立可跑。
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS accounts (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      password_hash text NOT NULL,
      role text DEFAULT 'researcher' NOT NULL,
      created_at text NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_name_unique ON accounts (name);
  `);
  const now = new Date().toISOString();
  await client.execute({
    sql: "INSERT OR IGNORE INTO accounts (id, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    args: ["account-admin", "admin", await hashPassword("admin123"), "admin", now],
  });
  await client.execute({
    sql: "INSERT OR IGNORE INTO accounts (id, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    args: ["account-researcher", "researcher", await hashPassword("researcher123"), "researcher", now],
  });
  client.close();

  const bindings: AppBindings = {
    DATABASE_URL: dbUrl,
    DATABASE_AUTH_TOKEN: undefined,
    APP_ACCESS_TOKEN: "test-secret-token",
    STEPFUN_BASE_URL: undefined,
    STEPFUN_API_KEY: undefined,
    STEPFUN_MODEL: undefined,
    AI_MODELS: undefined,
    AI_PROVIDERS: undefined,
  };

  const login = async (name: string, password: string): Promise<string> => {
    const response = await app.request(
      "http://localhost/api/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, password }),
      },
      bindings,
    );
    if (response.status !== 200) throw new Error(`login failed for ${name}: ${response.status}`);
    const payload = (await response.json()) as { token: string };
    return payload.token;
  };

  const adminToken = await login("admin", "admin123");
  const researcherToken = await login("researcher", "researcher123");

  return {
    bindings,
    dbUrl,
    adminToken,
    researcherToken,
    cleanup() {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows 下 libsql 缓存连接可能仍持有文件句柄,清理失败不影响测试结果。
      }
    },
  };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export function jsonHeaders(token?: string): Record<string, string> {
  return { "content-type": "application/json", ...(token ? bearer(token) : {}) };
}
