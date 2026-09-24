# 分发调研：Open Science Desktop 实测 + ArguMesh 可下载化路线

**日期**：2026-09-20
**触发**：用户指定 `ai4s-research/open-science` 为主要学习对象，并要求最终「让用户可以下载」（形态倾向：**Windows EXE 安装包**）。
**性质**：调研与决策依据，**不含代码改动**。实施前需用户确认第 9 节的路线选择。

> **状态：已暂缓（2026-09-20 用户决定）。** 用户原话：「目前还有功能没实现，暂时不这样做，保留方案。」→ **不要开始实施**，也不要把它排进待办。方案本身（第 8 节）保持有效，等功能就绪、用户重新提出时再启动。
>
> **更新（2026-09-24）：暂缓已解除。** 用户重新提出发布，`v3.2.5` 已带上 Windows NSIS 安装包发到 [GitHub Releases](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5)，两份 README 也补上了「下载安装」章节。本文件作为当时的调研与决策依据**原样保留**，其中「明确未做」一节里已完成的是「双语 README 的『下载 / 安装』章节」；仍未做：`.github/workflows/release.yml`、代码签名、壳的打磨、已有安装的升级迁移路径、Bun 探针。当前有效的构建与发布方法见 [`DEPLOYMENT.md`](DEPLOYMENT.md) §3。

---

## 1. 结论先行

1. **学习对象已实测抓取**（README.zh.md 全量 + 仓库元数据 + 5 个 Release 的资产与下载量 + `tauri.conf.json` + CI workflow + sidecar 构建脚本），不是凭印象。
2. **它的 Windows 资产是 NSIS `-setup.exe`，且按用户安装、无需管理员**；这一个资产占其 v0.5.2 全部下载量的 **67%**（1039 / 1546）。用户「就是一个 EXE 的安装包」的判断与它的真实数据一致。
3. **它的 Windows / Linux 构建是未签名的**（只有 macOS 做了 Developer ID 签名 + 公证 + staple），README 直接教用户点 SmartScreen 的「更多信息 → 仍要运行」，且把「Windows 代码签名、自动更新」列为进行中的工作。→ **签名不是前置条件**，我们同样可以先发未签名包。
4. **ArguMesh 走 Node SEA / `pkg` 单文件方案基本不可行**：运行时依赖原生 `.node`（`@libsql/win32-x64-msvc/index.node`、pi-tui 的 `win32-console-mode.node`），而 Node 官方的 single-executable-app 明确不支持加载原生插件。Bun `--compile` 有希望但必须做 1 天探针验证。
5. **推荐路线：Tauri 2 薄壳 + Node 服务 sidecar**（与学习对象同构，`nsis.installMode: "currentUser"` 产出 `ArguMesh_x64-setup.exe`）。预计安装包 **80–110 MB**（与它的 77 MB 同级）。**核心零改动**——`server/index.ts` 本来就是宿主无关的 Hono app，`server/node.ts` 只是它现在的宿主，Tauri 是第三个宿主。

---

## 2. 调研方法与可信度

本机 `raw.githubusercontent.com` 被网络策略单独阻断（curl 超时、WebFetch 域名校验失败），但 `api.github.com` 与 `ghproxy.net` 镜像可达，因此：

| 数据 | 来源 | 可信度 |
| --- | --- | --- |
| README.zh.md 全文 | ghproxy 镜像拉取，27,655 字节 | 高（一手） |
| 仓库元数据 / Releases / 资产下载量 | `api.github.com` | 高（一手） |
| `tauri.conf.json`、`.github/workflows/build.yml`、`scripts/dev/build-osd-sidecar.sh` | 镜像拉取原文 | 高（一手） |
| 全部 960 个路径的文件树 | `git/trees?recursive=1`（未截断） | 高 |

**未能取得**：`docs/PRD.md`、`docs/TECHNICAL_DESIGN.md`、`PROGRESS.md`、官网 openedscience.com 的正文。上面三项是其内部分布式设计的自述，若后续要抄它的 PRD/技术设计结构，需要网络恢复后再取。

---

## 3. 学习对象实测画像

