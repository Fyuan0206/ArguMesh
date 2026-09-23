# ArguMesh (论脉)

<p align="center">
  <img src="./public/argumesh-logo.svg" alt="ArguMesh 论脉 — Weave evidence into the thread of your research" width="420" />
</p>

> Weave evidence into the thread of your research.

**GitHub: [github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

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

## Acknowledgments

Thanks to [StepFun (阶跃星辰)](https://www.stepfun.com/) for supporting ArguMesh with model API access during development and evaluation.

<p align="center">
  <a href="https://www.stepfun.com/">
    <img src="./docs/stepfun-logo.png" alt="StepFun" height="48" />
  </a>
</p>

## Features

### Project-first workspace + Research Agent
Open the app and land on your project list. Inside a project, the sidebar follows the research stages: **AI Research Assistant → Literature → Evidence Matrix → Research Thread → Experiments → Writing**.

The project home is a persistent **Research Agent** built on the [Pi](https://pi.dev/docs/latest/sdk) `AgentSession` substrate (`@earendil-works/pi-coding-agent`): multi-turn tool loops with bounded project context (papers, matrix, research thread, experiment results, paper sources). Domain whitelist tools can draft insights, link RQ evidence, design experiments, propose paper Diffs, compile LaTeX, and more — with clickable citations back into the workspace. Built-in coding tools (`bash` / `write` / `edit`) stay off; writes remain drafts only.

<img src="./docs/screenshots/projects.png" alt="Project list — create, search, and enter research projects" width="900" />

<img src="./docs/screenshots/project-home.png" alt="Project home — Research Agent and project overview" width="900" />

<img src="./docs/screenshots/research-agent.png" alt="Research Agent — project-aware multi-turn AI with structured actions" width="900" />

### Literature library
Import papers by DOI / arXiv ID / URL with automatic metadata, or batch-upload PDFs (≤ 25 MB each). Track reading status (待读 → 粗读 → 精读 → 核心文献), favorites, tags, and per-project notes. Select multiple papers in the list to **batch-delete** them (same permanent delete as the per-row action: removes PDF, evidence, and linked knowledge across projects after confirm).

**Folder sync (`literature/` inbox)** — if the project has a bound local workspace folder (`workspacePath`), you can drop PDFs into a fixed subfolder and import them in one click:

```text
your-project-folder/
├── paper/              ← LaTeX writing (main.tex, references.bib)
├── literature/         ← drop PDFs here, then sync from the library page
└── .argumesh/          ← internal snapshots (managed by ArguMesh)
```

1. Bind a workspace when creating or editing the project (native folder picker).
2. Put PDF files in `{workspacePath}/literature/` (top level only; subfolders are not scanned in v1).
3. Open **Literature** for that project and click **「同步 literature/」** (Sync `literature/`).

The server reads PDFs from disk, deduplicates by file hash (SHA-256), writes metadata + BLOBs into the local database, and links them to the project. Re-scanning skips papers already in the project; papers imported elsewhere are linked without duplicating the file. Deleting a PDF from the folder does **not** remove the library record (evidence and matrix links stay intact). Limits: ≤ 50 PDFs per sync, ≤ 25 MB per file.

API: `POST /api/projects/:projectId/library/scan-inbox` (requires `workspacePath`).

<img src="./docs/screenshots/library.png" alt="Literature library — papers, reading status, and Paper Card shortcuts" width="900" />

### PDF reader with structured annotations
Built-in PDF reader with OCR. **Select any passage and a floating bubble appears right at the selection** with 翻译 / 高亮 / 笔记 / 证据 one tap away:

- **划词翻译** — the translation renders inline in the bubble (the sidebar card keeps the last result). Only the selected text, its page, and the paper title are sent — never the whole document. Repeating a selection is free: it is served from an in-memory cache. One call covers up to 8,000 characters — a sentence or a paragraph, not a whole page; an over-long selection is refused with an explicit message (and the sidebar character counter turns red) instead of being silently truncated. This is a per-selection translator, not a whole-document one: to read a full page, translate it section by section.
- **原文高亮 + 锚定批注** — highlights, notes, and evidence are painted onto the PDF page as coloured marks anchored to the exact words. Marks are stored in PDF page units, so they stay in place across zoom, page turns, and reloads. Click a mark to jump back to its note in the sidebar.
- **双语对照(左英文 / 右中文)** — the sidebar's 对照 tab splits the **current page** into ~400-character passages and shows the English above a slot for each translation. Nothing is sent until you press **翻译本页**: the page runs 3 passages at a time, with a live `已完成 x / y 段` counter and a cancel button (cancelling keeps — and caches — whatever already finished). Press **宽屏对照** to hide the sidebar and read PDF ≈55% / translation ≈45%. Translations are cached per paper + page + language in IndexedDB, so flipping back to a page you already read is instant and free; the cache stores the source text of every passage and re-validates it, so replacing the PDF can never show the previous paper's translation. This is **per-page**, not whole-document: turn the page and press the button again. Scanned PDFs get an inline **OCR 本页** button instead of a dead end. Click any English passage to drop it into the sidebar's selection box and switch back to 批注, where 高亮 / 笔记 / 证据 work as usual.

Saving a selection as a Note, Claim, or Evidence keeps the paper reference and page number attached. Ask the AI about a passage: only the text you selected, its page number, and your question are sent to the model — never the whole document.

<img src="./docs/screenshots/reader.png" alt="PDF reader — page view, selection, notes, and grounded Q&A" width="900" />

### AI Paper Card
Generate a structured card for any paper: Problem, Method, Data, Findings, Limitations — each field with source excerpts, so every claim can be traced back to the paper.

<img src="./docs/screenshots/paper-card.png" alt="Paper Card — structured problem, method, data, findings, and limitations" width="900" />

### Evidence Matrix
Papers as columns × research dimensions as rows. AI extraction fills every cell with evidence, confidence, and source location (page + excerpt). Then you verify: mark a cell 原文一致 (matches the source), 需要修订 (needs revision), or 标记冲突 (conflict), and 确认并锁定 (confirm & lock) the ones you trust. Locked cells are never silently overwritten by batch AI runs. With many papers (e.g. 50+), the matrix uses **horizontal scroll** with fixed column widths and a sticky left dimension column — use the top search box to filter papers.

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

The same `workspacePath` also hosts the optional **`literature/` PDF inbox** (see [Literature library](#literature-library)) — writing sources live under `paper/`, importable PDFs under `literature/`.

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
| Papers scattered across folders, browsers, and note apps | Projects scope topics and their literature; search, filters, and tags keep them organized; **`literature/` folder sync** imports PDFs from a bound workspace without manual upload |
| Highlights and summaries never get reused | The reader saves selections as Note / Claim / Evidence with paper + page attached |
| Uploading whole PDFs to AI makes answers unverifiable | Reader Q&A submits only your selected passage, its page, and your question; bilingual 对照 submits only the current page's passages, and only after you press 翻译本页 — never the whole document |
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
- `SEARXNG_BASE_URL` — optional self-hosted SearXNG root URL for Research Agent `web_search` (JSON format must be enabled)
- `SEARXNG_TIMEOUT_MS` — optional SearXNG timeout (default 20000)

> ⚠️ By default ArguMesh listens on localhost only with **no authentication**. Do not expose the API port to untrusted networks. For a public deployment, restrict network access and put HTTPS in front (e.g. Caddy / Nginx).

Optional: install [Tectonic](https://tectonic-typesetting.github.io/) or `latexmk` on the machine if you want in-app LaTeX compile + PDF preview.

## Changelog

Version history now lives in **[`CHANGELOG.md`](CHANGELOG.md)** (English entries with Chinese translations). It covers the Docs (2026-09) reader/library updates, v3.2.5 Research Agent web search, v3.2.4 Evidence → Idea loop hardening, v3.2.3 / v3.2.2 Pi as the Research Agent foundation, v3.2.1 literature folder sync, v3.2.0 research workbench convergence, v0.3.0 research arc, v0.2.0 AI-first reshape, and v0.1.0 foundation.

> Adding a user-facing feature? Append to `CHANGELOG.md` in the same task — see [`AGENTS.md`](AGENTS.md#文档规则强制).

## Data & backup

- Database: `data/argumesh.db` (SQLite / libSQL) — projects, papers, evidence, research thread, experiments, AI conversations, and PDFs (BLOBs in `paper_files`, ≤ 25 MB per file)
- Project workspace (optional `workspacePath` on disk):
  - `paper/` — LaTeX sources (`main.tex`, `references.bib`, figures) for writing
  - `literature/` — PDF inbox for one-click library sync (see [Literature library](#literature-library))
  - `.argumesh/` — paper snapshots (managed by ArguMesh)
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
  services/        # research-agent, latex, paper-files, literature-inbox, project-context, …
scripts/           # seed, migrate, migrate-custom, backup
drizzle/           # SQL migrations (0000–0007; single-user port via migrate-custom)
tests/unit/        # frontend unit tests (happy-dom)
tests/api/         # API tests (app.request + temporary SQLite)
docs/              # documentation — see the map below
website/           # static public marketing site (separate Cloudflare Worker)
src-tauri/         # optional Tauri desktop shell + Node sidecar
```

### Documentation map

| File | What's in it |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Collaboration + coding rules for every agent (the cross-tool contract) |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code guidance: commands, architecture, invariants |
| [`PROJECT-SPEC`](docs/PROJECT-SPEC.md) | Positioning, scope, what ArguMesh deliberately does *not* do |
| [`ARCHITECTURE`](docs/ARCHITECTURE.md) | Code layout, 29 tables, routes/services, data organization |
| [`PAGE-STRUCTURE`](docs/PAGE-STRUCTURE.md) | Routes, legacy-link compatibility, per-page behavior |
| [`COMPONENT-GUIDELINES`](docs/COMPONENT-GUIDELINES.md) | Shared primitives, CSS tokens, accessibility |
| [`DEVELOPMENT`](docs/DEVELOPMENT.md) | Commands, env vars, two-track migrations, test layout |
| [`DEPLOYMENT`](docs/DEPLOYMENT.md) | Local / public website / desktop installer |
| [`DESIGN`](DESIGN.md) | Visual direction, design tokens, QA history |
| [`CHANGELOG`](CHANGELOG.md) | Version history (English + Chinese) |
| [`TODO`](TODO.md) | Current progress, deferred items, known debts |

Also in `docs/`: [`brand-guidelines.md`](docs/brand-guidelines.md), [`reference-projects.md`](docs/reference-projects.md), and the [`distribution research`](docs/DISTRIBUTION-RESEARCH-2026-09-20.md) decision record (deferred).

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

## Reference projects

Projects and products we consulted while shaping the roadmap (summaries + links only — **not vendored**). Full comparison: **[docs/reference-projects.md](./docs/reference-projects.md)**.

| Project | One-liner |
| --- | --- |
| [ARIS](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) | Skill-driven “research while you sleep” loop: lit → idea → experiment → writing → review |
| [karpathy/autoresearch](https://github.com/karpathy/autoresearch) | Single-GPU agent loop that edits code, measures metrics, and keeps improvements |
| [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) | Autoresearch wired to the pi terminal agent (resumable `.auto/` sessions) |
| [Mimir](https://github.com/1692775560/Mimir) | DeepSeek Harness plugin: eight-view research workbench (library / experiments / writing / meetings) |
| [Open Science Desktop](https://github.com/ai4s-research/open-science) ([中文](https://github.com/ai4s-research/open-science/blob/master/README.zh.md)) | Local-first, model-agnostic AI research desktop (Tauri + MCP + skills; open Claude Science alternative) |
| [小绿鲸](https://www.xljsci.com/) | Commercial English literature reader: domain translation, skimming, notes, citations, report PPT |
| [Agentero](https://github.com/poco-ai/agentero) | Agent-native local literature workbench (Vault + ACP BYOA + Zotero / PDF / wikilinks) |

ArguMesh focuses on a **local SQLite, evidence-first object model**; these lean more agent / skill / reading-product / auto-experiment — complementary, not replacements.

## License

[MIT](./LICENSE)
