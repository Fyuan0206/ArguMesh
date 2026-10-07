// Windows x64 portable parser. Models are deliberately NOT part of this directory.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "build", "mineru-runtime");
const version = "3.13.16";
const pythonHash = Buffer.from("l9rlJ0zFSGcGXo1aMibkjDUBftMyoP2w4n1bWCGWEpc=", "base64").toString("hex");
const lock = path.join(root, "scripts", "mineru", "requirements-win-x64.lock");
const fingerprint = createHash("sha256").update(await readFile(lock)).update(version).digest("hex");
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("This installer runtime requires Windows x64.");
if (path.dirname(target) !== path.join(root, "build")) throw new Error("Unsafe runtime build path");

function run(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? done() : reject(new Error(`${command} exited ${code}`)));
  });
}

const manifest = await readFile(path.join(target, "runtime.json"), "utf8").then(JSON.parse).catch(() => null);
if (manifest?.fingerprint !== fingerprint) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const zip = path.join(root, "build", "python-embed.zip");
  let bytes = await readFile(zip).catch(() => Buffer.alloc(0));
  if (createHash("sha256").update(bytes).digest("hex") !== pythonHash) {
    await run("curl.exe", ["--fail", "--location", "--retry", "3", "--max-time", "600", "--output", zip, `https://www.python.org/ftp/python/${version}/python-${version}-embed-amd64.zip`]);
    bytes = await readFile(zip);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== pythonHash) throw new Error("Python SHA-256 does not match the official release digest");
  await run(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", target]);
  await writeFile(path.join(target, "python313._pth"), "python313.zip\n.\nLib/site-packages\nimport site\n");
  console.log("[mineru-runtime] Installing locked CPU dependencies…");
  await run("uv", ["pip", "install", "--python", path.join(target, "python.exe"), "--target", path.join(target, "Lib", "site-packages"), "--require-hashes", "--only-binary", ":all:", "--index-strategy", "unsafe-best-match", "-r", lock]);
}
await cp(path.join(root, "scripts", "mineru", "runner.py"), path.join(target, "runner.py"));
await cp(lock, path.join(target, "requirements.lock"));
await run(path.join(target, "python.exe"), ["-I", path.join(target, "runner.py"), "check"]);
await writeFile(path.join(target, "runtime.json"), JSON.stringify({ python: version, mineru: "3.4.2", torch: "2.8.0+cpu", fingerprint }, null, 2));
console.log("[mineru-runtime] Ready: build/mineru-runtime (no model weights, no user configuration)");
