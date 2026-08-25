import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase } from "../../scripts/migrate-custom";
import app from "../../server/index";
import type { AppBindings } from "../../server/types";

export interface TestContext {
  bindings: AppBindings;
  dbUrl: string;
  cleanup(): void;
}

/**
 * 每个 API 测试文件一个独立的临时 SQLite 文件库:
 * 应用真实迁移(0000-0008,单用户本地版,无账户种子)。
 */
export async function createTestContext(): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), "argumesh-api-test-"));
  const dbUrl = `file:${join(dir, "test.db")}`;

  await migrateDatabase(dbUrl);

  const bindings: AppBindings = {
    DATABASE_URL: dbUrl,
    DATABASE_AUTH_TOKEN: undefined,
    STEPFUN_BASE_URL: undefined,
    STEPFUN_API_KEY: undefined,
    STEPFUN_MODEL: undefined,
    AI_MODELS: undefined,
    AI_PROVIDERS: undefined,
  };

  return {
    bindings,
    dbUrl,
    cleanup() {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows 下 libsql 缓存连接可能仍持有文件句柄,清理失败不影响测试结果。
      }
    },
  };
}

/** JSON 请求头(单用户本地版:无鉴权,不附加 Bearer)。 */
export function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}
