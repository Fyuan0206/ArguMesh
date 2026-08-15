# ArguMesh (论脉)

<p align="center">
  <img src="./public/argumesh-logo.svg" alt="ArguMesh 论脉 — Weave evidence into the thread of your research" width="420" />
</p>

> Weave evidence into the thread of your research.

ArguMesh (Chinese name 「论脉」) is a **local-first, open-source research workbench** for researchers, graduate students, and paper authors. It puts the whole research loop — define a topic → collect papers → read & annotate → compare evidence → form ideas → plan experiments — into one traceable workflow, so you stop shuffling information between PDF readers, spreadsheets, note apps, and chat AI.

- **Zero cloud dependencies** — all data lives in a local SQLite file; no sign-ups, no vendor lock-in
- **Works out of the box** — `pnpm install && pnpm run dev`, default admin `admin / admin123`
- **Multi-user** — admins create member accounts; all data is isolated per account
- **AI is optional** — plug in any OpenAI-compatible endpoint (OpenAI / DeepSeek / StepFun / local models); every manual workflow works without it

> Note: the interface is currently in Chinese. 中文文档见 [README.zh-CN.md](./README.zh-CN.md)。

## Features

### Project-first workspace
Sign in and you land on your project list. Click a project and the workspace scopes to it: literature, evidence matrices, and ideas are all organized inside the project, while cross-project tools (knowledge base, task center, global search) stay one click away in the sidebar.

### Literature library
Import papers by DOI / arXiv ID / URL with automatic metadata, or batch-upload PDFs (≤ 25 MB each). Track reading status (待读 → 粗读 → 精读 → 核心文献), favorites, tags, and per-project notes.

### PDF reader with structured annotations
Built-in PDF reader with OCR. Select any passage and save it as a Note, Claim, or Evidence — the paper reference and page number stay attached. Ask the AI about a passage: only the text you selected, its page number, and your question are sent to the model — never the whole document.

### AI Paper Card
Generate a structured card for any paper: Problem, Method, Data, Findings, Limitations — each field with source excerpts, so every claim can be traced back to the paper.

### Evidence Matrix
The core of ArguMesh: papers as columns × research dimensions as rows. AI extraction fills every cell with evidence, confidence, and source location (page + excerpt). Then you verify: mark a cell 原文一致 (matches the source), 需要修订 (needs revision), or 标记冲突 (conflict), and 确认并锁定 (confirm & lock) the ones you trust. Locked cells are never silently overwritten by batch AI runs.

### Idea workflow
Ideas move through a kanban board (Inbox → Draft → Reviewing → Approved → Experimenting → Writing → Archived). The Idea Canvas links Problem, Gap, Hypothesis, Method, Experiment, and Risks to the evidence behind them, and every save keeps a version history.

### Knowledge base
Notes, Claims, and Evidence in one place, linked to their papers and pages — the raw material your Ideas are built from.

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
docs/              # brand guidelines
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
