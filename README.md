# ArguMesh (论脉)

<p align="center">
  <img src="./public/argumesh-logo.svg" alt="ArguMesh 论脉 — Weave evidence into the thread of your research" width="420" />
</p>

> Weave evidence into the thread of your research.

ArguMesh (Chinese name 「论脉」) is a **local-first, open-source research workbench** for researchers, graduate students, and paper authors. It puts the research loop into one traceable workflow:

```text
Literature → Evidence Matrix → Research Thread → Experiments → Writing
                              ↑                      ↓
                              └── Research Agent ────┘
```

Stop shuffling information between PDF readers, spreadsheets, note apps, and chat AI.

- **Zero cloud dependencies** — all data lives in a local SQLite file; no sign-ups, no vendor lock-in
- **Works out of the box** — `pnpm install && pnpm run db:seed && pnpm run dev`, no login required
- **Ask an AI to deploy it** — paste the prompt in [Deploy with AI](#deploy-with-ai) into Cursor, Claude Code, Codex, or Copilot
- **Single-user** — no accounts, no auth; a local workbench that runs on one machine
- **AI is optional** — plug in any OpenAI-compatible endpoint; every manual workflow works without it

> Note: the interface is currently in Chinese. 中文文档见 [README.zh-CN.md](./README.zh-CN.md)。

## Features

### Project-first workspace + Research Agent
Open the app and land on your project list. Inside a project, the sidebar follows the research stages: **AI Research Assistant → Literature → Evidence Matrix → Research Thread → Experiments → Writing**.

The project home is a persistent Research Agent: multi-turn conversations with project context (papers, matrix, research thread, experiment results, paper sources). Each turn can take at most one structured whitelist action — draft an insight, link RQ evidence, design an experiment, propose a paper Diff, compile LaTeX, and more — with clickable citations back into the workspace.

<img src="./docs/screenshots/projects.png" alt="Project list — create, search, and enter research projects" width="900" />

<img src="./docs/screenshots/project-home.png" alt="Project home — Research Agent and project overview" width="900" />

<img src="./docs/screenshots/research-agent.png" alt="Research Agent — project-aware multi-turn AI with structured actions" width="900" />

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
Papers as columns × research dimensions as rows. AI extraction fills every cell with evidence, confidence, and source location (page + excerpt). Then you verify: mark a cell 原文一致 (matches the source), 需要修订 (needs revision), or 标记冲突 (conflict), and 确认并锁定 (confirm & lock) the ones you trust. Locked cells are never silently overwritten by batch AI runs.

<img src="./docs/screenshots/matrix.png" alt="Evidence Matrix — papers × dimensions, with source-linked verification" width="900" />

### Research Thread
One page for the research spine, with two views:

- **Insights** — findings, contradictions, gaps, and concepts (unified view over the older Knowledge / Gap / Idea objects)
- **Research Questions** — promote an insight into an RQ, attach evidence, and track status (open → investigating → evidenced → concluded)

Every AI draft keeps provenance (`source` / `model` / `generatedAt`). Confirmed content is never silently overwritten.

<img src="./docs/screenshots/research-questions.png" alt="Research Thread — research questions linked to papers and evidence" width="900" />

<img src="./docs/screenshots/research-gaps.png" alt="Research Thread — insights pool for findings, contradictions, gaps, and concepts" width="900" />

### Experiments
Design main experiments and ablations with AI assistance, import CSV / JSON / pasted results, and run evidence-cited analysis. ArguMesh does **not** execute experiments for you — it helps you plan, import, and interpret. Each analysis can append a conclusion draft back onto the linked research question.

<img src="./docs/screenshots/experiments.png" alt="Experiments — design, import results, and evidence-cited analysis" width="900" />

### Paper writing (LaTeX)
Bind a local workspace folder to the project, edit `main.tex` / `references.bib`, keep snapshots, review AI Diff proposals before accepting, and optionally compile with Tectonic or latexmk for a real PDF preview. Dangerous shell commands are blocked; accepting a body Diff can trigger compile, and compile problems can generate a fix Diff.

### Global search & task center
Search across projects from one box. Every long AI job shows scope, model, progress, and result — and can be cancelled.

<img src="./docs/screenshots/search.png" alt="Global search across projects and literature" width="900" />

<img src="./docs/screenshots/tasks.png" alt="Task center — AI job scope, progress, status, and results" width="900" />

### Bring your own AI
Configure a single OpenAI-compatible endpoint in Settings — Base URL (default `https://api.openai.com/v1`), API Key, and model name. If the Base URL ends with `/anthropic`, the Anthropic Messages API is used automatically. Keys are stored server-side and never returned to the browser. With no AI configured, every manual workflow still works; AI features return a clear "AI not configured" notice.

<img src="./docs/screenshots/settings.png" alt="Settings — model provider and local data controls" width="900" />

## Why ArguMesh

| Common problem | How ArguMesh handles it |
| --- | --- |
| Papers scattered across folders, browsers, and note apps | Projects scope topics and their literature; search, filters, and tags keep them organized |
| Highlights and summaries never get reused | The reader saves selections as Note / Claim / Evidence with paper + page attached |
| Uploading whole PDFs to AI makes answers unverifiable | Reader Q&A submits only your selected passage, its page, and your question |
| Manual spreadsheets make paper comparison inconsistent | The Evidence Matrix standardizes dimensions; every cell carries source, confidence, and verification state |
| Notes, gaps, ideas, and questions live in separate tools | Research Thread unifies insights and research questions with provenance |
| Experiments and writing are disconnected from evidence | Experiment analysis and LaTeX writing cite project evidence and can jump back into the workspace |
| Batch AI work is opaque and hard to retrace | The task center and Research Agent record scope, model, actions, and results |

## Deploy with AI

If you use [Cursor](https://cursor.com), [Claude Code](https://claude.com/claude-code), Codex, Copilot, or another coding agent that can run commands in this repo, paste the prompt below and let it install, seed, and start ArguMesh. The agent should also read [`CLAUDE.md`](./CLAUDE.md) — that file is the project runbook for coding agents.

```
Deploy ArguMesh (论脉) locally from this repository.

This is a local-first Node.js + SQLite app. Do not add Cloudflare Workers, wrangler, or Turso.

1. Prerequisites: Node.js ≥ 20. If pnpm is missing, run `corepack enable`.
2. Read CLAUDE.md, README.md, and .env.example in the repo root.
3. From the repo root, run `pnpm install`.
4. `.env` is optional. Do not invent or commit API keys. Copy `.env.example` to `.env` only if the user wants to set DATABASE_URL or AI providers.
5. Run `pnpm run db:seed` (idempotent: creates tables + a demo project; no accounts).
6. Start the app:
   - Development (default): `pnpm run dev` → frontend http://localhost:5173 , API 127.0.0.1:8787
   - Single-port production-style: `pnpm run build` then `pnpm start` → http://127.0.0.1:8787
7. Tell the user to open the URL and start working (no login required).

On Windows PowerShell 5.x, chain commands with `;` not `&&`.
Do not expose the server to the public internet unless the user explicitly asks — there is no authentication, so any network access is unrestricted.
Do not start extra services. Confirm the app is up by hitting GET /api/health.
```

Manual steps for humans are in [Deployment](#deployment) below.

## Deployment

Requires Node.js ≥ 20 and pnpm.

```bash
pnpm install
pnpm run db:seed   # create local DB + demo project (safe to re-run; no accounts)
pnpm run dev       # API on 127.0.0.1:8787, frontend on http://localhost:5173
```

Open <http://localhost:5173> and start working — no login required.

Production (single port serving frontend + API):

```bash
pnpm run build     # type-check + build frontend to dist/
pnpm start         # http://127.0.0.1:8787
```

All configuration is optional — see `.env.example`:

- `DATABASE_URL` — defaults to `file:./data/argumesh.db`; remote `libsql://` URLs also work
- `AI_PROVIDERS` / `STEPFUN_*` — environment-level AI fallback (the Settings page global config takes precedence)

> ⚠️ By default ArguMesh listens on localhost only with **no authentication**. Do not expose the API port to untrusted networks. For a public deployment, restrict network access and put HTTPS in front (e.g. Caddy / Nginx).

Optional: install [Tectonic](https://tectonic-typesetting.github.io/) or `latexmk` on the machine if you want in-app LaTeX compile + PDF preview.

## Changelog

### v3.2.0 (2026-08) — Research workbench convergence
Current release (`package.json` `3.2.0`).

- Navigation converged to: **AI Research Assistant → Literature → Evidence Matrix → Research Thread → Experiments → Writing**.
- **Research Thread**: insights pool (finding / contradiction / gap / concept) + research questions; legacy Knowledge / Gaps / Ideas / Questions routes redirect for bookmark compatibility.
- **Experiments**: AI main/ablation design, CSV / JSON / paste import, evidence-cited analysis (does not execute experiments); analysis can append a conclusion draft onto the linked RQ.
- **Writing**: bind a local `workspacePath`, edit `main.tex` / `references.bib`, snapshots, AI Diff review, optional Tectonic / latexmk compile + PDF preview.
- **Persistent Research Agent**: multi-turn conversations, bounded project context, whitelist actions with jumpable citations.
- **Single-user local edition**: removed accounts / auth / `APP_ACCESS_TOKEN` (`accounts` and `owner_id` dropped via `scripts/migrate-custom.ts`); global AI config is a single Settings row.
- Native folder picker for registering `workspacePath`.

### v0.3.0 (2026-08-23) — Research arc
- **Research Core**: `research_questions` as the spine + `rq_papers` many-to-many linking.
- **Knowledge → Gap → Idea → Experiment** chain; each object is first-class with a state machine and provenance (`source` / `model` / `generatedAt`).
- **Evidence Layers**: refine a quote through `raw → interpretation → implication`, with explicit user-triggered promotion.
- Migration `0007_last_deathbird` adds the research-arc tables. Apply with `pnpm run db:migrate` (or a fresh `db:seed`).

### v0.2.0 — AI-first reshape
- Extracted `server/ai/` capability layer (`completeJson` / `completeText` + centralized prompts); routes slimmed; AI output uses Zod validation + provenance.
- Three AI entry points: Sidebar assistant trigger, ProjectHome AI Hero, Research Agent launcher.
- Per-account AI config in Settings (later collapsed to a single global row in v3.2.0), overriding env fallback.
- Reader AI (summarize / translate / ask) — selection + page + question only.
- Workflow-style sidebar: Overview / Library / Matrix / Ideas + More.

### v0.1.0 — Foundation research workbench
- React 19 + Vite 6 frontend, Hono 4 (`@hono/node-server`) backend, local SQLite (libSQL `file:`) + Drizzle.
- Multi-user accounts (PBKDF2-SHA256 + HMAC sessions) — later removed in v3.2.0.
- Project → Literature (DOI / arXiv / URL import, batch PDF ≤ 25 MB, reading status) → Evidence Matrix (papers × dimensions, AI extraction + human verification with locking).
- PDF reader (pdf.js + OCR), selection notes, Paper Card, global search, task center.
- Migrations `0000`–`0006`: projects / papers / paper_files / project_papers / matrices / matrix_papers / dimensions / evidence_cells / extraction_jobs / accounts / ai_settings.

## Data & backup

- Database: `data/argumesh.db` (SQLite / libSQL) — projects, papers, evidence, research thread, experiments, AI conversations, and PDFs (BLOBs in `paper_files`, ≤ 25 MB per file)
- Paper sources: local folder bound via the project's `workspacePath` (`main.tex`, `references.bib`, assets)
- Backup: `pnpm run db:backup` exports a JSON snapshot to `backups/`; Settings also offers workspace JSON export/restore

## Tech stack

```
React 19 + TypeScript + Vite 6        frontend SPA
Hono 4 + @hono/node-server            API (plain Node process, no cloud bindings)
libSQL / SQLite + Drizzle ORM         all structured data (including PDFs) in one local file
pdfjs-dist + tesseract.js             in-browser PDF rendering + OCR
OpenAI- or Anthropic-compatible API   Research Agent / extraction / reader Q&A / writing (optional)
Tectonic or latexmk (optional)        local LaTeX compile + PDF preview
```

## Project structure

```
src/               # React frontend (pages, components, state, PDF reader)
server/            # Hono API (node.ts entry; routes/ by module)
  ai/              # AI primitives + prompts
  db/              # Drizzle schema + client
  routes/          # projects, papers, library, matrix, files, extraction, card,
                   # reader, knowledge, researchQuestions, gaps, ideas, reviews,
                   # experiments, evidenceLayers, researchThread, conversations,
                   # writing, ai, system
  services/        # research-agent, latex, paper-files, project-context, …
scripts/           # seed, migrate, migrate-custom, backup
drizzle/           # SQL migrations (0000–0007; single-user port via migrate-custom)
tests/unit/        # frontend unit tests (happy-dom)
tests/api/         # API tests (app.request + temporary SQLite)
docs/              # brand guidelines + README screenshots
```

## Tests

```bash
pnpm run test                                      # all tests
pnpm run test:watch                                # watch mode
pnpm exec vitest run tests/api/writing.test.ts     # single API test file
```

API tests call the Hono app directly with a fresh temporary SQLite database per test file — no external services required.

## Community

Join the WeChat group **ArguMesh | AI学术工具** to discuss the product, report issues, and share research workflows. Scan with WeChat:

<p align="center">
  <img src="./docs/wechat-group.jpg" alt="WeChat group QR — ArguMesh | AI学术工具" width="280" />
</p>

> WeChat group QR codes expire periodically. If the code above no longer works, open an issue or check the latest README update.

## License

[MIT](./LICENSE)
