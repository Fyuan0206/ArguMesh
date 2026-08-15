import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppBindings } from "./types";

const DEFAULT_DATABASE_URL = "file:./data/argumesh.db";
const DATA_DIR = "./data";
const SECRET_FILE = join(DATA_DIR, "session-secret.key");

/** 本地文件库需要父目录存在(libsql 不会自动创建目录;file: URL 相对进程 cwd 解析)。 */
function ensureDataDirectory(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

/** 会话签名密钥:优先 .env 的 APP_ACCESS_TOKEN,否则自动生成并持久化,保证重启后旧会话仍有效。 */
function loadSessionSecret(): string {
  if (process.env.APP_ACCESS_TOKEN) return process.env.APP_ACCESS_TOKEN;
  ensureDataDirectory();
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(SECRET_FILE, `${secret}\n`, "utf8");
  console.log(`已生成会话签名密钥:${SECRET_FILE}(data/ 已加入 .gitignore,请勿提交)`);
  return secret;
}

/** 从 process.env 组装运行时配置(server/node.ts 与 scripts 共用)。 */
export function loadBindings(): AppBindings {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  if (databaseUrl.startsWith("file:")) ensureDataDirectory();
  return {
    DATABASE_URL: databaseUrl,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    APP_ACCESS_TOKEN: loadSessionSecret(),
    STEPFUN_BASE_URL: process.env.STEPFUN_BASE_URL,
    STEPFUN_API_KEY: process.env.STEPFUN_API_KEY,
    STEPFUN_MODEL: process.env.STEPFUN_MODEL,
    AI_MODELS: process.env.AI_MODELS,
    AI_PROVIDERS: process.env.AI_PROVIDERS,
  };
}