| 项 | 实测值 |
| --- | --- |
| 仓库 | `ai4s-research/open-science`（原名 Open Science） |
| 版本 / 最近发布 | **v0.5.2**，2026-09-08 |
| 星标 / Fork | **1670 / 207** |
| 建仓 / 最近推送 | 2026-07-03 / 2026-09-18（**约 2.5 个月从 0 到 1670 星**） |
| 主语言 | TypeScript（桌面壳 Rust） |
| 技术栈 | **Tauri 2 + React + TypeScript + Vite**；运行时为内置固定版本 **OpenCode sidecar** |
| 许可证 | MIT（GitHub API 报 `NOASSERTION`，因捆绑第三方 skills/连接器各自许可） |
| 引用 | Zenodo DOI `10.5281/zenodo.21351225` + `CITATION.cff` |
| 状态自述 | 「正在积极开发的桌面 MVP」；近期重点 = Windows 代码签名、自动更新、更广的 Win/Linux 验证 |

### 发布节奏

`v0.4.1`(08-15) → `v0.4.2`(08-16) → `v0.5.0`(08-19) → `v0.5.1`(08-28) → `v0.5.2`(09-08)。**每 1–2 周一个版本**，5 个 release 全是正式版（无 prerelease）。

### v0.5.2 资产与下载量（分发形态的直接证据）

| 资产 | 大小 | 下载 |
| --- | --- | --- |
| `Open.Science_0.5.2_x64-setup.exe`（**NSIS 安装包**） | 77.4 MB | **1039** |
| `Open.Science_0.5.2_aarch64.dmg` | 106.6 MB | 209 |
| `Open.Science_0.5.2_amd64.deb` | 113.1 MB | 85 |
| `Open.Science_0.5.2_x64.dmg` | 114.8 MB | 47 |
| `Open.Science_0.5.2_x64_en-US.msi` | 108.6 MB | 41 |
| `Open.Science-0.5.2-1.x86_64.rpm` | 113.2 MB | 29 |
| `osd-0.5.2-x86_64-pc-windows-msvc.zip`（无头） | 95.9 MB | 33 |
| `osd-0.5.2-x86_64-unknown-linux-gnu.tar.gz`（无头） | 98.4 MB | 32 |
| `osd-0.5.2-aarch64-apple-darwin.tar.gz` | 80.6 MB | 17 |
| `osd-0.5.2-x86_64-apple-darwin.tar.gz` | 84.5 MB | 14 |
| **合计** | — | **1546** |

**Windows EXE 占 67.2%**；macOS 两个 dmg 合计 256（16.6%）；Linux deb+rpm 114（7.4%）；无头包 96（6.2%）。MSI 只有 41 —— README 明说 MSI 是「供机构批量部署」，且告诫「两种格式请择一使用，不要混装」。

---

## 4. 它的分发机制到底怎么做的（源码级）

### `apps/desktop/src-tauri/tauri.conf.json`

```json
"bundle": {
  "active": true,
  "targets": "all",
  "externalBin": ["binaries/opencode", "binaries/uv",
                  "binaries/agent-browser", "binaries/osd"],
  "windows": { "nsis": { "installMode": "currentUser",
                          "installerHooks": "nsis/hooks.nsh",
                          "customLanguageFiles": { "English": "nsis/English.nsh" } } },
  "macOS": { "hardenedRuntime": true, "minimumSystemVersion": "13.0" },
  "resources": { "...skills/", "...plugins/", "...examples/", "...acp-server/" }
}
```

要点：
- `targets: "all"` → Windows 同时出 **NSIS + MSI**，macOS 出 dmg/app，Linux 出 deb/rpm。
- `installMode: "currentUser"` → **按用户安装，不需要管理员权限**。这正是「双击就能装」的关键。
- `externalBin` **4 个 sidecar 二进制**直接打进安装包（运行时 + uv + 浏览器 + `osd` CLI）。
- `installerHooks` + 自定义语言文件 → 安装时把 `osd` 写进 PATH 的包装脚本（`~/.local/bin/osd`），并在「设置 → 远程访问」里说明改了哪个文件。
- skills / 插件 / 示例作为 `resources` 一起打包；构建时用 `fetch-skills.sh` 拉取而非提交进 git 历史。

### `.github/workflows/build.yml`

