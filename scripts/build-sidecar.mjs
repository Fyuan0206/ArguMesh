// 把 ArguMesh 服务端装配成可随桌面安装包发布的 sidecar 资源目录。
//
//   pnpm run build:sidecar            → build/sidecar/
//   node scripts/build-sidecar.mjs --node-exe <path-to-node.exe>
//
// 产物(build/sidecar/):
//   server.mjs          esbuild 单文件,裸 node 直接运行,不需要 tsx,也不需要 node_modules
//   node_modules/       仅 1 个运行时原生包(esbuild 无法内联 .node,必须整包带上)
//   dist/               前端产物(pnpm run build 的输出,需先执行)
//   template/           仅含表结构的空库,首次启动由桌面壳复制到用户数据目录
//   .env.example        可选配置说明,运行时复制为 .env 才生效
//   node.exe            由 --node-exe 拷入;不传则跳过(由 tauri.conf 的 externalBin 提供)
//
// 关键约束(见 docs/DISTRIBUTION-RESEARCH-2026-09-20.md 第 6 节「复核修正」):
//   server/node.ts 的 serveStatic({ root: "./dist" }) 以 process.cwd() 解析 ——
//   启动 sidecar 时必须把 current_dir 设到本目录,否则找不到前端。
//   数据库不依赖 cwd:桌面壳用 DATABASE_URL 把它指到 %LOCALAPPDATA%\ArguMesh\data\,
//   数据在卸载/升级时才能留住;不设则回落到 file:./data/argumesh.db。
//
// 原生包清单是「实测」而非枚举:脚本会校验每个包目录里真的存在 .node,缺一个就报错退出,
// 避免升级依赖后静默产出一个跑不起来的安装包。
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "build", "sidecar");

/**
 * esbuild 无法内联 .node,这些包必须整包拷贝并由裸 node 在运行时解析。
 *
 * 这份清单是「实测」而不是「把带 .node 的包全列上」:
 *   - @napi-rs/canvas-win32-x64-msvc(37 MB)与 @mariozechner/clipboard-win32-x64-msvc
 *     只被 pi-coding-agent 的交互式能力用到,ArguMesh 的无头 agent 不碰,且 pi-coding-agent
 *     对它们的加载都包在 try/catch 里(loadClipboardNative 失败返回 null),所以不必带。
 *   - @earendil-works/pi-tui 曾被列在这里,但它唯一的运行时用途(交互式主题加载器)会连带
 *     拉进 marked / get-east-asian-width —— 外置它反而要再背一整套 JS 依赖闭包。它的 JS
 *     只有 ~几百 KB,直接让 esbuild 打包即可;其 .node(win32-console-mode)在产物里引用计数为 0。
 * 加新条目前先跑下面 externalPackagesFromMetafile():它会把产物里所有外部依赖列出来,漏一个就报错。
 */
const NATIVE_PACKAGES = [
  "@libsql/win32-x64-msvc", // SQLite 驱动(@libsql/client → libsql → 这里)
];

const require_ = createRequire(import.meta.url);

/**
 * 定位包真实目录。
 * pnpm 的顶层 node_modules 只是符号链接,且原生包往往只作为间接依赖存在于
 * node_modules/.pnpm/<name>@<ver>/node_modules/<specifier>,从项目根 require.resolve 不到,
 * 所以先试常规解析,失败再扫 .pnpm store。
 */
