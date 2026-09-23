# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**ArguMesh(论脉)** — open-source, local-first research workbench: `Literature → Evidence Matrix → Research Thread → Experiments → Writing`. Repo: **[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** (MIT). This is the self-contained OSS edition: **pure Node + local SQLite, zero cloud dependencies**. (The earlier Cloudflare edition lives at `../prototype` on Workers + Turso; that stack was deliberately removed here — do not reintroduce Cloudflare bindings, wrangler, or Turso-account requirements.)

- Frontend: React 19 SPA (Vite 6) — projects, library, PDF reader, evidence matrix, research thread, experiments, LaTeX writing, tasks, search, settings. Single-user; **no auth/admin UI**.
- Backend: Hono 4 served by `@hono/node-server` (`server/node.ts`), SQLite via libSQL `file:` URL + Drizzle ORM.
- Auth: **none.** No login, no accounts, no tokens — every `/api/*` route is directly reachable on localhost (`server/index.ts` says so explicitly). Migration 0008 dropped the `accounts` table, all `owner_id` columns, and the `/api/login` + `/api/users` routes.
- AI: optional, any OpenAI-compatible provider. **Primary = the single global config set on the Settings page** (Base URL, API Key, model — one `ai_settings` row with `account_id='local'`; `GET/PUT/DELETE /api/ai/config`, key never returned, only masked). It fully overrides the `AI_PROVIDERS` / `STEPFUN_*` env fallback and ignores client-sent provider/model. Unconfigured → AI endpoints return 400 `AI_NOT_CONFIGURED` pointing at Settings; everything else keeps working. A Base URL ending in `/anthropic` is auto-detected and spoken to over the **Anthropic Messages API** (`inferAiApiFormat` in `services/stepfun.ts`) — the Settings helper text promises this, so keep it working.
- **Research Agent** — the persistent, project-scoped AI collaborator built on `@earendil-works/pi-coding-agent`. Conversations persist in `ai_conversations`/`ai_messages` (`/projects/:projectId/ai/conversations`); each turn assembles a bounded project context (literature summaries, evidence matrix, research thread, experiment results, paper sources/compile state) via `services/project-context.ts` and returns **jumpable citations**. A turn may execute at most **one** whitelisted structured action, audited in `ai_actions`.
- **Web search (optional)** — the agent's `web_search` tool queries a SearXNG instance (`SEARXNG_BASE_URL`); unset means off, and `GET /api/health` reports `webSearch: "searxng" | "off"`. Web results are labeled unverified to the user.
- **LaTeX writing** — fixed-workspace `main.tex` + `references.bib` per project (`services/paper-files.ts`), snapshots, AI Diff patches with explicit user acceptance, dangerous-command interception, optional Tectonic/latexmk compile with real PDF preview, bibliography completeness checks.
- **Two extra deploy tracks, neither of which changes the app** — a Tauri 2 desktop shell + Node sidecar (`docs/DEPLOYMENT.md`; built and smoke-tested, **not published**) and a static public website on a separate Cloudflare Worker (`website/`; see the bottom of this file).

## Commands

All commands run from this directory (`ArguMesh/`). Use **pnpm**.

```bash
pnpm install          # deps (use --reporter=append in noisy environments)
pnpm run dev          # API (node --watch --import tsx) + Vite on :5173, via concurrently
pnpm run dev:api      # API only (:8787)
pnpm run dev:web      # Vite only
pnpm run build        # tsc --noEmit + vite build → dist/
pnpm start            # single port 8787: serves dist/ + API (build first)
pnpm run preview      # vite preview of the built SPA
pnpm run build:sidecar # 装配 Node sidecar → build/sidecar/ (桌面打包前置;必须传 --node-exe)
pnpm run typecheck    # tsc --noEmit
pnpm run test         # Vitest (one config): tests/unit (happy-dom) + tests/api (node + temp SQLite)
pnpm run test:watch
pnpm exec vitest run tests/api/<file>.test.ts   # single API test file
pnpm run db:seed      # idempotent: creates all tables + demo project (fresh-install path; no accounts)
pnpm run db:migrate   # applies unapplied drizzle/ migrations (0000-0007)
pnpm run db:generate  # drizzle-kit generate after editing server/db/schema.ts
pnpm run db:backup    # JSON snapshot of all tables → backups/
pnpm run db:studio    # drizzle-kit studio
```