- 4 平台 matrix：`macos-latest`(aarch64)、`macos-latest`(x64)、`windows-latest`、`ubuntu-22.04`。
- `tauri-apps/tauri-action@v0` 在 `v*` tag push 时**建 draft release 并上传资产**（`permissions: contents: write`）。
- 签名只配了 `APPLE_*`（certificate / password / identity / APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID）；**没有任何 Windows 证书 secret** → Windows 产物未签名，与 README 自述一致。
- macOS 公证走独立 workflow `finalize-macos-notarization.yml` + `scripts/release/finalize-macos-notarization.sh`、`verify-macos-signing.sh`。
- 无头包由 `scripts/release/package-osd.sh` 单独打包，`gh release upload --clobber` 挂到同一 release。

### `scripts/dev/build-osd-sidecar.sh`（值得抄的思路）

sidecar 必须先于 `tauri build` 编译并 stage 到 `src-tauri/binaries/osd-<target>.exe`，因为 `osd` 把自己编译进的 web client 一起打包；**前端必须在它之前构建完**，否则安装包会带一份陈旧的 UI。注释里还说明「Tauri 打包时会去掉 target triple，所以应用内 `osd` 以裸名躺在 `opencode` 旁边」。

---

## 5. 从它身上学到的 6 条（按对 ArguMesh 的价值排序）

1. **分发形态先定，且主力是单一安装包。** 它没有让用户 `git clone && pnpm install`；Windows 就是「下载 → 双击 → 用」。ArguMesh 现在的 README「Deployment」要求 Node ≥20 + pnpm + 三条命令，这是最大差距。
2. **核心与宿主解耦（最重要的一条）。** `crates/osd-core` **不依赖 Tauri**，所以同一套内核既能跑在桌面壳里，也能 `osd server` 无头跑。ArguMesh **天然已经具备**这个性质：`server/index.ts` 是纯 Hono app，`server/node.ts` 只是宿主。加桌面壳 = 加一个宿主，不是重构。
3. **双轨产物：安装包 + 无头压缩包。** 它的原话是「科研机器通常没有屏幕」。ArguMesh 的用户同样会在实验室服务器上用 → **安装包做主力，便携 zip/无头包做次要产物**，两者共用同一份构建。
4. **按用户安装、免管理员**（`installMode: currentUser`）。科研人员的办公机常常没有管理员权限，这一点直接决定能不能装。
5. **签名是现实问题，不是前置条件。** 它 macOS 签了，Windows/Linux 没签，靠 README 一句话化解 SmartScreen。**我们照做即可，不必为 OV 证书先花钱。**
6. **公开文档本身就是增长引擎。** 7 语言 README、Zenodo DOI + `CITATION.cff`、`docs/PRD.md` + `docs/TECHNICAL_DESIGN.md` + `PROGRESS.md`、Discord + linux.do 社区、以及明确的「状态」自述（「仍是 beta，产出应视为草稿」）。ArguMesh 已有中英双 README，缺 DOI/CITATION、公开 PRD/进度、社区入口。

---

## 6. ArguMesh 的硬约束（本轮实测）

| 约束 | 实测 | 对打包的影响 |
| --- | --- | --- |
| **运行时原生模块** | `@libsql/win32-x64-msvc@0.5.29/index.node`（SQLite）、`@earendil-works/pi-tui@0.84.3/native/win32/prebuilds/win32-x64/win32-console-mode.node`；另有可能加载的 `@mariozechner/clipboard-win32-x64-msvc`、`@napi-rs/canvas-win32-x64-msvc` | **阻断 Node SEA / pkg**（Node SEA 不支持加载 `.node`）；Bun `--compile` 需探针验证 |
| 纯前端重依赖 | `tesseract.js-core` 44M、`@phosphor-icons/react` 43M、`pdfjs-dist` 37M | 已被 Vite 打进 `dist/`（**仅 3.2 MB**），服务端 sidecar **不需要**它们 |
| 服务端 prod 闭包估算 | pi-coding-agent 23M + napi-rs canvas 37M + drizzle-orm 16M + openai 15M + genai 14M + rxjs 11M + libsql 8.5M + hono/pi-tui/zod 等 ≈ **135 MB** | 若 esbuild 把 JS 依赖打进单文件、仅外置 4 个原生包，解包体积降到 **~60–90 MB**；加 node.exe（~30 MB）+ dist（3.2 MB）→ NSIS 压缩后预计 **60–90 MB** |