function resolvePackageDir(specifier) {
  try {
    const entry = require_.resolve(`${specifier}/package.json`, { paths: [root] });
    return path.dirname(entry);
  } catch {
    // 落到 .pnpm 扫描
  }
  const storeDir = path.join(root, "node_modules", ".pnpm");
  const wanted = path.join("node_modules", ...specifier.split("/"));
  // pnpm 里 .pnpm/<dep>/node_modules/<dep> 是实体,别的包 node_modules 下是指向它的符号链接,
  // 所以必须按 realpath 去重,否则同一个包会被数出好几份。
  const seen = new Map();
  for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(storeDir, entry.name, wanted, "package.json");
    if (!existsSync(candidate)) continue;
    const real = realpathSync(path.dirname(candidate));
    if (!seen.has(real)) seen.set(real, path.dirname(candidate));
  }
  const hits = [...seen.keys()].sort();
  if (hits.length === 0) {
    throw new Error(`[sidecar] 在 node_modules 里找不到包 ${specifier}(已试根解析与 .pnpm 扫描)`);
  }
  if (hits.length > 1) {
    console.warn(`[sidecar] ${specifier} 有 ${hits.length} 个不同版本,取最高: ${hits.at(-1)}`);
  }
  return hits.at(-1);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** node 内建模块,不需要随包发布。metafile 会把 node: 前缀与裸名都列出来。 */
const NODE_BUILTINS = new Set([
  "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "dns/promises", "domain",
  "events", "fs", "fs/promises", "http", "http2", "https", "inspector", "inspector/promises",
  "module", "net", "os", "path", "path/posix", "path/win32", "perf_hooks", "process",
  "punycode", "querystring", "readline", "readline/promises", "repl", "sea", "sqlite", "stream",
  "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "test",
  "timers", "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types",
  "v8", "vm", "wasi", "worker_threads", "zlib",
]);

/**
 * 已知「可缺失」的外部依赖 —— 加载处都包在 try/catch 里,缺失时退化为纯 JS 实现,
 * 不影响功能,只影响极限吞吐/校验速度。不列进来会让构建守卫误报。
 * 加新条目前必须去读加载处的 catch 分支,确认真的降级而不是抛错。
 */
const OPTIONAL_EXTERNALS = {
  bufferutil: "ws 的可选原生掩码加速(lib/buffer-util.js try/catch,失败退回 JS mask)",
  "utf-8-validate": "ws 的可选原生帧校验(lib/validation.js try/catch,失败退回 isValidUtf8)",
};

/**
 * 从 esbuild metafile 里取出所有 external 导入的包名。
 * 这是防「安装包在用户机器上启动即崩」最关键的一道关:漏掉一个运行时依赖,
 * 打包机上是好的(项目 node_modules 里什么都有),只有干净目录里才暴露。
 * 与其等到实机双击失败,不如在这里就让构建失败。
 *
 * 用 metafile 而不是正则扫产物:产物里混着 jiti 等库的报错字符串、模板字面量,
 * 里面全是形如 `import("some-module")` / `from "fs"` 的假导入,正则必然误报。
 * metafile 是 esbuild 自己算出来的依赖图,不会有假阳性。
 */
function externalPackagesFromMetafile(metafile) {
  const names = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const imp of output.imports) {
      if (!imp.external) continue;
      const spec = imp.path;
      const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
      if (NODE_BUILTINS.has(bare) || NODE_BUILTINS.has(spec)) continue;
      const parts = spec.split("/");
      names.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
    }
  }
  return [...names].sort();
}

/** 递归收集目录下所有 .node,用于校验「这个包真的带原生模块」。 */
async function collectNativeFiles(dir) {
  const { readdir } = await import("node:fs/promises");
  const found = [];
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".node")) found.push(full);
    }
  };
  await walk(dir);
  return found;
}

const nodeExeArg = process.argv.indexOf("--node-exe");
const nodeExe = nodeExeArg > -1 ? process.argv[nodeExeArg + 1] : null;

console.log(`[sidecar] 输出目录: ${path.relative(root, outDir)}`);

// 0. 清空旧产物
await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, "node_modules"), { recursive: true });

