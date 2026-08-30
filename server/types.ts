/** 运行时配置:本地 Node 由 server/env.ts 从 process.env 组装,测试中直接构造。 */
export interface AppBindings {
  /** libSQL 连接串:本地 file:./data/argumesh.db 或远程 libsql://… */
  DATABASE_URL: string;
  /** 远程 libsql 库的鉴权 token(本地 file: 模式不需要)。 */
  DATABASE_AUTH_TOKEN?: string;
  /** AI 配置(OpenAI 兼容;均可选,未配置时 AI 功能降级为明确报错)。 */
  STEPFUN_BASE_URL?: string;
  STEPFUN_API_KEY?: string;
  STEPFUN_MODEL?: string;
  AI_MODELS?: string;
  AI_PROVIDERS?: string;
  /** 可选 LaTeX 引擎绝对路径；仅允许 tectonic/latexmk 可执行文件。 */
  LATEX_ENGINE_PATH?: string;
}

/**
 * 单用户本地版:无账号、无鉴权。Variables 仅保留宽松签名,
 * 供路由声明 Env 类型(c.set/get 鉴权相关不再使用)。
 */
export type AppEnv = {
  Bindings: AppBindings;
  Variables: Record<string, unknown>;
};