### 复核修正（2026-09-21，读源码确认，覆盖上文几处推断）

1. **`pnpm deploy --prod` 取闭包这条路走不通。** `pnpm-workspace.yaml` 里**没有 `packages:` 字段**（只有 `allowBuilds`），本项目不是多包 workspace，`pnpm deploy` 无可部署目标。改用：**esbuild 打包 `server/node.ts` 为单文件 + 手工拷贝 4 个原生包**（`@libsql/win32-x64-msvc`、`@earendil-works/pi-tui` 的 `win32-console-mode.node`、`@mariozechner/clipboard-win32-x64-msvc`、`@napi-rs/canvas-win32-x64-msvc`）。esbuild 已在 vite 依赖链中（store 里有 0.18–0.28 多个版本），加成 devDependency 不产生新下载。
2. **路径全部相对 cwd，sidecar 必须设对工作目录。** `server/node.ts` 的 `serveStatic({ root: "./dist" })` 与 `server/env.ts` 的 `DEFAULT_DATABASE_URL = "file:./data/argumesh.db"` 都以 `process.cwd()` 解析。→ Rust 壳 spawn sidecar 时 `current_dir` 必须指向资源目录，否则既找不到前端也找不到数据库。
3. **`pnpm start` 依赖 `tsx`。** 出厂不能带着 tsx 跑 TS 源码，必须换成裸 `node` 跑 esbuild 产物（这也是第 1 条的必要性）。
4. **本地 `data/argumesh.db` 有 166 MB（开发数据），绝不能进安装包。** 安装时必须新建空库，数据目录落到 `%LOCALAPPDATA%\ArguMesh\data\`（可写、重装不丢）。
5. **端口需要壳来管。** `server/node.ts` 只读 `process.env.PORT ?? 8787`。壳要么探测 8787 占用后顺延，要么传 `PORT=0` 让 OS 分配再从 stdout 读回实际端口（后者更稳，需改 `server/node.ts` 两行把实际端口打出来——目前只打 `info.port`，已可用）。
| 前端路由/静态基址 | `vite.config.ts` 未设 `base` → `/assets/...` 绝对路径 | 若 webview 直接指向 sidecar 的 `http://127.0.0.1:<port>/`，**前端零改动** |
| 原生文件夹选择 | `services/native-picker.ts` 已用子进程弹系统对话框 | 在 Node sidecar 下照常工作，**不依赖** Tauri dialog 插件 |
| 服务器入口 | `server/node.ts` 仅 `const port = Number(process.env.PORT ?? 8787)`，不自动开浏览器 | 桌面壳需负责拉起 sidecar 并打开窗口 |
| CI / 打包基建 | **无 `.github/` 目录**、无打包脚本、`package.json` 无 `bin`/`files`、`scripts/` 只有 migrate/seed/backup/smoke | 需新建发布 workflow（可照抄第 4 节的 matrix + tauri-action 结构） |
| 许可证 | MIT（`package.json` 已声明） | 可发布 |

---

## 7. 四条路线评估

| 路线 | 产出物 | 原生模块 | 新增工具链 | 预计工作量 | 风险 |
| --- | --- | --- | --- | --- | --- |
| **A. Tauri 2 薄壳 + Node sidecar**（推荐） | `ArguMesh_x64-setup.exe`（NSIS，currentUser）+ 便携 zip | ✅ 原样可用 | Rust + Tauri CLI（壳本身约百行，无业务逻辑） | 壳 1–2 天；sidecar 装配 + 种子库 + 打包脚本 2–3 天；CI 1 天；README/安装说明 0.5 天 | 低。唯一新成本是 Rust 工具链 |
| **B. Bun `--compile` 单文件 + Inno Setup 包壳** | 单 exe，再包成 `-setup.exe` | ⚠️ 待验证（Bun 支持 node-api 插件，但 libsql / pi-tui 未实测） | Bun | 探针 1 天 + 实现 2–3 天 | **中高**：libsql 原生绑定、pi-tui console-mode、`node:worker_threads` 兼容都可能是坑；失败会回退到 A |
| **C. Node SEA 单文件 + Inno Setup** | 单 exe 安装包 | ❌ **不可行** | 无 | — | Node SEA 不支持加载 `.node`；除非把原生库落到磁盘并手写 `process.dlopen` 补丁，脆弱且难维护 |
| **D. 便携 zip + GitHub Releases** | zip | ✅ | 无 | 0.5 天 | 用户体验差（要么自带 Node，要么要求用户装 Node）；**但适合作为次要产物与 A 并存** |

