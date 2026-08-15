# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**ArguMesh(论脉)** — open-source, local-first research workbench: `Literature → Evidence → Idea`. This is the self-contained OSS edition: **pure Node + local SQLite, zero cloud dependencies**. (The original prototype at `../prototype` was Cloudflare Workers + Turso; this repo intentionally removed that stack — do not reintroduce Cloudflare bindings, wrangler, or Turso-account requirements.)

- Frontend: React 19 SPA (Vite 6) — projects, library, PDF reader, evidence matrix, knowledge, ideas, tasks, search, settings, admin user management.
- Backend: Hono 4 app served by `@hono/node-server` (`server/node.ts`), SQLite via libSQL `file:` URL + Drizzle ORM.
- Auth: DB-backed accounts (PBKDF2-SHA256 hashes) + HMAC session tokens. Default admin seeded as `admin/admin123`; admins manage accounts via `/api/users` and the `/users` page.
- AI: optional, any OpenAI-compatible provider. **Primary: per-account config via the settings page form** (Base URL default `https://api.openai.com/v1`, API Key, model name — stored in `ai_settings`, `GET/PUT/DELETE /api/ai/config`, key never returned, only masked). Account config fully overrides the env fallback (`AI_PROVIDERS` JSON env / `STEPFUN_*`) and ignores client-sent provider/model. Unconfigured → AI endpoints return 400 `AI_NOT_CONFIGURED` pointing at the settings page; nothing else breaks.

## Commands

All commands run from this directory (`ArguMesh/`). Use **pnpm**.

```bash
pnpm install          # deps (use --reporter=append in noisy environments)
pnpm run dev          # API on 127.0.0.1:8787 (tsx watch) + Vite on :5173 (proxies /api)
pnpm run build        # tsc --noEmit + vite build → dist/
pnpm start            # single port 8787: serves dist/ static + API (build first)
pnpm run typecheck    # tsc --noEmit
pnpm run test         # Vitest: tests/unit (happy-dom) + tests/api (node + temp SQLite)
pnpm run test:watch
pnpm exec vitest run tests/api/<file>.test.ts   # single API test file
pnpm run db:seed      # idempotent: creates all tables + admin/admin123 + demo project (fresh-install path)
pnpm run db:migrate   # applies unapplied drizzle/ migrations (schema upgrades on existing DBs)
pnpm run db:generate  # drizzle-kit generate after editing server/db/schema.ts
pnpm run db:backup    # JSON snapshot of all tables → backups/
pnpm run db:studio    # drizzle-kit studio
```

After schema changes: `db:generate` → `db:migrate`. After adding env config: update `.env.example`.

## Runtime / Env

- `server/env.ts` builds `AppBindings` from `process.env` (`loadBindings()`); `server/node.ts` and scripts use it. Tests construct bindings directly.
- `DATABASE_URL` defaults to `file:./data/argumesh.db` (relative to repo root); remote `libsql://` URLs also work with `DATABASE_AUTH_TOKEN`.
- `APP_ACCESS_TOKEN` (session HMAC secret) auto-generates into `data/session-secret.key` on first run if unset — restart-safe, gitignored. Explicitly setting it in `.env` is recommended for any non-local deployment.
- `.env` is optional (dotenv). `.env.example` documents AI config; never ship real keys.
- `data/`, `backups/`, `dist/`, `node_modules/` are gitignored.

## Architecture

### Backend (`server/`)

- `node.ts` — Node entry: mounts `app` for `/api/*`, serves `dist/` static + SPA fallback for everything else.
- `index.ts` — Hono app: `/api/health` + `/api/login` are the only public routes; a global gate verifies the bearer session token, then sets `c.var.accountId` **and** `c.var.accountRole` (role read fresh from DB every request — token role claims are ignored). `onError` re-emits `HTTPException` as JSON.
- `auth/session.ts` — `verifyAccount(env, name, password)` (DB lookup + PBKDF2), `createSessionToken` / `verifySessionToken(token, secret, env)`. Session verification checks the account still exists in the DB, so deleting a user invalidates their tokens immediately.
- `auth/password.ts` — PBKDF2-SHA256 (Web Crypto, 100k iterations), format `pbkdf2$<iterations>$<saltHex>$<hashHex>`, constant-time compare.
- `auth/ownership.ts` — account-scoped lookups (same resource ID returns 404 to other accounts).
- `db/client.ts` — `createDatabase(env)`; libSQL clients are **cached by connection URL** (file mode: one handle per URL). `db/schema.ts` is the canonical table list (11 tables incl. `accounts` and `ai_settings`).
- `routes/` — auth, users (admin-only CRUD; self-delete blocked; last-admin protected; deleting a user cascades their projects/papers), ai (per-account AI config: GET/PUT/DELETE `/api/ai/config`, masked key only), matrix (+ evidence PATCH with locked-cell guard), files (PDFs as BLOBs in `paper_files`, ≤25 MB, `Content-Length` required), extraction, card, reader (in-memory per-process rate limiter), library, papers, projects.
- `services/ai.ts` + `stepfun.ts` — multi-provider OpenAI-compatible chat client; unusable/placeholder providers are filtered out before reaching the frontend. `services/stepfun.ts` is provider-agnostic despite the name (kept from the prototype).

