# ArguMesh 开发指南

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

命令、环境、迁移、测试与交付门禁。架构见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，部署见 [`DEPLOYMENT.md`](DEPLOYMENT.md)。

## 环境要求

Node.js ≥ 20，包管理器用 **pnpm**（仓库统一；npm 在部分运行时里不可用）。

## 常用命令

所有命令在仓库根 `ArguMesh/` 下执行。

```bash
# 依赖
pnpm install                       # 嘈杂环境加 --reporter=append

# 开发
pnpm run dev                       # API（node --watch --import tsx）+ Vite :5173，concurrently
pnpm run dev:api                   # 仅 API（:8787）
pnpm run dev:web                   # 仅 Vite

# 构建与运行
pnpm run build                     # tsc --noEmit + vite build → dist/
pnpm start                         # 单端口 8787：同时提供 dist/ 与 API（需先 build）
pnpm run preview                   # vite preview 构建产物

# 类型检查与测试
pnpm run typecheck                 # tsc --noEmit
pnpm run test                      # Vitest（单一 config）：tests/unit + tests/api
pnpm run test:watch                # watch 模式
pnpm exec vitest run tests/api/<file>.test.ts   # 只跑单个 API 测试文件

# 数据库
pnpm run db:seed                   # 幂等：建全部表 + 演示项目（全新安装路径；无账号）
pnpm run db:migrate                # 应用未应用的 drizzle/ 迁移（0000–0007）
pnpm run db:generate               # 改完 server/db/schema.ts 后生成迁移
pnpm run db:backup                 # 全表 JSON 快照 → backups/
pnpm run db:studio                 # drizzle-kit studio

# 桌面打包（另一条链路，见 DEPLOYMENT.md）
pnpm run build:sidecar -- --node-exe "$(node -p process.execPath)"
pnpm tauri build
```

### ⚠ 两个不要改

- **别把 `pnpm run test` 改回裸 `vitest`。** 脚本实际是 `node ./node_modules/vitest/vitest.mjs run --config vitest.config.ts`，这是 Windows 下绕过 `vitest.cmd` shim 的写法。改回裸命令会在 Windows 上挂掉。
- **别删 `pnpm-workspace.yaml` 的 `allowBuilds`**（`esbuild` / `protobufjs` / `sharp` / `tesseract.js`）。pnpm 默认跳过 postinstall，这些是 `pnpm install` 之后原生依赖能用的前提。

## 环境变量

`.env` 是可选的（dotenv）。模板在 `.env.example`，全部可选——不配任何 AI 也能跑，AI 功能会返回明确的「未配置」提示。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/argumesh.db` | 本地 SQLite；也支持远程 `libsql://` |
| `DATABASE_AUTH_TOKEN` | — | 仅远程 `libsql://` 需要 |
| `PORT` | `8787` | **不在 `AppBindings` 里**——`server/node.ts` 直接读 `process.env.PORT` |
| `STEPFUN_BASE_URL` / `STEPFUN_API_KEY` / `STEPFUN_MODEL` | — | 单 provider 回退 |
| `AI_PROVIDERS` | — | JSON 数组 `[{id,label,baseUrl,apiKey,models}]`，多家 provider |
| `AI_MODELS` | — | 逗号分隔，覆盖可选模型列表 |
| `LATEX_ENGINE_PATH` | — | tectonic / latexmk 可执行文件路径 |
| `SEARXNG_BASE_URL` | — | 自托管 SearXNG 根地址；不设则 `web_search` 关闭 |
| `SEARXNG_TIMEOUT_MS` | `20000` | 夹在 3000–60000 之间 |

**优先级**：设置页的全局 AI 配置（`ai_settings` 表，一行 `account_id='local'`）**完全覆盖** `AI_PROVIDERS` / `STEPFUN_*` 环境回退，并忽略客户端传来的 provider/model。Base URL 以 `/anthropic` 结尾时自动改用 Anthropic Messages API。

**无鉴权 token**——不要把 API 端口暴露到不可信网络。

> 已知欠账：`.env.example` 缺 `LATEX_ENGINE_PATH`，而 `server/env.ts` 会读它。`.env.example` 随安装包发布，补上它有实际意义。

**gitignore**：`data/`、`backups/`、`dist/`、`build/`、`src-tauri/target/`、`src-tauri/gen/`、`node_modules/`、`design-qa-artifacts/`、`docs/tasks/` 以及根目录的 `IMPACT_ANALYSIS*.md` / `TASK_SUMMARY*.md`（后两者是本机 agent 草稿，全新 clone 里没有）。

## 迁移是双轨的

- **`drizzle/` + journal（`drizzle/meta/_journal.json`）覆盖 0000–0007**，由 `scripts/migrate.ts` 应用（`pnpm run db:migrate`）。
- **0007 之后全部由 `scripts/migrate-custom.ts` 逐条手写执行**：`0008_drop_accounts`、`0009_workspace_path`、`0010_research_question_origins`、`0011_experiment_result_analysis`、`0012_research_agent_conversations`、`0013_research_question_conclusions`、`0014_research_question_evidence`。原因是 drizzle migrator 的 libsql 批处理路径会在多语句迁移上抛 `SQLITE_UNKNOWN_0`。每个 hash 会登记进 `__drizzle_migrations`。
- `tests/api/helpers.ts` 用同一个脚本构建全新临时库。
- schema 注释里还提到 0015/0016（`evidence_layers.promotedTo`），**没有对应的 journal 或 SQL**——把那些注释当历史看。

**改 schema 之后**：0000–0007 形状的改动走 `pnpm run db:generate`；其他情况扩展 `migrate-custom.ts`。

## 测试

- **`tests/unit/**`（12 个文件）** — happy-dom，覆盖浏览器侧模块：`src/api.ts`、workspace、PDF `blocks`/`selection` 几何、LaTeX 日志解析、web search、agent 传输错误、paper-files 隔离、citations-from-actions。
- **`tests/api/**`（14 个测试文件 + `helpers.ts`）** — 每个文件顶部有 `// @vitest-environment node` docblock。`helpers.ts` 给每个文件一个临时 SQLite 库（全新、经 `migrate-custom.ts` 迁移、无账号种子）加 `app.request(url, init, bindings)`。**新 binding 必须加进 `helpers.ts`**（`LATEX_ENGINE_PATH`、`SEARXNG_BASE_URL`、`SEARXNG_TIMEOUT_MS` 已在）。临时目录尽力清理（Windows 文件句柄可能残留，无害）。
- **`tests/fixtures/`** — 小样本 PDF、假 tectonic 的 `main.tex`、阅读器划词样本。
- **本 checkout 没有 CI 配置**——typecheck / test / build 都是交付前的手动门禁。

## 文档规则（强制）

来自 `.cursor/rules/readme-on-feature-changes.mdc`（`alwaysApply: true`）：

任何**用户可见**的功能变更，必须在**同一个任务内**更新 **`README.md`**（英文，主）——功能在中文 README 里有描述时，同一轮也要改 **`README.zh-CN.md`**——并在 `## Changelog` / `## 更新记录` 下加一条。版本历史现在集中在 [`../CHANGELOG.md`](../CHANGELOG.md)，README 只保留指向它的入口。

README 编辑属于实现的一部分，不是收尾抛光。仅纯重构、以及对用户不可见的内部改动（测试、CI、开发工具）可以跳过。

## 交付前门禁

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

汇报时说明：改了哪些文件、迁移影响、测试结果、已知缺口——不要只说「做完了」。