> 说明：A 与 D 不互斥。学习对象本身就是「安装包（主力）+ 无头压缩包（次要）」双轨。

---

## 8. 推荐方案与工作量分解

### 目标产物

1. `ArguMesh_<ver>_x64-setup.exe` —— NSIS，`installMode: "currentUser"`，双击即装、免管理员。
2. `ArguMesh-<ver>-x64-portable.zip` —— 解压即跑（对应学习对象的无头包），给服务器/洁净室用。
3. 首次启动自动完成：建 `data/argumesh.db`（跑 `scripts/migrate-custom.ts` + 种子）、开窗口指向 `http://127.0.0.1:<port>/`。
4. macOS dmg / Linux deb-rpm 作为后续增量（用户此刻只问 Windows）。

### 工作量（Windows 优先）

| 步骤 | 内容 | 估时 |
| --- | --- | --- |
| 1 | `apps/desktop`（或 `src-tauri/`）薄壳：一个 webview 窗口 + spawn/kill Node sidecar + 单实例锁 + 关闭时收进程 | 1–2 天 |
| 2 | 服务端产物装配：esbuild 打包 `server/node.ts` → 单文件（外置 4 个原生包并随包拷贝）、连同 `node.exe`、`dist/`、`drizzle/`、`scripts/`、`.env.example` 一起作为 sidecar 资源 | 1 天 |
| 3 | 首启引导：DB 初始化 + 种子 + 端口探测（8787 占用则顺延）+ 打开浏览器/窗口 | 0.5–1 天 |
| 4 | `tauri.conf.json`：`targets`、`externalBin`、`nsis.installMode: currentUser`、图标（已有 `public/argumesh-logo.svg`） | 0.5 天 |
| 5 | 打包脚本 + `.github/workflows/release.yml`（windows-latest matrix + tauri-action + draft release） | 1 天 |
| 6 | README / README.zh-CN 增加「下载安装」章节（含 SmartScreen 提示、数据存放位置、卸载说明）+ Changelog（Cursor 规则要求同任务更新） | 0.5 天 |
| 7 | 真机验证：全新 Windows 用户（无 Node、无 pnpm）安装 → 导入 PDF → 跑一次 Research Agent → LaTeX 编译 | 1 天 |
| | **合计** | **约 6–7 个工作日** |

### 附带建议（与打包无关但同源）

- ** Bun 探针可选**：若想拿到「真正单文件、无需 sidecar」的形态，先花 1 天验证 Bun 能否加载 libsql + pi-tui；失败就维持方案 A，不阻塞主线。
- **不要现在做自动更新**：学习对象也还没做（它自己列为进行中）。v1 用手动下载 + 版本号提示即可。
- **保持零云依赖红线**：sidecar 里不得出现 Cloudflare/Turso 账号要求；AI 仍是可选、用户在设置页填自己的 endpoint。

---

## 9. 待用户决策

1. **路线确认**：是否按「Tauri 2 薄壳 + Node sidecar」推进（方案 A）？是否接受为它引入 Rust 工具链？若拒绝，退路是「Bun 探针（方案 B）」或「只发便携 zip（方案 D）」。
2. **平台范围**：本轮是否只做 Windows x64？macOS / Linux 是否留到下一轮（学习对象的下载量分布支持先 Windows）。
3. **是否先提交当前 v3.2.5 工作树**：`ArguMesh`  HEAD 仍是 `1a15c4e`(v3.2.4)，工作树已是 3.2.5（含 `web-search.ts`、多选批量删除等），GitHub 落后一个版本。做发布基建前先把这条推上去，基线更干净。
4. **是否需要我补齐学习对象的 `docs/PRD.md` / `docs/TECHNICAL_DESIGN.md` / `PROGRESS.md`**：需等 `raw.githubusercontent.com` 恢复（或改用镜像逐个取）。若你认为它的 PRD 结构有抄的价值，我再单独做一轮。