**桌面安装包**（Tauri 2 薄壳 + Node sidecar，与 Web 版是两条独立链路）：完整构建流程、前置条件、构建期守卫与已知坑见 **`docs/DEPLOYMENT.md` 第 3 节**。三步且顺序不能换 —— `pnpm run build` → `pnpm run build:sidecar -- --node-exe "$(node -p process.execPath)"` → `pnpm tauri build`。`--node-exe` 是必需的（`tauri.conf.json` 把 node.exe 列在 `bundle.resources` 里，不传则打包失败）；安装包里是**空库**，AI 配置不随包带走，用户装完要在设置页重填。

**同一个 Hono app 有两个宿主。** `server/index.ts` 本身与宿主无关：`server/node.ts` 是 Web 宿主（Vite dev 代理 / `pnpm start` 单端口），Tauri 壳里的 `server.mjs` 是桌面宿主（esbuild 单包、裸 node 跑）。新增或改 API 只动 `index.ts` 与 `routes/`，**不要在任何宿主里写业务逻辑**。

**别把 `pnpm run test` 改回裸 `vitest`。** 脚本走 `node ./node_modules/vitest/vitest.mjs run`，这是 Windows 下绕过 `vitest.cmd` shim 的写法（与 `prototype` 的 ERR-20260813-024 同一类问题）。同理 `pnpm-workspace.yaml` 的 `allowBuilds`（esbuild / protobufjs / sharp / tesseract.js）是 `pnpm install` 能跑起来的前提 —— pnpm 默认跳过 postinstall，别删。

