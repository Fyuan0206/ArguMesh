<p align="center">
  <img src="./public/argumesh-logo.svg" alt="ArguMesh 论脉 — Weave evidence into the thread of your research" width="420" />
</p>

<h1 align="center">ArguMesh · 论脉</h1>

<p align="center"><strong>Weave evidence into the thread of your research.</strong></p>

<p align="center">
  <strong>English</strong> · <a href="./README.md">简体中文</a> · <a href="https://github.com/Fyuan0206/ArguMesh/releases">Releases</a> · <a href="./LICENSE">MIT</a>
</p>

<p align="center">
  <a href="#why-argumesh">Why ArguMesh</a> · <a href="#features">Features</a> · <a href="#screenshots">Screenshots</a> · <a href="#download">Download</a> · <a href="#documentation-map">Docs</a> · <a href="#community">Community</a>
</p>


<p align="center">
  💬 <strong>WeChat community:</strong>
  <a href="https://github.com/Fyuan0206/ArguMesh/issues/4">View the group QR code</a>
</p>

<p align="center">
  🌐 <strong>Official website:</strong>
  <a href="https://argumesh.nekocfy.com/">argumesh.nekocfy.com</a>
</p>

ArguMesh (Chinese name 「论脉」) is a **local-first, open-source research workbench** for researchers, graduate students, and paper authors. It connects literature, evidence, research questions, experiments and writing in one traceable workflow.

Stop shuffling information between PDF readers, spreadsheets, note apps, and chat AI.


> Note: the interface is currently in Chinese. 中文文档见 [README.md](./README.md)。

<p align="center">Literature → Evidence Matrix → Research Thread → Experiments → Writing</p>

- **Local SQLite** — zero cloud dependencies, no accounts or login.
- **Optional AI** — bring your own model API; manual workflows work without it.
- **You stay in control** — AI drafts keep sources; confirmed and locked evidence is protected.

## 🤝 Acknowledgments

<details open>
<summary>Thanks to StepFun for model API support</summary>