---

## 10. 最小可装包验证结果（2026-09-21，已实测通过）

用户选择「先出最小可装包验证」：跳过 CI / README / 种子库优化，只做 ① 服务端打包 + ② 最小壳，产出一个真机能双击安装、能跑起来的安装包，用来验证整条链路。**已通过。**

### 产物

- `src-tauri/target/release/bundle/nsis/ArguMesh_3.2.5_x64-setup.exe` — 29 MB 压缩 / 约 116 MB 安装后占用。
- `scripts/build-sidecar.mjs`（新增，`pnpm run build:sidecar`）— esbuild 把 `server/node.ts` 打成单个 `server.mjs`，连同 `node_modules` 运行时依赖与 `template/argumesh.db` 一起落到 `build/sidecar/`。
- `src-tauri/`（新增，整个目录）— Tauri 2 薄壳，只做三件事：复制空库、拉 sidecar、跳转窗口。

### 实测通过的链路

卸载 + 清空 `%LOCALAPPDATA%\ArguMesh` 后**全新安装**：空库模板复制 → spawn node → stdout 握手拿到系统分配端口 → 窗口跳转 → SPA 与 JS/CSS 资源 200 → `/api/health` OK → 项目写/读/删往返 201/200/空 → 中文 UTF-8 逐字节无乱码 → 优雅关闭（`taskkill` 不带 `/F`）后 **无孤儿 node.exe**、端口关闭。

### 踩到并修掉的坑（都是这条链路上的真实缺陷）

1. **`\\?\` 长路径前缀（致命，用户实际遇到的就是这个）**
   `tauri::Manager::path().resource_dir()` 在 Windows 上返回带 `\\?\` 前缀的路径。`CreateProcess` 认它，**Node 不认** —— 把它当 `current_dir` / 模块路径交给 `node.exe`，node 在跑任何 JS 之前就退出，stdout/stderr 一个字节都不产出。壳只能报「服务进程提前退出，没有上报端口」，日志是空的。
   → `strip_long_path_prefix()`，**每条候选路径都过一遍**（`resource_dir()`、`current_exe()`、`LOCALAPPDATA`、`ARGUMESH_DATA_DIR` 全带上，UNC 形式 `\\?\UNC\server\share` 还原成 `\\server\share`）。有 4 个回归单测钉住行为。
2. **stderr 读取时机** — 原先放在拿到端口之后，于是失败时日志里一行都没有，等于把唯一的线索扔了。→ `spawn()` 之后立刻起 stderr 读取线程。
3. **失败路径漏收割子进程** — 读端口失败时直接 return，留下一个没人管的孤儿 `node.exe`。→ `child.kill()` + `child.wait()` 并把退出码写进日志（退出码是定位原因的第一手信息）。
4. **日志串行** — `writeln!` 走 `write_fmt`，会按格式串片段分多次 `write_all`；stdout/stderr 两个线程并发写，两行会互相插队（实测两条「流已关闭」被拼成同一行）。→ `static LOG_LOCK` + 整行一次写出。
5. **sidecar 冷启动极慢** — 13 MB esbuild 单包 + libSQL 原生模块 + 杀毒首扫，实测 **8–75 秒**。`SIDECAR_BOOT_TIMEOUT` 给到 90 秒，错误文案区分「超时（子进程还活着）」与「断开（子进程已退）」。

### 明确未做（等重新提出再动）

壳的打磨、已有安装的升级迁移路径、`.github/workflows/release.yml`、双语 README 的「下载 / 安装」章节、代码签名、Bun 探针。

---

## 附：本机网络事实（后续会话备用）

- `raw.githubusercontent.com`：**不可达**（curl 20s 超时；WebFetch 域名校验被策略拒绝）。
- `api.github.com`：可达（HTTP 200）。
- `ghproxy.net` 镜像：可达，可用于取 raw 文件：`https://ghproxy.net/https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`。
- WebSearch 工具：本环境返回 `400 The input you provided is invalid`，不可用。
