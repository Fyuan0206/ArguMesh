import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppBindings } from "./types";

const DEFAULT_DATABASE_URL = "file:./data/argumesh.db";

/**
 * 本地文件库需要父目录存在(libSQL 不会自动创建目录;file: URL 相对进程 cwd 解析)。
 *
 * 目录从 DATABASE_URL 本身推出来,而不是写死 ./data:桌面安装包会把库指到
 * %LOCALAPPDATA%\ArguMesh\data\(便于卸载时保留数据、也允许把程序装在只读目录),
 * 写死就会在安装目录里凭空造一个没人用的空 data/。
 */
function ensureDatabaseDirectory(databaseUrl: string): void {
  const raw = databaseUrl.slice("file:".length);
  // libSQL 接受 file:./x.db / file:/abs/x.db / file:///abs/x.db 三种写法
  const filePath = raw.startsWith("///") ? raw.slice(2) : raw;
  const dir = dirname(filePath);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
}

/** 从 process.env 组装运行时配置(server/node.ts 与 scripts 共用)。 */
export function loadBindings(): AppBindings {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  if (databaseUrl.startsWith("file:")) ensureDatabaseDirectory(databaseUrl);
  return {
    DATABASE_URL: databaseUrl,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    STEPFUN_BASE_URL: process.env.STEPFUN_BASE_URL,
    STEPFUN_API_KEY: process.env.STEPFUN_API_KEY,
    STEPFUN_MODEL: process.env.STEPFUN_MODEL,
    AI_MODELS: process.env.AI_MODELS,
    AI_PROVIDERS: process.env.AI_PROVIDERS,
    LATEX_ENGINE_PATH: process.env.LATEX_ENGINE_PATH,
    SEARXNG_BASE_URL: process.env.SEARXNG_BASE_URL,
    SEARXNG_TIMEOUT_MS: process.env.SEARXNG_TIMEOUT_MS,
  };
}
