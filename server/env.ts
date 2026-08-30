import { mkdirSync } from "node:fs";
import type { AppBindings } from "./types";

const DEFAULT_DATABASE_URL = "file:./data/argumesh.db";
const DATA_DIR = "./data";

/** 本地文件库需要父目录存在(libSQL 不会自动创建目录;file: URL 相对进程 cwd 解析)。 */
function ensureDataDirectory(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

/** 从 process.env 组装运行时配置(server/node.ts 与 scripts 共用)。 */
export function loadBindings(): AppBindings {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  if (databaseUrl.startsWith("file:")) ensureDataDirectory();
  return {
    DATABASE_URL: databaseUrl,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    STEPFUN_BASE_URL: process.env.STEPFUN_BASE_URL,
    STEPFUN_API_KEY: process.env.STEPFUN_API_KEY,
    STEPFUN_MODEL: process.env.STEPFUN_MODEL,
    AI_MODELS: process.env.AI_MODELS,
    AI_PROVIDERS: process.env.AI_PROVIDERS,
    LATEX_ENGINE_PATH: process.env.LATEX_ENGINE_PATH,
    ARGUMESH_ENABLE_PI_AGENT: process.env.ARGUMESH_ENABLE_PI_AGENT,
  };
}