// 1. esbuild 打包服务端为单文件(ESM,裸 node 直接跑)
//    - platform=node 保证 node: 内建模块不被打包
//    - 只外置原生包,其余依赖全部内联,这样 build/sidecar 下不需要完整 node_modules
//    - format 必须是 esm:pi-coding-agent 的 dist/config.js 用了 import.meta.url,
//      esbuild 打成 CJS 时会静默替换成空对象(不报警告),fileURLToPath(undefined) 直接抛
//      ERR_INVALID_ARG_TYPE 启动即崩。ESM 输出让 import.meta.url 指向 server.mjs 本体,
//      其 findNodePackageDir() 找不到 package.json 时会退化为返回起始目录,不会报错。
//    - ESM 输出必须配 banner 注入 require:esbuild 把 CJS 依赖(dotenv / undici / …)包进
//      __commonJS 后,它们对 node 内建的 require("fs") 会变成 __require("fs"),而该 shim 走
//      `typeof require !== "undefined" ? require : throw` —— ESM 作用域里没有 require,于是
//      启动即抛 `Dynamic require of "fs" is not supported`。这是 esbuild 的已知限制
//      (CJS 依赖 + format:esm),不是配置写错。注入的 require 只被这个 shim 与 CJS 依赖用到;
//      已实测产物里除 shim 自身外没有任何 `typeof require` 探测(共 4 处命中,3 处是 shim,
//      1 处是 `typeof requiredAudience` 误匹配),所以不会改变任何库的 CJS/ESM 判断。
console.log("[sidecar] esbuild 打包 server/node.ts …");
const result = await build({
  entryPoints: [path.join(root, "server", "node.ts")],
  outfile: path.join(outDir, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // 原生包外置(运行时从 build/sidecar/node_modules 解析)
  external: NATIVE_PACKAGES,
  banner: {
    js: [
      'import { createRequire as __argumeshCreateRequire } from "node:module";',
      "const require = __argumeshCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
  minify: false, // 保留可读栈,便于用户回报问题;正式发布可改 true
  sourcemap: false,
  metafile: true, // 给下面的守卫用:精确列出 external 导入,避免正则扫产物误报
});

// 2. 构建期守卫:external 导入必须全部有归属(内建 / 随包发布 / 已知可选)
const metafile = result.metafile;
const bare = externalPackagesFromMetafile(metafile);
const shipped = new Set(NATIVE_PACKAGES);
const missing = bare.filter((name) => !shipped.has(name) && !(name in OPTIONAL_EXTERNALS));
if (missing.length > 0) {
  throw new Error(
    `[sidecar] server.mjs 运行时还依赖 ${missing.length} 个未随包发布的裸包: ${missing.join(", ")}
` +
      `这些依赖在打包机上能解析(项目 node_modules 里都有),装到用户机器上就会 ERR_MODULE_NOT_FOUND。
` +
      `处理方式:
` +
      `  a) 纯 JS —— 从 external 里去掉它,让 esbuild 打包进 server.mjs;
` +
      `  b) 含 .node —— 加进 NATIVE_PACKAGES,并把理由写进注释;
` +
      `  c) 确认加载处有 try/catch 降级 —— 加进 OPTIONAL_EXTERNALS 并注明降级行为。`,
  );
}
if (bare.length > 0) console.log(`[sidecar] 运行时外部依赖: ${bare.join(", ")}`);
else console.log("[sidecar] 运行时外部依赖: 无(全部内联)");

// 3. 拷贝原生包,并校验每个包里真有 .node
console.log("[sidecar] 拷贝运行时原生包 …");
for (const specifier of NATIVE_PACKAGES) {
  const src = resolvePackageDir(specifier);
  const natives = await collectNativeFiles(src);
  if (natives.length === 0) {
    throw new Error(
      `[sidecar] ${specifier} 目录里没有 .node 文件(${src})。` +
        `依赖可能已升级、原生模块被移除或改名 —— 请更新 NATIVE_PACKAGES 清单后再打包,` +
        `不要静默跳过,否则安装包会在用户机器上启动即崩。`,
    );
  }
  const dest = path.join(outDir, "node_modules", ...specifier.split("/"));
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log(
    `  ✓ ${specifier}  (${natives.length} 个 .node, ${natives
      .map((f) => path.basename(f))
      .join(", ")})`,
  );
}

// 4. 前端产物
if (!(await exists(path.join(root, "dist", "index.html")))) {
  throw new Error("[sidecar] 找不到 dist/index.html —— 先执行 pnpm run build");
}
console.log("[sidecar] 拷贝前端产物 dist/ …");
await cp(path.join(root, "dist"), path.join(outDir, "dist"), { recursive: true });

// 5. 空库模板:仅结构、无业务数据。首次启动由桌面壳复制到用户数据目录,
//    所以这里绝不可能是开发者自己那份 data/argumesh.db(实测 166 MB 开发数据)。
console.log("[sidecar] 生成空库模板(仅结构,不含本地开发数据)…");
const templateDir = path.join(outDir, "template");
const templateDb = path.join(templateDir, "argumesh.db");
await rm(templateDir, { recursive: true, force: true });
await mkdir(templateDir, { recursive: true });

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
if (!(await exists(tsxCli))) {
  throw new Error("[sidecar] 找不到 tsx(node_modules/tsx/dist/cli.mjs)—— 先执行 pnpm install");
}
// libSQL 的 file: URL 要 Windows 风格(C:/…),POSIX 风格绝对路径解析不可靠(实测过)。
const templateUrl = `file:${templateDb.split(path.sep).join("/")}`;
const migrated = spawnSync(process.execPath, [tsxCli, path.join(root, "scripts", "migrate-custom.ts")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: templateUrl },
});
if (migrated.status !== 0) {
  throw new Error(`[sidecar] 空库模板迁移失败(exit ${migrated.status})`);
}
if (!(await exists(templateDb))) {
  throw new Error(`[sidecar] 迁移脚本跑完了却没生成 ${templateDb}`);
}
const templateBytes = (await stat(templateDb)).size;
// 上下界都在防同一类事故:把开发者自己的库打进安装包。
// 实测空库约 450 KB;下界保证不是空文件,上界保证没有夹带数据。
if (templateBytes < 100 * 1024 || templateBytes > 8 * 1024 * 1024) {
  throw new Error(
    `[sidecar] 空库模板大小异常: ${templateBytes} 字节(预期 100 KB ~ 8 MB)。` +
      `可能是迁移不完整,或误把本地开发库打进了包 —— 中止打包。`,
  );
}
console.log(`  ✓ template/argumesh.db  ${(templateBytes / 1024).toFixed(0)} KB(仅结构)`);

// 6. 可选配置说明
await cp(path.join(root, ".env.example"), path.join(outDir, ".env.example"));

// 7. node.exe(可选):本地验证用;正式安装包里由 tauri.conf 的 externalBin 提供
if (nodeExe) {
  if (!(await exists(nodeExe))) throw new Error(`[sidecar] --node-exe 指向的文件不存在: ${nodeExe}`);
  await cp(nodeExe, path.join(outDir, "node.exe"));
  console.log(`[sidecar] 已拷入 node.exe ← ${nodeExe}`);
}

// 8. 自述:写清楚这个目录怎么被启动(桌面壳与排错都读它)
await writeFile(
  path.join(outDir, "README.txt"),
  [
    "ArguMesh sidecar 资源目录",
    "=========================",
    "",
    "启动方式(桌面壳 / 手动一致):",
    "  cwd = 本目录",
    "  node.exe server.mjs",
    "",
    "环境变量:",
    "  PORT          覆盖端口,默认 8787;PORT=0 让系统分配(桌面壳推荐,避免端口冲突)",
    "  DATABASE_URL  数据库位置,默认 file:./data/argumesh.db。桌面壳应把它指到",
    "                %LOCALAPPDATA%\\ArguMesh\\data\\argumesh.db,并在首次启动时把",
    "                template/argumesh.db 复制过去 —— 这样卸载/升级不会动到用户数据。",
    "",
    "为什么必须把 cwd 设到本目录:",
    '  server/node.ts 用 serveStatic({ root: "./dist" }) 提供前端,',
    "  它相对 process.cwd() 解析。",
    "",
    "template/argumesh.db 是仅含表结构的空库(已应用全部迁移,无任何业务数据)。",
    "",
  ].join("\n"),
);

console.log(`[sidecar] 完成 → ${path.relative(root, outDir)}`);
