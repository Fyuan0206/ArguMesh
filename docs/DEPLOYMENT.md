# ArguMesh 部署说明

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

三种形态：**本地开发 / 本地生产单端口**、**公开官网**（独立 Cloudflare Worker）、**桌面安装包**（Tauri + Node sidecar）。

三者互不影响：官网是静态页，桌面壳跑的是同一份 Hono app 的 sidecar 打包，都不改变 `server/index.ts` 的业务逻辑。

---

## 1. 本地开发与本地生产

```bash
# 开发：API 127.0.0.1:8787 + Vite :5173（Vite 把 /api 代理到 API 端口）
pnpm install
pnpm run db:seed
pnpm run dev

# 本地生产：单端口同时提供 dist/ 与 API
pnpm run build
pnpm start          # http://127.0.0.1:8787
```

`.env` 可选，全部配置见 [`DEVELOPMENT.md`](DEVELOPMENT.md) 的环境变量表。

> ⚠ 默认只听 localhost 且**无鉴权**。不要把 API 端口暴露到不可信网络。公网部署必须自己加网络限制和 HTTPS 反代（如 Caddy / Nginx）。
>
> ⛔ **绝不要把本地这份无鉴权的 Node 应用当成公网后端部署。**

可选：机器上装 [Tectonic](https://tectonic-typesetting.github.io/) 或 `latexmk`，以启用应用内 LaTeX 编译 + PDF 预览（或用 `LATEX_ENGINE_PATH` 指向可执行文件）。

---

## 2. 公开官网（Cloudflare Worker）

`website/` 是**纯静态首页**，也是本仓库唯一接触 Cloudflare 的代码。它不改变本地应用。

### 构成

- **公开文件只有两个**：`website/index.html` 与 `website/website-assets/`。
- `website/edge.mjs` 是托管适配器：
  - `/` 与 `/website-assets/*` → 从 `ASSETS` 绑定取静态资源
  - **其他全部请求通过 service binding 转发给 `paperidea-workbench`**（prototype 的那个 Worker）——鉴权、`/api/*`、深链接都继续由它处理
- 官网持有更具体的 zone route `argumesh.nekocfy.com/*`；prototype 保留自定义域名。
- 页面上的「文档」与「GitHub」都指向 **<https://github.com/Fyuan0206/ArguMesh>**（「文档」具体落到 `README.zh-CN.md`）。改官网外链时不要指向别的仓库或分支。

### 部署

```bash
node website/prepare-hosting.mjs    # 只暂存公开文件到临时目录，并打印一份 Wrangler 配置路径
wrangler deploy --config <打印出的路径>   # 用已认证的 Wrangler CLI 部署
```

本地预览（不起 Worker，只看静态页）：`python -m http.server 4173 --directory website`

`prepare-hosting.mjs` 只会拷 `index.html`、`website-assets/`、`edge.mjs` 三样，并生成临时 `wrangler.json`。**不要把仓库文件、数据或配置上传上去。**

### 回滚

删掉官网持有的那条 zone route（`argumesh.nekocfy.com/*`）即可恢复原首页。**不要删除底层的自定义域名。**

### 官网设计 QA

参考对象 `agentero.app/zh`，做的是**格式适配而非照搬品牌或产品声明**。要点：

- 深色页面、胶囊导航、居中衬线品牌名、灰色中文主标题、成对 CTA、大产品截图建立要求的层级。
- 首屏后来换成 PDF 阅读器截图——最初的 Research Agent 截图里有「AI 未配置」报错。
- 实验空态截图换成了一张有数据的示例（来自 `design-qa-artifacts/`）。
- 桌面与安装分区做过目视检查；390px 移动视口无横向溢出。
- 矩阵与研究脉络截图展示的是初始进入态；更充分的演示截图能更好传达能力。
- 浏览器截图调用慢且偶尔超时；最终生产截图成功。
- 扁平深色背景替代了参考站的装饰性浅色纹理。不宣传任何 Agentero 有而 ArguMesh 没有的功能，也不提供二进制下载。

资产来自 `public/` 品牌资源与 `docs/screenshots/`、`design-qa-artifacts/`，展示的是示例数据。`website/` 的代码与部署适配器不作为公开文件 served。

---

## 3. 桌面安装包（Tauri 2 + Node sidecar）

> ✅ **安装包已对外发布**：`v3.2.5` 于 2026-09-24 带上 Windows 安装包发到 [GitHub Releases](https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.2.5)（用户当日重新提出发布）。发布是**手工三步**：提交 → 打 tag → `gh release create` 附带新构建的安装包；`.github/workflows/release.yml` 仍未做。发布说明必须带上这三条事实：**安装包里是空库，AI 配置不随包带走**（装完要在设置页重填）、**没有代码签名**（SmartScreen 会拦）、**应用无鉴权**（不要把端口暴露到不可信网络）。**README 仍无下载章节**。

**桌面版与 Web 版的区别**：Web 版是单端口 Node 服务 + Vite 产物；桌面版是 **Tauri 2 薄壳 + Node sidecar**——壳只做三件事（复制空库、拉起 sidecar、把窗口指过去），不重复实现任何业务逻辑，真正的前端和 API 全在 `server.mjs` 里。

### 3.1 前置条件

| 依赖 | 要求 |
| --- | --- |
| Node.js | ≥ 20（sidecar 以裸 node 运行，不用 tsx） |
| pnpm | 仓库统一用 pnpm |
| Rust 工具链 | rustup 安装，`rust-version = "1.77"` 起 |
| MSVC 生成工具 | VS 2022 Build Tools（`tauri info` 会检查） |
| WebView2 Runtime | Windows 自带（`tauri info` 会检查） |

`node_modules/.bin/tauri info` 可一次性核对上面全部环境项，缺什么会直接指出来。

**⚠ PATH 坑（本机真实存在）**：`~/.cargo/bin` 可能不在 PATH 里，但工具链确实装着。结果是 `tauri info` 报 `rustc: not installed!` / `cargo: not installed!`，而 `~/.cargo/bin/cargo.exe --version` 完全正常。**构建前先确认 `cargo --version` 能跑**；跑不了就把 `%USERPROFILE%\.cargo\bin` 加进 PATH，否则会在链接阶段才失败，白等一次全量编译。

### 3.2 构建流程

三步，**顺序不能换**（第 2 步读第 1 步的 `dist/`，第 3 步读第 2 步的 `build/sidecar/`）。全部在仓库根执行。

```bash
# 0) 装依赖（只需一次）
pnpm install

# 1) 前端 + 类型检查 → dist/
pnpm run build

# 2) 服务端打成 sidecar → build/sidecar/
#    --node-exe 是【必需】的
pnpm run build:sidecar -- --node-exe "$(node -p process.execPath)"

# 3) Rust 壳 + NSIS 打包（首次约数分钟，增量快）
pnpm tauri build
```

产物：`src-tauri/target/release/bundle/nsis/ArguMesh_<version>_x64-setup.exe`

实测：约 30 MB 压缩 / 约 116 MB 安装后占用；`src-tauri/target/` 全量构建约 2 GB（已 gitignore，别提交）。安装模式 `currentUser`，**不需要管理员权限**；安装器语言 English + SimpChinese。

### 3.3 `--node-exe` 为什么必需

`tauri.conf.json` 把 node.exe 列在 `bundle.resources` 里，是**字面路径而非 glob**：

```json
"../build/sidecar/node.exe": "sidecar/node.exe"
```

而 `scripts/build-sidecar.mjs` 只有在收到 `--node-exe` 时才拷贝它。Tauri CLI 对不存在的 resource 会直接报错，所以**不传 `--node-exe`，第 3 步必失败**。

传 `process.execPath` 而不是写死路径：这样 sidecar 里的 node 版本永远等于构建时的 node，不会出现「用 Node 20 打包、用 Node 24 跑」的错配。

> ⚠ **代码注释与配置不一致（待修）**：`build-sidecar.mjs` 里写的是「不传则跳过（由 tauri.conf 的 externalBin 提供）」，但 `tauri.conf.json` **并没有 `externalBin` 字段**，node.exe 实际走 `resources`。修之前按上面的命令传参。

### 3.4 `build:sidecar` 做了什么

`scripts/build-sidecar.mjs`，输出 `build/sidecar/`：

| 产物 | 说明 |
| --- | --- |
| `server.mjs` | esbuild 把 `server/node.ts` 打成**单文件 ESM**，裸 node 直接跑，不需要 tsx、不需要完整 node_modules |
| `node.exe` | 由 `--node-exe` 拷入 |
| `node_modules/@libsql/win32-x64-msvc/` | 唯一的运行时原生包（esbuild 无法内联 `.node`） |
| `dist/` | 第 1 步的前端产物 |
| `template/argumesh.db` | **仅含表结构的空库**，已应用全部迁移，无任何业务数据 |
| `.env.example` | 可选配置说明，随包发布 |
| `README.txt` | 自动生成的启动说明（桌面壳和人工排错都读它） |

**构建期守卫（改脚本前先读懂，不要为了让构建通过而绕过）**：

1. **metafile 检查 external 依赖** —— 用 esbuild metafile（不是正则扫产物，产物里混着 jiti 等库的报错字符串，正则必然误报）列出所有 external 裸包。漏一个就报错并给出三种处理方式。已知可缺失项（`bufferutil` / `utf-8-validate`，ws 的可选原生加速，加载处有 try/catch 降级）必须显式列进 `OPTIONAL_EXTERNALS` 并注明降级行为。
2. **原生包里真有 `.node`** —— 每个 `NATIVE_PACKAGES` 条目都会递归找 `.node`，找不到就中止。防依赖升级后静默产出一个跑不起来的安装包。
3. **空库模板大小卡 100 KB – 8 MB** —— 上下界都在防同一类事故：把开发者自己那份库打进安装包。

**两个容易踩的实现约束**：

- **`format` 必须是 `esm`**：`pi-coding-agent` 的 `dist/config.js` 用了 `import.meta.url`，esbuild 打成 CJS 时会**静默**替换成空对象（不告警），`fileURLToPath(undefined)` 直接抛 `ERR_INVALID_ARG_TYPE`，启动即崩。
- **必须注入 `require` banner**：esbuild 把 CJS 依赖（dotenv / undici 等）包进 `__commonJS` 后，它们对 node 内建的 `require("fs")` 会变成 `__require("fs")`，而该 shim 在 ESM 作用域里找不到 `require`，启动即抛 `Dynamic require of "fs" is not supported`。这是 esbuild 的已知限制。

### 3.5 安装包运行时行为

启动序列（`src-tauri/src/main.rs`）：

1. 定位 sidecar 目录 → `ARGUMESH_SIDECAR_DIR` 覆盖，否则依次试 `resource_dir()/sidecar`、`resource_dir()/_up_/build/sidecar`、exe 同级 `sidecar/`、以及本地调试时的仓库 `build/sidecar/`。
2. 定位数据目录 → `ARGUMESH_DATA_DIR` 覆盖，否则 `%LOCALAPPDATA%\ArguMesh`。
3. **首次启动**把 `template/argumesh.db` 复制到 `<数据目录>/data/argumesh.db`；**已存在则一律不动**——用户数据最大。这就是卸载/升级不丢数据的原因。
4. `node.exe server.mjs`，环境变量 `PORT=0`（让系统分配端口，避免冲突）、`DATABASE_URL=file:<数据目录>/data/argumesh.db`，`current_dir` = sidecar 目录。
5. 从 stdout 读 `ARGUMESH_PORT=<port>` 握手，把窗口 `location.replace` 到 `http://127.0.0.1:<port>/`。
6. 壳退出时优雅关闭 sidecar（`taskkill` 不带 `/F`），**不留孤儿 node.exe**。

**给使用者的三个事实**：

- **AI 要在设置页重新填。** 安装包里是**空库**，`ai_settings` 表是空的——开发机上那份配置不会随安装包带走。装完第一次用 AI 功能会提示「未配置」。
- **`current_dir` 必须是 sidecar 目录**，因为 `server/node.ts` 的 `serveStatic({ root: "./dist" })` 相对 `process.cwd()` 解析。手动排错时也要照此启动。
- **冷启动可能很慢（实测 8–75 秒）。** 13 MB 单包 + libSQL 原生模块 + 杀毒软件首扫。壳的 `SIDECAR_BOOT_TIMEOUT` 给到 90 秒，启动期间窗口显示的是 `src-tauri/assets/index.html` 那张占位页（刻意不含任何业务 UI）。

**排错入口**：`<数据目录>/sidecar.log`——记录 sidecar 路径、子进程 PID、**全部 stderr**（sidecar 的崩溃栈），以及失败时的退出码。stderr 从 `spawn()` 之后立刻开始读（早先放在拿到端口之后，导致失败时日志一个字节都没有）。

### 3.6 版本号（三处，必须同步）

| 文件 | 字段 |
| --- | --- |
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` ← **安装包文件名用它** |
| `src-tauri/Cargo.toml` | `version` |

没有任何机制校验一致性，发版时手工改完再构建。

### 3.7 构建后验证（全新安装 smoke）

改动壳或 sidecar 后建议重跑：

1. 卸载旧版，清空 `%LOCALAPPDATA%\ArguMesh`。
2. 双击安装（currentUser，不需要管理员）。
3. 首次启动：空库模板复制 → spawn node → stdout 握手拿端口 → 窗口跳转。
4. SPA 与 JS/CSS 资源 200；`GET /api/health` OK。
5. 项目写 / 读 / 删往返：201 / 200 / 空。
6. 中文 UTF-8 逐字节无乱码。
7. 优雅关闭后**无孤儿 `node.exe`**、端口已释放。

Rust 侧改动另外跑：`cd src-tauri && cargo test`（现有单测钉住 `\\?\` 长路径前缀的剥离行为）。

### 3.8 已知坑

| 坑 | 症状 | 处理 |
| --- | --- | --- |
| **`\\?\` 长路径前缀**（致命） | `resource_dir()` 在 Windows 返回带 `\\?\` 的路径。`CreateProcess` 认，**Node 不认**——node 在跑任何 JS 之前就退出，stdout/stderr 一个字节都不产出，壳只能报「服务进程提前退出，没有上报端口」，日志是空的 | `strip_long_path_prefix()`，**每条候选路径都要过**（`resource_dir()`、`current_exe()`、`LOCALAPPDATA`、`ARGUMESH_DATA_DIR`），UNC 形式 `\\?\UNC\server\share` 还原成 `\\server\share`。用回归单测钉住 |
| 失败路径漏收割子进程 | 读端口失败时直接 return，留下没人管的孤儿 `node.exe` | `child.kill()` + `child.wait()`，退出码写进日志 |
| 日志串行 | `writeln!` 走 `write_fmt` 会按格式串片段分多次 `write_all`，stdout/stderr 两线程并发写时两行互相插队 | `static LOG_LOCK` + 整行一次写出 |
| stderr 读取时机 | 放在拿到端口之后，失败时日志里一行都没有 | `spawn()` 之后立刻起 stderr 读取线程 |
| cargo 不在 PATH | `tauri info` 报 rustc/cargo not installed，但工具链确实装着 | 把 `%USERPROFILE%\.cargo\bin` 加进 PATH，见 3.1 |
| `--node-exe` 漏传 | 第 3 步 resource 报错 | 见 3.2 / 3.3 |

### 3.9 明确未做

安装包不对外发布，因此以下继续推迟，**不要主动开工**：

- 双语 README 的「下载 / 安装」章节
- `.github/workflows/release.yml`（CI 出包）
- 代码签名（Windows/Linux 未签名是参考项目 Open Science Desktop 的既有做法，不是阻塞项）
- 壳的打磨、已有安装的升级迁移路径、Bun 探针

---

## 4. 部署日志

按时间倒序追加，**不改写旧条目**。

### 2026-09-13 — Agentero 风格的 ArguMesh 首页

- Worker：`argumesh-website`；version `4d761fe5-2a2d-40cd-98f4-6da6b24f18bb`
- URL：https://argumesh.nekocfy.com/
- 变更：深色胶囊导航、居中品牌 hero、产品截图、五个研究阶段、功能网格、安装说明与复制命令按钮
- 范围：仅本仓库的静态官网。既有云端工作台通过 service binding 接收全部非官网请求。无应用部署、无数据库迁移、无凭证变更、无数据修改
- 验证：首页与带查询串的首页 200 且为新内容；`/projects` 200；`/api/health` 200 且 `ok=true`；CSS 与 hero 图 200。通过应用内浏览器 DOM 与截图检查了生产页面
- 本地检查：主锚点导航到安装区、命令复制报成功；390px 视口无横向溢出（含滚动条余量的文档宽 375px）。桌面与安装分区做过目视检查
- 主应用检查：typecheck 与 build 通过；测试重跑退出码 0。首轮测试显示全部通过但返回了非零的生命周期状态，显式重跑后解决。既有的构建产物体积警告仍在
- 回滚：删掉 `argumesh-website` 持有的 zone route `argumesh.nekocfy.com/*`。保留 `paperidea-workbench` 上的原自定义域名
- 源码文件是本地的，该任务中未提交或推送到 GitHub

---

## 5. 相关文件

| 文件 | 作用 |
| --- | --- |
| `website/index.html` | 官网首页（唯一公开 HTML） |
| `website/edge.mjs` | 托管适配器：静态资源 + service binding 转发 |
| `website/prepare-hosting.mjs` | 只暂存公开文件并生成临时 Wrangler 配置 |
| `scripts/build-sidecar.mjs` | sidecar 装配 + 构建期守卫（注释极详细，改前必读） |
| `src-tauri/tauri.conf.json` | 壳配置、NSIS 选项、resources 映射 |
| `src-tauri/src/main.rs` | 薄壳：空库复制 / sidecar 生命周期 / 端口握手 / 日志 |
| `src-tauri/assets/index.html` | 启动占位页（sidecar 起来后被 replace 掉） |
| `build/sidecar/README.txt` | 自动生成的 sidecar 启动说明 |
| [`DISTRIBUTION-RESEARCH-2026-09-20.md`](DISTRIBUTION-RESEARCH-2026-09-20.md) | 分发路线调研与决策依据（**已暂缓，不要实施**） |

`.gitignore` 中 `build/`、`dist/`、`src-tauri/target/`、`src-tauri/gen/` 均不入库。
