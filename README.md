# ArguMesh (论脉)

<p align="center">
  <img src="./public/argumesh-logo.svg" alt="ArguMesh 论脉 — Weave evidence into the thread of your research" width="420" />
</p>

> Weave evidence into the thread of your research.

ArguMesh (Chinese name 「论脉」) is a **local-first, open-source research workbench** for researchers, graduate students, and paper authors. It puts the whole research loop — define a topic → collect papers → read & annotate → compare evidence → form ideas → plan experiments — into one traceable workflow, so you stop shuffling information between PDF readers, spreadsheets, note apps, and chat AI.

- **Zero cloud dependencies** — all data lives in a local SQLite file; no sign-ups, no vendor lock-in
- **Works out of the box** — `pnpm install && pnpm run dev`, default admin `admin / admin123`
- **Ask an AI to deploy it** — paste the prompt in [Deploy with AI](#deploy-with-ai) into Cursor, Claude Code, Codex, or Copilot
- **Multi-user** — admins create member accounts; all data is isolated per account
- **AI is optional** — plug in any OpenAI-compatible endpoint (OpenAI / DeepSeek / StepFun / local models); every manual workflow works without it

> Note: the interface is currently in Chinese. 中文文档见 [README.zh-CN.md](./README.zh-CN.md)。

## Features

### Project-first workspace
Sign in and you land on your project list. Click a project and the workspace scopes to it: literature, evidence matrices, and ideas are all organized inside the project, while cross-project tools (knowledge base, task center, global search) stay one click away in the sidebar.

<img src="./docs/screenshots/projects.png" alt="Project list — create, search, and enter research projects" width="900" />

<img src="./docs/screenshots/project-home.png" alt="Project home — literature, matrix, ideas, and knowledge at a glance" width="900" />

### Literature library
Import papers by DOI / arXiv ID / URL with automatic metadata, or batch-upload PDFs (≤ 25 MB each). Track reading status (待读 → 粗读 → 精读 → 核心文献), favorites, tags, and per-project notes.

<img src="./docs/screenshots/library.png" alt="Literature library — papers, reading status, and Paper Card shortcuts" width="900" />

### PDF reader with structured annotations
Built-in PDF reader with OCR. Select any passage and save it as a Note, Claim, or Evidence — the paper reference and page number stay attached. Ask the AI about a passage: only the text you selected, its page number, and your question are sent to the model — never the whole document.

<img src="./docs/screenshots/reader.png" alt="PDF reader — page view, selection, notes, and grounded Q&A" width="900" />

### AI Paper Card
Generate a structured card for any paper: Problem, Method, Data, Findings, Limitations — each field with source excerpts, so every claim can be traced back to the paper.

<img src="./docs/screenshots/paper-card.png" alt="Paper Card — structured problem, method, data, findings, and limitations" width="900" />

### Evidence Matrix
The core of ArguMesh: papers as columns × research dimensions as rows. AI extraction fills every cell with evidence, confidence, and source location (page + excerpt). Then you verify: mark a cell 原文一致 (matches the source), 需要修订 (needs revision), or 标记冲突 (conflict), and 确认并锁定 (confirm & lock) the ones you trust. Locked cells are never silently overwritten by batch AI runs.

<img src="./docs/screenshots/matrix.png" alt="Evidence Matrix — papers × dimensions, with source-linked verification" width="900" />

### Idea workflow
Ideas move through a kanban board (Inbox → Draft → Reviewing → Approved → Experimenting → Writing → Archived). The Idea Canvas links Problem, Gap, Hypothesis, Method, Experiment, and Risks to the evidence behind them, and every save keeps a version history.

<img src="./docs/screenshots/ideas.png" alt="Idea workflow — Inbox, Draft, Reviewing, and Approved columns" width="900" />

### Knowledge base
Notes, Claims, and Evidence in one place, linked to their papers and pages — the raw material your Ideas are built from.

<img src="./docs/screenshots/knowledge.png" alt="Knowledge base — notes, claims, and evidence in one place" width="900" />

### Global search
Search across projects from one box. Results stay scoped to your account.

<img src="./docs/screenshots/search.png" alt="Global search across projects and literature" width="900" />

### Task center
Every AI job (matrix extraction, PDF parsing…) shows its scope, model, progress, and result — and can be cancelled. No invisible batch processing.

### Accounts & isolation
Admins manage member accounts (create, reset password, change role, delete — deleting cascades all their data). Every API call is scoped to the signed-in account; another account hitting the same resource ID gets 404. Passwords are stored as PBKDF2-SHA256; sessions are HMAC tokens kept in `sessionStorage`.

### Bring your own AI
Each account configures its own OpenAI-compatible endpoint in Settings — Base URL (default `https://api.openai.com/v1`), API Key, and model name. Keys are stored server-side and never returned to the browser. With no AI configured, every manual workflow still works; AI features return a clear "AI not configured" notice pointing at the settings page.

## Why ArguMesh

| Common problem | How ArguMesh handles it |
| --- | --- |
| Papers scattered across folders, browsers, and note apps | Projects scope topics and their literature; search, filters, and tags keep them organized |
| Highlights and summaries never get reused | The reader saves selections as Note / Claim / Evidence with paper + page attached |
| Uploading whole PDFs to AI makes answers unverifiable | Reader Q&A submits only your selected passage, its page, and your question |
| Manual spreadsheets make paper comparison inconsistent | The Evidence Matrix standardizes dimensions; every cell carries source, confidence, and verification state |
| Notes, claims, evidence, and ideas are disconnected | The knowledge base unifies them; the Idea Canvas links them into hypotheses and experiments |
| Batch AI work is opaque and hard to retrace | The task center records scope, model, progress, and results |

## Deploy with AI

If you use [Cursor](https://cursor.com), [Claude Code](https://claude.com/claude-code), Codex, Copilot, or another coding agent that can run commands in this repo, paste the prompt below and let it install, seed, and start ArguMesh. The agent should also read [`CLAUDE.md`](./CLAUDE.md) — that file is the project runbook for coding agents.

```
Deploy ArguMesh (论脉) locally from this repository.

This is a local-first Node.js + SQLite app. Do not add Cloudflare Workers, wrangler, or Turso.

1. Prerequisites: Node.js ≥ 20. If pnpm is missing, run `corepack enable`.
2. Read CLAUDE.md, README.md, and .env.example in the repo root.
3. From the repo root, run `pnpm install`.
4. `.env` is optional. Do not invent or commit API keys. Copy `.env.example` to `.env` only if the user wants to set DATABASE_URL, APP_ACCESS_TOKEN, or AI providers.
5. Run `pnpm run db:seed` (idempotent: creates tables + default admin `admin` / `admin123` + a demo project).
6. Start the app:
   - Development (default): `pnpm run dev` → frontend http://localhost:5173 , API 127.0.0.1:8787
   - Single-port production-style: `pnpm run build` then `pnpm start` → http://127.0.0.1:8787
7. Tell the user to open the URL, sign in with admin / admin123, and change the password after first login.

On Windows PowerShell 5.x, chain commands with `;` not `&&`.
Do not expose the server to the public internet unless the user explicitly asks. If they do: change the admin password, set APP_ACCESS_TOKEN in `.env`, and put HTTPS in front (Caddy / Nginx).
Do not start extra services. Confirm the app is up by hitting GET /api/health.
```

Manual steps for humans are in [Deployment](#deployment) below.

## Deployment

Requires Node.js ≥ 20 and pnpm.

```bash
pnpm install
pnpm run db:seed   # create local DB + default admin + demo project (safe to re-run)
pnpm run dev       # dev mode: API on 127.0.0.1:8787, frontend on http://localhost:5173
```

Open <http://localhost:5173> and sign in with `admin / admin123` — change the password after first login.

Production (single port serving frontend + API):

```bash
pnpm run build     # type-check + build frontend to dist/
pnpm start         # http://127.0.0.1:8787
```

All configuration is optional — see `.env.example`:

- `DATABASE_URL` — defaults to `file:./data/argumesh.db`; remote `libsql://` URLs also work
- `AI_PROVIDERS` / `STEPFUN_*` — environment-level AI fallback (per-account settings take precedence)
- `APP_ACCESS_TOKEN` — HMAC secret for session tokens; auto-generated into `data/session-secret.key` on first run, set it explicitly for any non-local deployment

> ⚠️ By default ArguMesh listens on localhost only. For a public deployment: change the `admin` password, set `APP_ACCESS_TOKEN` explicitly, and put HTTPS in front (e.g. Caddy / Nginx).

## Changelog

### v0.1 — Foundation research workbench
- React 19 + Vite 6 frontend, Hono 4 (`@hono/node-server`) backend, local SQLite (libSQL `file:`) + Drizzle.
- DB-backed accounts (PBKDF2-SHA256 passwords + HMAC sessions) with per-account data isolation.
- Project → Literature (DOI / arXiv / URL import, batch PDF ≤ 25 MB, reading status) → Evidence Matrix (papers × dimensions, AI extraction + human verification with locking).
- PDF reader (pdf.js + OCR), selection-based notes, Paper Card, global search, task center.
- Migrations 0000–0006: projects / papers / paper_files / project_papers / matrices / matrix_papers / dimensions / evidence_cells / extraction_jobs / accounts / ai_settings.

### v0.2 — AI-first reshape
- Extracted the `server/ai/` AI capability layer (`completeJson` / `completeText` primitives + centralized prompts), slimming routes; unified Zod validation + provenance for all AI output.
- Three-entry AI workbench: a Sidebar "AI assistant" trigger, a ProjectHome AI Hero, and a Cmd+K command palette (Research Agent launcher).
- Per-account AI config (Settings page: Base URL / API Key / model; key server-side only), overriding the env fallback.
- Reader AI (summarize / translate / ask) — submits only the selected text, page, and question (minimal exposure).
- Workflow-style sidebar: main rail "Overview / Library / Matrix / Ideas" + "All projects", with downstream tools folded under "More".

### v0.3 — Research arc (2026-08-23)
- **Research Core**: `research_questions` as the spine + `rq_papers` many-to-many linking.
- **Knowledge → Gap → Idea → Experiment** chain, each a first-class object with a state machine and provenance (`source` / `model` / `generatedAt`).
- **Evidence Layers**: refine a quote through `raw → interpretation → implication`, with explicit user-triggered promotion into knowledge / gap / idea.
- Migration `0007_last_deathbird` adds 13 research-arc tables. Run `pnpm run db:migrate` (or a fresh `db:seed`) to apply.
- Admin cross-account data access (in the Cloudflare `prototype/` edition) is intentionally not part of this open-source edition.

## Data & backup

- Database: `data/argumesh.db` (SQLite / libSQL) — projects, papers, evidence, accounts, and PDFs (BLOBs in `paper_files`, ≤ 25 MB per file)
- Backup: `pnpm run db:backup` exports a JSON snapshot to `backups/`; Settings also offers workspace JSON export/restore

## Tech stack

```
React 19 + TypeScript + Vite 6        frontend SPA
Hono 4 + @hono/node-server            API (plain Node process, no cloud bindings)
libSQL / SQLite + Drizzle ORM         all data (including PDFs) in one local file
PBKDF2-SHA256 + HMAC session tokens   account system, no native dependencies
pdfjs-dist + tesseract.js             in-browser PDF rendering + OCR
Any OpenAI-compatible API             AI extraction / reader Q&A / Paper Card (optional)
```

## Project structure

```
src/               # React frontend (pages, components, state, PDF reader)
server/            # Hono API (node.ts entry; routes/ by module)
  auth/            # PBKDF2 password hashing + HMAC session tokens
  db/              # Drizzle schema + client (cached by connection URL)
  routes/          # auth / users / ai / projects / papers / library /
                   # matrix / files / extraction / card / reader
scripts/           # seed, migrate, backup
drizzle/           # SQL migrations (drizzle-kit generated)
tests/unit/        # frontend unit tests (happy-dom)
tests/api/         # API tests (app.request + temporary SQLite)
docs/              # brand guidelines + README screenshots
```

## Tests

```bash
pnpm run test                                # all tests
pnpm run test:watch                          # watch mode
pnpm exec vitest run tests/api/users.test.ts # single test file
```

API tests call the Hono app directly with a fresh temporary SQLite database per test file — no external services required.

## License

[MIT](./LICENSE)