### Frontend (`src/`)

- `App.tsx` — router shells; `AccessGate` gates the whole app until login. **登录后落地 `/projects`(项目列表)**;文献/矩阵等内容只在项目内访问:`/projects/:projectId`(项目首页 ProjectHomePage)、`/projects/:projectId/library[/:paperId[/read]]`、`/projects/:projectId/matrices[/:matrixId]`。旧路由 `/library`、`/matrices`、`/knowledge/matrices/:matrixId` 保留兼容(全局矩阵列表 / 矩阵详情)。`/users` 是 admin-only(其他人重定向 `/projects`)。`Sidebar` 按上下文切换:项目外只有「项目」,项目内显示 概览/文献/矩阵/Ideas(`/ideas?project=:id` 过滤)+「所有项目」;底部全局入口(搜索/知识库/任务中心/用户管理/设置)始终可见。Ideas 页不在 `/projects/` 前缀下,项目上下文由 `?project=` 查询参数恢复。
- `state/auth.tsx` — session (token + accountId + displayName + role) in sessionStorage; `AccountRole = "admin" | "researcher"`. `state/workspace.tsx` owns browser-local notes/claims/evidence/ideas + background sync queue (stale `retry` closures are dropped by JSON persistence — clear, don't retry). `state/project.tsx` — current project.
- `api.ts` — fetch helpers; throws `Error("Unauthorized")` on 401 so callers clear the token. Users API helpers at the bottom.
- `storage/paperFiles.ts` — IndexedDB PDF/OCR cache (account-scoped); Reader falls back to `GET /api/papers/:id/file`.
- `styles.css` — all styling; tokens in `:root` (`--nav` graphite, `--accent` cyan, `--draft` amber, `--success` green). CSS viewport target 1440×1024.

## Product Rules (apply to every feature)

- **Evidence first** — AI research judgments must persist source/location/model/time; display source prominently.
- **Object-first** — Paper, Evidence, Gap, Idea are first-class linkable objects.
- **User-editable** — AI suggests; the user owns final content and confirmation status.
- **Account isolation** — every route scopes reads/writes by `c.get("accountId")` via ownership helpers.
- **No silent history overwrite** — regenerations keep version history.
- **Locked/confirmed content is never silently overwritten** by batch AI runs (see `routes/matrix.ts` PATCH guard).
- **Untrusted input** — AI prompts must defend against prompt injection; AI output to DB must pass Zod validation (`routes/card.ts`, `routes/extraction.ts` are the patterns).
- **Cost visible** — long AI tasks show scope, model, progress, cancel.

## Status State Machines

- **Paper**: 待读 → 粗读 → 精读 → 已复现 → 核心文献 (archive was removed in the prototype — "归档" is now delete).
- **Evidence**: `draft` / `confirmed` / `conflict` / `missing`.
- **Idea**: Inbox → Draft → Reviewing → Revise → Approved → Experimenting → Writing → Archived.

## Tests

- `tests/unit/**` — happy-dom; `src/api.ts` and auth flow. No real IndexedDB (account-key isolation tested explicitly).
- `tests/api/**` — `// @vitest-environment node` docblock per file; `tests/api/helpers.ts` gives each file a temp SQLite DB (migrated + seeded with `admin/admin123` and `researcher/researcher123`) and `app.request(url, init, bindings)`. Temp dirs are cleaned best-effort (Windows file handles may persist — harmless).
- `tests/fixtures/` — small sample PDF used by the files test.
- Before finishing work: `pnpm run typecheck`, `pnpm run test`, `pnpm run build`. Report changed files, migration impact, test results, and known gaps.

## Design Direction

- Visual target: dark-nav Evidence Matrix concept; papers-as-columns × dimensions-as-rows + lower evidence verification pane.
- User prefers a **simple, clear** interface — reduce secondary controls and status noise; keep the matrix + verification workflow obvious.
- Colors: graphite navigation, cool white/gray surfaces, cyan operational accent, amber AI draft, green confirmation.
- Brand identity (logo, typography, color) lives in `docs/brand-guidelines.md` and `public/argumesh-logo.svg`.