Thanks to [StepFun](https://www.stepfun.com/) for supporting development and evaluation.

<p align="center">
  <a href="https://www.stepfun.com/">
    <img src="./docs/stepfun-logo.png" alt="StepFun" height="48" />
  </a>
</p>

</details>

## Why ArguMesh

| Common problem | How ArguMesh handles it |
| --- | --- |
| Papers scattered across folders, browsers, and note apps | Projects scope topics and their literature; search, filters, and tags keep them organized; **`literature/` folder sync** imports PDFs from a bound workspace without manual upload |
| Highlights and summaries never get reused | The reader saves selections as Note / Claim / Evidence with paper + page attached |
| Uploading whole PDFs to AI makes answers unverifiable | Reader Q&A submits only your selected passage, its page, and your question; bilingual 对照 submits only the current page's passages, and only after you press 精确解析并翻译全文 — never the whole document |
| Manual spreadsheets make paper comparison inconsistent | The Evidence Matrix standardizes dimensions; every cell carries source, confidence, and verification state |
| Notes, gaps, ideas, and questions live in separate tools | Research Thread unifies insights and research questions with provenance |
| Experiments and writing are disconnected from evidence | Experiment analysis and LaTeX writing cite project evidence and can jump back into the workspace |
| Batch AI work is opaque and hard to retrace | The task center and Research Agent record scope, model, actions, and results |

## Features

| Stage | Capabilities |
| --- | --- |
| Literature | DOI / arXiv / PDF import, folder sync, reading and annotations |
| Evidence | Paper Cards, evidence matrix, source tracing, confirmation and locking |
| Research | Insights, research questions and a project-aware Research Agent |
| Experiments & writing | Experiment plans, result analysis, LaTeX editing and Diff review |

<details>
<summary>Explore all features</summary>

### Project-first workspace + Research Agent
Open the app and land on your project list. Inside a project, the sidebar follows the research stages: **AI Research Assistant → Literature → Evidence Matrix → Research Thread → Experiments → Writing**.

The project home is a persistent **Research Agent** built on the [Pi](https://pi.dev/docs/latest/sdk) `AgentSession` substrate (`@earendil-works/pi-coding-agent`): multi-turn tool loops with bounded project context (papers, matrix, research thread, experiment results, paper sources). Domain whitelist tools can draft insights, link RQ evidence, design experiments, propose paper Diffs, compile LaTeX, and more — with clickable citations back into the workspace. Built-in coding tools (`bash` / `write` / `edit`) stay off; writes remain drafts only.

Interrupted turns can be retried: the old session is stopped and context is rebuilt from saved messages, retaining failed messages and action records. Long turns have keepalives and a five-minute timeout. Duplicate submissions are blocked while running; ending a conversation or leaving the page cancels its request. Busy and timeout errors use Chinese guidance, and each turn allows at most one whitelisted write action.

**Skills (v3.3.3)** — Click **管理技能** in the left sidebar to open the skill management dialog and inspect, enable/disable or install skills. The Research Agent composer retains automatic selection, no skills, or a specific enabled skill. **Eleven Nature research skills** replace the previous three defaults: literature search, citation checking, data availability, scientific figures, paper-to-patent drafting, paper presentations, polishing, bilingual reading, reviewer responses, simulated peer review and manuscript writing. Bundled content can be inspected and enabled/disabled, but cannot be uninstalled. Existing user installations with the same name take precedence, including their disabled state. Import a local `SKILL.md` or a skill folder, review the preview, then install; user-installed skills can be uninstalled. Skills are stored locally and shared across projects, without another account.

The Nature packages provide text workflows and reference material. Python/R/MCP execution, figure rendering and PPTX/DOCX file generation are not connected. Binary image collections are omitted and missing shared references are documented; loading a skill does not supply all the tools described in its original package.

Skills can read their packaged text resources, but cannot run Python/Shell scripts or access arbitrary files. Each skill actually loaded in a turn retains its source, content version, load time and content snapshot; disabling, uninstalling or reinstalling a skill does not rewrite previous message records. Domain writes remain drafts, with at most one per turn. ArguMesh no longer auto-discovers local `.agents/skills`, `.pi/skills` or Pi extensions: install local skills through the management entry. See the [development guide](docs/DEVELOPMENT.md#research-agent-与-skills-接入现状) for format, limits and migration details.

### Literature library

Uploaded PDF filenames and contents are saved in the local database under the user data directory and remain available after restarts and in-place updates. Existing PDFs with missing filenames regain their Read action, and reader upload failures are reported. No database migration or re-import is needed for PDFs already stored in the database; files that only survived in an old browser cache must be selected once more. This fix is available in source; a new installer has not been released.
Import papers by DOI / arXiv ID / URL with automatic metadata, or batch-upload PDFs (≤ 25 MB each). Track reading status (待读 → 粗读 → 精读 → 已复现 → 核心文献), favorites, tags, and per-project notes. Select multiple papers in the list to **batch-delete** them (same permanent delete as the per-row action: removes PDF, evidence, and linked knowledge across projects after confirm).

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

### PDF reader with structured annotations

The reader shares one top toolbar for page navigation, zoom, OCR, translation actions, linked scrolling and view tabs, with progress and fallback notices in a separate status row. Both panes use matching page origins, margins and zoom, fitting the narrower pane. Linked scrolling synchronizes both page-relative vertical position and horizontal position; disabling it keeps panes independent. Height-only changes preserve manual zoom. Translations retain natural text flow, with vertical linking based on relative position within each page.

Built-in PDF reader with OCR. **Select any passage and a floating bubble appears right at the selection** with 翻译 / 高亮 / 笔记 / 证据 one tap away:

- **划词翻译** — the translation renders inline in the bubble (the sidebar card keeps the last result). Only the selected text, its page, and the paper title are sent — never the whole document. Repeating a selection is free: it is served from an in-memory cache. One call covers up to 8,000 characters — a sentence or a paragraph, not a whole page; an over-long selection is refused with an explicit message (and the sidebar character counter turns red) instead of being silently truncated. Use the side-by-side reader below for whole-paper translation.
- **原文高亮 + 锚定批注** — highlights, notes, and evidence are painted onto the PDF page as coloured marks anchored to the exact words. Marks are stored in PDF page units, so they stay in place across zoom, page turns, and reloads. Click a mark to jump back to its note in the sidebar.
- **Side-by-side translation** — Original PDF on the left, current translated page on the right. Inspired by Little Green Whale, the translated sheet has a centered title, continuous serif prose, source columns and spanning figures/tables in their corresponding vertical sections. Both panes scroll vertically through consecutive sheets, with an automatically updated page number. **双屏关联** aligns the same page and relative position or allows independent scrolling. Outline, search and page-number jumps remain available; reopening restores the last page. Only nearby pages are rendered, and scrolling reads caches without starting AI requests. **精确解析并翻译全文** uses the bundled MinerU 3.4.2 CPU runtime to parse locally, then translates only the active page's prose and captions, up to 3 requests at a time. The toolbar shows pages, model, progress and cancellation; retries reuse completed translations.
- **Original figures and tables** — Figures, tables and equations retain locally extracted source pixels, including English labels and exact numeric values. Automatic figure OCR translation and table-cell translation are removed; captions and notes are translated separately. If table pixels are unavailable, original rows and merged cells remain intact. Translations are marked as AI drafts; click a passage to inspect its source, or hover for the page, model and generation time. New parser/translation caches are versioned separately; old caches remain and the first run requires parsing and translation again.
- **Bundled parser environment** — No separate Python, MinerU or PATH setup is needed; required Windows C++ libraries are included. The first precise translation downloads about 2.5 GB of parsing models with model-group progress, cancellation and retry. Models remain in user data for reuse after restarts and upgrades.
- **Data sent to AI** — Only the active page's prose or caption segments are sent after a translation click, never figure/table images or the whole PDF. Scanned pages offer **OCR 本页**; the fast text preview has approximate layout, while figures and full layout require precise parsing. **批注与问答** remains available from the translation toolbar.

Saving a selection as a Note, Claim, or Evidence keeps the paper reference and page number attached. Ask the AI about a passage: only the text you selected, its page number, and your question are sent to the model — never the whole document.

For scanned or older papers, use **OCR 本页 → 翻译本页** to translate recognized page text without waiting for precise layout parsing. English OCR worker, WASM core and language data are bundled with the application, removing runtime CDN downloads. Preparation, engine loading and recognition progress are shown, with cancellation and timeout recovery. If precise parsing fails, whole-paper translation can use existing native/OCR page text with an explicit approximate-layout notice; otherwise it asks for page OCR. Reader tabs remain accessible during paused or failed translations. Failure notices distinguish connection, key/permission, quota/rate-limit and timeout problems.

Annotations and Q&A use readable typography and darker body text: 16px input fields and 15px excerpts/answers, wrapping action buttons and larger selection-translation bubbles across Windows, macOS and iOS browsers.

### AI Paper Card
Generate a structured card for any paper: Problem, Method, Data, Findings, Limitations — each field with source excerpts, so every claim can be traced back to the paper.
The generation button and progress notice show the active model, refreshing configuration before each request. Existing cards retain their original generation model as historical provenance.

Choose **对照 PDF 填写** on the paper detail page, or the **Paper Card** reader tab, to edit while viewing the PDF. Wide screens show both panes side by side; narrow screens stack independently scrolling panes. Switching between notes, translation and the card preserves unsaved card drafts; click **保存 Paper Card** to persist them. Opening this view does not call AI.

### Evidence Matrix
Papers as columns × research dimensions as rows. AI extraction fills every cell with evidence, confidence, and source location (page + excerpt). Then you verify: mark a cell 原文一致 (matches the source), 需要修订 (needs revision), or 标记冲突 (conflict), and 确认并锁定 (confirm & lock) the ones you trust. Locked cells are never silently overwritten by batch AI runs. With many papers (e.g. 50+), the matrix uses **horizontal scroll** with fixed column widths and a sticky left dimension column — use the top search box to filter papers.

Open source enters the in-app PDF reader and jumps to the evidence page when its page label can be read. After reviewing, use Confirm this paper or Confirm entire matrix: inspect the scope and counts, then confirm and lock sourced drafts in one operation. Confirmed, locked, missing, conflicting and unextracted cells remain unchanged. Entire-matrix confirmation includes papers hidden by search and explicitly says so before submission. Batch confirmation records your judgment; it does not automatically verify evidence. No database migration is required.

### Research Thread
One page for the research spine, with two views:

- **Insights** — findings, contradictions, gaps, and concepts (unified view over the older Knowledge / Gap / Idea objects)
- **Research Questions** — promote an insight into an RQ, attach evidence, and track status (open → investigating → evidenced → concluded)

Every AI draft keeps provenance (`source` / `model` / `generatedAt`). Confirmed content is never silently overwritten.

### Experiments
Design main experiments and ablations with AI assistance, import CSV / JSON / pasted results, and run evidence-cited analysis. ArguMesh does **not** execute experiments for you — it helps you plan, import, and interpret. Each analysis can append a conclusion draft back onto the linked research question.

### Paper writing (LaTeX)
Bind a local workspace folder to the project, edit `main.tex` / `references.bib`, keep snapshots, review AI Diff proposals before accepting, and optionally compile with Tectonic or latexmk for a real PDF preview. Dangerous shell commands are blocked; accepting a body Diff can trigger compile, and compile problems can generate a fix Diff.

The same `workspacePath` also hosts the optional **`literature/` PDF inbox** (see [Literature library](#literature-library)) — writing sources live under `paper/`, importable PDFs under `literature/`.

### Global search & task center
Search across projects from one box. Every long AI job shows scope, model, progress, and result — and can be cancelled.

### Bring your own AI
Configure a single OpenAI-compatible endpoint in Settings — Base URL (default `https://api.openai.com/v1`), API Key, and model name. If the Base URL ends with `/anthropic`, the Anthropic Messages API is used automatically. Keys are stored server-side and never returned to the browser. With no AI configured, every manual workflow still works; AI features return a clear "AI not configured" notice.

Model settings show the active configuration source and model. After saving, use **Connection check** to make one real short-message request and see the model, API format, elapsed time, and check timestamp. Failures distinguish key/permission, quota/rate limit, endpoint/model, network, and timeout issues. The check sends only a fixed message, never paper content, and may incur a small API charge. It times out after 30 seconds and can be cancelled. Save edited settings before checking again.

</details>

## Screenshots

| Research Agent | PDF reader | Evidence matrix |
| --- | --- | --- |
| <img src="./docs/screenshots/project-home.png" alt="Research Agent" width="300" /> | <img src="./docs/screenshots/reader.png" alt="PDF reader" width="300" /> | <img src="./docs/screenshots/matrix.png" alt="Evidence matrix" width="300" /> |

| Research thread | Experiments | Paper Card |
| --- | --- | --- |
| <img src="./docs/screenshots/research-questions.png" alt="Research thread" width="300" /> | <img src="./docs/screenshots/experiments.png" alt="Experiments" width="300" /> | <img src="./docs/screenshots/paper-card.png" alt="Paper Card" width="300" /> |

Click an image to view it at full size.

## Download

**v3.3.3 released (2026-10-29).** The [Windows x64 installer and release notes](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.3.3) are available with a [SHA-256 checksum file](https://github.com/Fyuan0206/ArguMesh/releases/download/v3.3.3/ArguMesh_3.3.3_x64-setup.exe.sha256). This release includes Nature skills, Paper Card comparison, reader pane alignment and PDF persistence fixes. The Apple Silicon Mac v3.3.3 installer is available on the [FakeNirvana fork's Mac Release](https://github.com/FakeNirvana/ArguMesh/releases/tag/v3.3.3-macos) until the upstream v3.3.3 Release receives its Mac asset. Desktop upgrades apply the additive `0015_agent_skills` migration in a transaction, preserving projects, messages and saved AI settings. Fresh installations use an empty database without user data or API keys. The Windows installer is unsigned, and the Mac build has no Apple Developer signature or notarization. The application has no authentication and listens only on loopback. See the [build instructions](docs/DEPLOYMENT.md).

**Windows v3.3.3 installation notes.** Close ArguMesh before installing over your current version; the installer does not overwrite an existing database or saved AI settings. Export a workspace backup before upgrading. The desktop app checks GitHub for stable releases at startup, shows a dismissible download notice, and offers **Settings → 应用更新 → 检查更新**. This optional check sends no research content; failed checks do not block use. v3.2.5 has no in-app checker, so please upgrade once manually. Private Node / Python / MinerU runtimes and required Windows C++ libraries are included. The first precise translation downloads about 2.5 GB of parsing models with progress, cancellation and retry; subsequent runs and upgrades reuse them.

Current installers are listed by platform below. The Apple Silicon Mac DMG and its checksum are on the [v3.3.3 Mac Release](https://github.com/FakeNirvana/ArguMesh/releases/tag/v3.3.3-macos):

| File | For |
| --- | --- |
| [`ArguMesh_3.3.3_x64-setup.exe`](https://github.com/Fyuan0206/ArguMesh/releases/download/v3.3.3/ArguMesh_3.3.3_x64-setup.exe) | Windows 10/11 x64; `currentUser` install (no administrator rights) |
| [`ArguMesh_3.3.3_aarch64.dmg`](https://github.com/FakeNirvana/ArguMesh/releases/download/v3.3.3-macos/ArguMesh_3.3.3_aarch64.dmg) | macOS Apple Silicon (M series); not for Intel Macs |

**Known shared-data limitations:** keeping the web and desktop entry points open together can overwrite workspace changes. An existing shared workspace can replace browser-only Paper Cards; export a backup and use one entry point at a time. Legacy source-run databases at `./data/argumesh.db` are not automatically moved to the user directory; keep `DATABASE_URL=file:./data/argumesh.db` explicitly set until migration is arranged.

> ⚠️ **Read this before you install**
>
> 1. **The installer ships an empty database.** Your projects, papers, evidence, and AI settings are *not* inside it. On a fresh installation, open **Settings** and fill in your AI provider (Base URL / API Key / model) — until you do, the first AI feature you touch will say 未配置.
> 2. **The build is not code-signed.** Windows SmartScreen will warn that the publisher is unknown. That is expected, not a defect — click **More info → Run anyway**.
> 3. **The app has no authentication.** It listens on localhost only, but every `/api/*` route is directly reachable. Do not expose its port to a network you do not trust.

### Install

1. Download the `.exe` from the release page.
2. Double-click it. `currentUser` mode means **no administrator rights are needed**; the installer offers English + 简体中文.
3. Launch ArguMesh. First launch can be slow (**8–75 s**) while antivirus scans the bundled Node sidecar — the shell waits up to 90 s.

### Where your data lives

The installer copies an empty database to `%LOCALAPPDATA%\ArguMesh\data\argumesh.db` **on first launch only**; an existing database is never touched, so upgrading or reinstalling keeps your projects. To start over, uninstall and delete that folder.

Troubleshooting entry point: `%LOCALAPPDATA%\ArguMesh\sidecar.log` — it records the sidecar path, its PID, and all of its stderr.

### Not on Windows?

On an **Apple Silicon Mac**, download the DMG from the [v3.3.3 Mac Release](https://github.com/FakeNirvana/ArguMesh/releases/tag/v3.3.3-macos), open it, drag `ArguMesh.app` into Applications and replace the old version, then launch it from there. The Mac bundle includes private Node, Python and MinerU runtimes; parsing models download on first precise translation. Data is stored under `~/Library/Application Support/ArguMesh`, including the database, workspace file and reading cache (OCR text and translations), which remain readable after desktop restarts on a new port. The Mac build has no Apple Developer signature or notarization, so you must approve its first launch in macOS. The v3.3.3 DMG reports app version 3.3.3; archive integrity, the empty database template, local replacement installation, startup and project read/write passed verification. Source-build instructions are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §3.

The DMG contains one `ArguMesh.app`. Drag it to Applications and replace the old version. Apps named `previous`, `pre-cache`, or `before` are old backup copies and can be moved to Trash; research data lives in the Application Support directory above, outside the app bundle.

On other platforms, run it from source — see [Deployment](#deployment) below (`pnpm install` → `pnpm run db:seed` → `pnpm run dev`), or paste the [Deploy with AI](#deploy-with-ai) prompt into a coding agent.

The desktop and web builds share the core research workflows. The Tauri desktop host also provides a local sidecar, an installer and update reminders. To build it yourself, follow the recipe in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §3.

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

<details>
<summary>Deploy with a coding agent (expand prompt)</summary>

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

</details>

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
| [`ARCHITECTURE`](docs/ARCHITECTURE.md) | Code layout, 30 tables, routes/services, data organization |
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

Join the WeChat group **ArguMesh | AI学术工具** to discuss the product, report issues, and share research workflows.

💬 **[View the group QR code](https://github.com/Fyuan0206/ArguMesh/issues/4)**

The latest QR code and validity window are maintained in that issue. If the code expires or the group is full, leave a comment there.

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
| [Agentero](https://github.com/poco-ai/Agentero) | Priority competitor: local literature and agent workbench (discovery / PDF / wikilinks / Zotero / TeX compilation; [2026-10-14 analysis: 10 modules, 40 capabilities](./docs/AGENTERO-RESEARCH-2026-10-14.md), source/docs review without runtime acceptance testing) |

ArguMesh focuses on a **local SQLite, evidence-first object model**; these lean more agent / skill / reading-product / auto-experiment — complementary, not replacements.

## License

[MIT](./LICENSE)