**Migrations are two-track.** `drizzle/` + the journal (`drizzle/meta/_journal.json`) cover **0000–0007** and are applied by `scripts/migrate.ts` (`pnpm run db:migrate`). Everything after 0007 — `0008_drop_accounts`, `0009_workspace_path`, `0010_research_question_origins`, `0011_experiment_result_analysis`, `0012_research_agent_conversations`, `0013_research_question_conclusions`, `0014_research_question_evidence` — is hand-applied **statement by statement** by `scripts/migrate-custom.ts` (the drizzle migrator's libsql batch path triggers `SQLITE_UNKNOWN_0` on multi-statement migrations), which registers each hash in `__drizzle_migrations`. `tests/api/helpers.ts` builds fresh temp DBs through the same script. Schema comments also reference 0015/0016 (`evidence_layers.promotedTo`) with no journal or SQL counterpart — treat those comments as historical. After schema edits: `db:generate` for 0000–0007-shaped changes, otherwise extend `migrate-custom.ts`.

## Runtime / Env

- `server/env.ts` `loadBindings()` builds `AppBindings` from `process.env`; `server/node.ts` and the scripts use it, tests construct bindings directly.
- `DATABASE_URL` (default `file:./data/argumesh.db`), `DATABASE_AUTH_TOKEN` (only for remote `libsql://` URLs), `STEPFUN_BASE_URL` / `STEPFUN_API_KEY` / `STEPFUN_MODEL` (single-provider fallback), `AI_PROVIDERS` (JSON array of `{id,label,baseUrl,apiKey,models}`) / `AI_MODELS`, `LATEX_ENGINE_PATH` (path to a tectonic/latexmk executable), `SEARXNG_BASE_URL`, `SEARXNG_TIMEOUT_MS` (default 20000, clamped 3000–60000).
- `PORT` (default 8787) is **not** in `AppBindings` — `server/node.ts` reads `process.env.PORT` directly, so tests never see it. The desktop shell sets `PORT=0` to get an ephemeral port and parses the server's `ARGUMESH_PORT=<port>` stdout line (`read_sidecar_port()` in `src-tauri/src/main.rs`); change that format only together with the Rust side.
- `data/`, `backups/`, `dist/`, `build/`, `src-tauri/target/`, `src-tauri/gen/`, `node_modules/`, `design-qa-artifacts/` are gitignored. So is `docs/tasks/` plus root `IMPACT_ANALYSIS*.md` / `TASK_SUMMARY*.md` — local agent scratch, present on this machine only.
- **No auth tokens** — do not expose the API port to untrusted networks.
- `.env` is optional (dotenv); `.env.example` documents the optional keys above (`LATEX_ENGINE_PATH` is in `AppBindings` but missing from `.env.example` — add it there when you touch env vars).

## Architecture

### Backend (`server/`)

- `node.ts` — Node entry: mounts the Hono app for `/api/*`, serves `dist/` static + SPA fallback for everything else. `index.ts` — the Hono app: **no auth gate** (single-user local workbench), 20 route modules mounted on `/api`, `notFound` returns 404 JSON, `onError` re-emits `HTTPException` as JSON.
- `db/client.ts` — `createDatabase(env)`; libSQL clients are cached by connection URL. `db/projects.ts` — `projectExists(env, id)`, the single-user stand-in for the prototype's `findOwnedProject`; routes call it for 404 existence checks (there is no ownership layer to scope by). `db/schema.ts` is the canonical table list: **29 tables** — 10 core (`projects` incl. `workspace_path`, `papers`, `paper_files`, `project_papers`, `matrices`, `matrix_papers`, `dimensions`, `evidence_cells`, `extraction_jobs`, `ai_settings`) + 19 research-arc tables (`knowledge_items`, `knowledge_relations`, `research_questions`, `rq_papers`, `research_question_origins`, `research_question_conclusions`, `research_question_evidence`, `gaps`, `gap_evidence`, `ideas`, `idea_versions`, `idea_evidence`, `idea_reviews`, `experiments`, `experiment_results`, `ai_conversations`, `ai_messages`, `ai_actions`, `evidence_layers`). All FKs cascade-delete.
- `routes/` (20 files, all mounted at `/api`): **core** — `ai` (global config), `papers`, `files` (PDF BLOBs in `paper_files`, ≤25 MB, `Content-Length` required), `library` (incl. `…/library/scan-inbox` for the workspace `literature/` inbox), `projects`, `matrix` (+ evidence PATCH with the locked-cell guard), `extraction`, `card`, `reader` (`/reader/ask` selection Q&A + `/reader/translate` per-selection translation, in-memory per-process rate limiter); **research arc** — `knowledge` (`/extract`, `/analyze`, `/relations`), `researchThread` (`/research-thread` + insight promotion), `researchQuestions`, `gaps`, `ideas`, `reviews`, `experiments` (`/design`, `/design-with-ai`, results `import`/`analyze`), `evidenceLayers` (`/interpret|imply|promote`); **agent + writing** — `conversations` (`/projects/:projectId/ai/conversations[/:id|/messages|/cancel]`), `writing` (`/paper/…` initialize, source, outline, patch, `proposals/:actionId`, bibliography, compile + `/compile/cancel` + `/compile-status`, pdf, snapshots + `snapshots/:snapshotId/restore`), `system` (`/system/pick-directory`, `/system/open-path`). Read the directory for the current set.
- `services/` (12 files) — **AI plumbing**: `ai.ts` (provider registry + `resolveAiForRequest`, `LOCAL_AI_ACCOUNT_ID`), `stepfun.ts` (legacy single-provider client + `stripThinkBlock`), `pi-agent.ts` (Pi `AgentSession` turn runner: SSE events, tool whitelist, `citationsFromActions`, `normalizeAgentTransportError`), `pi-runtime.ts` (bridges app AI config to the Pi model interface), `research-agent.ts` (whitelisted domain action executor), `project-context.ts` (bounded context assembly + `PROJECT_CONTEXT_LIMITS`), `result-analysis.ts`, `web-search.ts` (SearXNG JSON client). **Domain**: `latex.ts` (engine detect/compile/cancel/status/PDF path/log parse), `paper-files.ts` (LaTeX workspace read/write, snapshots, outline parse, missing-citation detection), `literature-inbox.ts` (`{workspacePath}/literature/` scan, 50 files / 25 MB limits), `native-picker.ts` (spawns an OS directory dialog / path opener — the only subprocess code in the app).
- `server/ai/` — the DB-free capability layer reused by routes: `complete.ts` (`completeJson` / `completeText`), `json.ts` (`stripThinkBlock`, `parseJsonObject`/`parseJsonArray`), `prompts.ts` (all system prompts: card/extract/intelligence/gap-discovery/draft/regenerate/review/revise/experiment-design/result-analysis/research-agent/paper-patch), `capabilities.ts` (Zod schemas for every AI output — **all AI output must pass through one of these**).

### Frontend (`src/`)

- `App.tsx` — the router. No login gate. Lands on `/projects`; everything research-shaped is project-scoped: `/projects/:projectId/library[/:paperId[/read]]`, `/projects/:projectId/matrices[/:matrixId]`, `/projects/:projectId/research` (`ResearchThreadPage` — the merged page that absorbed Knowledge/Gaps/Ideas/Research Questions as sub-views), `/projects/:projectId/experiments`, `/projects/:projectId/writing`. `ReaderPage` is the **only** lazy route. `AppShell` picks the chrome class from the path — `matrix-workspace` for any `/matrices/` detail, `reader-workspace` for `…/library/:paperId/read`, `route-workspace` otherwise — and collapses the sidebar below 900px. Legacy routes render `LegacyResearchRedirect` into the canonical URLs: `/questions` + `/projects/:projectId/questions` → `…/research?view=questions`; `/gaps`, `/ideas`, `/knowledge` (+ the project-scoped `/gaps`) → `…/research?view=insights[&type=…]`. Also still routed without a project prefix: `/library`, `/matrices`, `/knowledge/matrices/:projectId`, `/experiments`, and `/ideas/:ideaId/canvas` (`IdeaCanvasPage`). `src/pages/` also still contains unrouted leftovers (`KnowledgePage`, `GapsPage`, `IdeasPage`, `ResearchQuestionsPage`) — dead code kept for data compatibility, do not extend them.
- Providers: `WorkspaceProvider` → `ProjectProvider` → `Routes`. `AppShell` toggles the sidebar on `paperidea:toggle-sidebar`.
- `state/workspace.tsx` — browser-local notes/claims/evidence/ideas + the background sync queue (stale `retry` closures are dropped by JSON persistence — clear them, don't retry). `state/project.tsx` — current project.
- `api.ts` — fetch helpers. The 401 branch that throws `Error("Unauthorized")` is vestigial (single-user, no tokens); `getAiConversation(id, {healPending:true})` appends `?healPending=1` so a client that lost its SSE stream can clear stranded `pending` assistant messages.
- The Research Agent UI is the agent composer in `pages/ProjectHomePage.tsx` — it drives the SSE `POST /projects/:projectId/ai/conversations/:conversationId/messages` turn, renders `AgentMarkdown` replies plus jumpable citations and per-turn whitelisted actions. **No product-level keyboard shortcut exists anywhere in `src/`** (no Cmd/Ctrl+K); dialog-internal Escape / Tab are focus management, not shortcuts.
- `storage/paperFiles.ts` — IndexedDB PDF/OCR cache; the Reader falls back to `GET /api/papers/:id/file` (via `src/pdf/resolvePaperPdf.ts`, which caches the download back locally).
- `pdf/` — reader helpers, deliberately pure and unit-tested: `blocks.ts` (lossless + deterministic ~400-char passage splitter for 双语对照), `selection.ts` (viewport → **PDF-page-unit** geometry), `document.ts` (page text extraction), `resolvePaperPdf.ts`.
- **Reader minimal-exposure rule (a product rule, not an implementation detail).** 划词翻译 / 划词 ask / 双语对照 send only what the user selected or the current page's passages — **never the whole document**. `POST /api/reader/translate` caps a selection at 8,000 chars and **refuses** over-long input with a distinct message instead of silently truncating (empty vs. too-long are separate 400 messages, because "select some text" is a confusing reply to a 9,000-char selection). Bilingual 对照 sends nothing until the user presses 翻译本页, then 3 passages at a time with a progress counter and cancel. Bilingual results are cached per paper + page + language in IndexedDB **and re-validated against the stored source text**, so replacing a PDF can never surface the previous paper's translation — which is also why `blocks.ts` must stay deterministic: block content doubles as the cache key. Do **not** "simplify" `blocks.ts` back to a sentence regex; the original regex silently dropped characters (matched 83 of 426 chars on a sample, because it required whitespace after the sentence ender and `92.4` broke it).
- Highlights / notes / evidence are anchored in PDF page units, so marks survive zoom, page turns, and reload. `src/components/AgentMarkdown.tsx` renders agent replies as GFM.
- `styles.css` — all styling; tokens in `:root` (`--nav` graphite, `--accent` cyan, `--draft` amber, `--success` green). Design direction + QA history: **`DESIGN.md`** (viewport 1047 × 698).

## Product Rules (apply to every feature)

- **Evidence first** — AI research judgments must persist source/location/model/time; display the source prominently.
- **Object-first** — Paper, Evidence, Gap, Idea, Experiment are first-class linkable objects.
- **User-editable** — AI suggests; the user owns final content and confirmation status.
- **Single-user, no tenancy** — there is no `accountId`, no ownership scoping, and no cross-account view. Do not reintroduce them (the prototype's `ownership.ts` model does not apply here).
- **No silent history overwrite** — regenerations, idea edits, review revisions, and LaTeX patches keep version/snapshot history.
- **Locked/confirmed content is never silently overwritten** by batch AI runs (see the `routes/matrix.ts` PATCH guard).
- **Untrusted input** — AI prompts must defend against prompt injection; AI output must pass Zod validation before touching the DB (`routes/card.ts`, `routes/extraction.ts`, and everything in `server/ai/capabilities.ts` are the patterns).
- **Agent writes are gated** — the Research Agent runs one whitelisted action per turn, writes only through `routes/` handlers, and records every action in `ai_actions`.
- **Cost visible** — long AI tasks show scope, model, progress, and cancel.

## Status State Machines

- **Paper**: 待读 → 粗读 → 精读 → 已复现 → 核心文献 (archive was removed — "归档" is delete now).
- **Evidence**: `draft` / `confirmed` / `conflict` / `missing`.
- **Idea**: Inbox → Draft → Reviewing → Revise → Approved → Experimenting → Writing → Archived.

## Tests

- `tests/unit/**` (12 files) — happy-dom for browser-only modules (`src/api.ts`, workspace, PDF blocks/selection geometry, LaTeX log parsing, web search, agent transport errors, paper-files isolation, citations-from-actions).
- `tests/api/**` (14 files + `helpers.ts`) — `// @vitest-environment node` docblock per file; `tests/api/helpers.ts` gives each file a temp SQLite DB (fresh, migrated via `scripts/migrate-custom.ts` — no account seed) plus `app.request(url, init, bindings)`. New bindings must be added to `helpers.ts` (`LATEX_ENGINE_PATH`, `SEARXNG_BASE_URL`, `SEARXNG_TIMEOUT_MS` are there). Temp dirs are cleaned best-effort (Windows file handles may persist — harmless).
- `tests/fixtures/` — a small sample PDF, a fake-tectonic `main.tex`, and the reader-selection sample.
- **No CI config in this checkout** — typecheck / test / build gates are manual pre-handoff steps.
- Before finishing work: `pnpm run typecheck`, `pnpm run test`, `pnpm run build`. Report changed files, migration impact, test results, and known gaps.

## Documentation Rules (mirrors `.cursor/rules/readme-on-feature-changes.mdc`, `alwaysApply: true`, and `AGENTS.md`)

Any **user-facing** feature change must, **in the same task**: update **`README.md`** (English, primary) and `README.zh-CN.md` where the feature is described there, and append an entry to **`CHANGELOG.md`** (English first, Chinese in a `<details><summary>中文` block — the changelog used to live in the READMEs and now lives in its own file). Docs edits are part of the implementation, not polish. Skip only for pure refactors and internal-only changes invisible to users (tests, dev tooling).

`README.md` also carries a **Deploy with AI** section — a paste-ready prompt telling a coding agent to install/seed/start ArguMesh *without* adding Cloudflare/Wrangler/Turso. Keep that prompt correct (Node ≥ 20, `pnpm install` → `db:seed` → `dev` or `build` + `start`, no invented keys, no public exposure) whenever commands change; it explicitly tells the agent to read this file.

**Where docs live** (full map in `AGENTS.md`): `docs/PROJECT-SPEC.md` (scope), `ARCHITECTURE.md` (code + data model), `PAGE-STRUCTURE.md` (routes), `COMPONENT-GUIDELINES.md` (UI conventions), `DEVELOPMENT.md` (commands, env, migrations), `DEPLOYMENT.md` (local / website / installer), `DESIGN.md` (visual + QA), `CHANGELOG.md` (history), `TODO.md` (progress + deferred items). Unchanged and still authoritative: `docs/brand-guidelines.md`, `docs/reference-projects.md`, `docs/DISTRIBUTION-RESEARCH-2026-09-20.md`.

## `website/` — the public marketing site (separate Cloudflare Worker)

The only Cloudflare-touching code in this repo, and it does **not** change the local app:

- `website/index.html` + `website/website-assets/` are the only public files. `website/edge.mjs` is the hosting adapter: it serves `/` and `/website-assets/*` from `ASSETS` and **forwards everything else through a service binding** to the prototype's `paperidea-workbench` Worker — auth, `/api/*`, and deep links all keep working there. The website owns the more specific zone route `argumesh.nekocfy.com/*`; the prototype keeps the custom domain.
- Deploy: `node website/prepare-hosting.mjs` stages only public files into a temp dir and prints a Wrangler config path; deploy that path with an authenticated CLI. Full instructions + the deploy log are in **`docs/DEPLOYMENT.md`** (append an entry after every deploy, never rewrite old ones). Rollback = remove the website zone route and keep the custom domain.
- **Never deploy the local unauthenticated Node app as the public backend** — it has no auth. Assets are copied from `public/` branding and `docs/screenshots/` / `design-qa-artifacts/` and show example data.
- This is why "zero cloud dependencies" still holds: the *application* has no Cloudflare code, and the website is a static sibling deploy.

**Distribution is deferred — do not start it.** `docs/DISTRIBUTION-RESEARCH-2026-09-20.md` is the decision record for shipping downloadable installers (Windows EXE via Tauri + Node sidecar). The user deferred it on 2026-09-20 ("保留方案"): the plan stays valid, but **do not implement it, do not add it to a TODO, and do not add download/install sections to the READMEs** until the user re-raises it. Installer *packaging* itself is built and smoke-tested (`docs/DEPLOYMENT.md` §3) — it simply isn't published. The full "do not start" list lives in `TODO.md`.

## Design Direction

- Visual target: dark-navigation Evidence Matrix concept; papers-as-columns × dimensions-as-rows + lower evidence verification pane.
- The user prefers a **simple, clear** interface — reduce secondary controls and status noise; keep the matrix + verification workflow obvious.
- Colors: graphite navigation, cool white/gray surfaces, cyan operational accent, amber AI draft, green confirmation.
- Brand identity (logo, typography, color) lives in `docs/brand-guidelines.md` and `public/argumesh-logo.svg`.
- `docs/reference-projects.md` is a **durable decisions file** comparing ArguMesh with peer projects (ARIS, karpathy/autoresearch, Mimir, …) and what to borrow from each — read it before designing anything that overlaps those products. Per-task impact analyses live in `docs/tasks/` (gitignored local scratch — absent in a fresh clone).
- Roadmap context: `ARGUMESH-RESEARCH-WORKBENCH-PLAN.md` (current phase plan) and `FOLDER-PICKER-PLAN.md` at the repo root; the shared product baseline is `../docs/product/`. Build/distribution runbooks: **`docs/DEPLOYMENT.md`** (how to build the installer) and `docs/DISTRIBUTION-RESEARCH-2026-09-20.md` (why, and currently deferred — see above).
