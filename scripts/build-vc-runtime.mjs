// Extract app-local DLLs from a hash-pinned official Microsoft redistributable.
// Never runs the installer or writes to System32. Uses Windows' built-in expand.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const digest = "cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b";
const url = "https://download.visualstudio.microsoft.com/download/pr/bd1c8d9d-ba95-4eee-bc6e-df1fcc876373/CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B/VC_redist.x64.exe";
const dlls = ["concrt140", "msvcp140", "msvcp140_1", "msvcp140_2", "msvcp140_atomic_wait", "msvcp140_codecvt_ids", "vcamp140", "vccorlib140", "vcomp140", "vcruntime140", "vcruntime140_1", "vcruntime140_threads"];

export async function bundleVcRuntime(root, target, run) {
  const cache = path.join(root, "build", "vc-runtime");
  await mkdir(cache, { recursive: true });
  const archive = path.join(root, "build", "vc_redist.x64.exe");
  let bytes = await readFile(archive).catch(() => Buffer.alloc(0));
  if (createHash("sha256").update(bytes).digest("hex") !== digest) {
    await run("curl.exe", ["--fail", "--location", "--retry", "3", "--max-time", "600", "--output", archive, url]);
    bytes = await readFile(archive);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("Microsoft runtime SHA-256 mismatch; review and pin a new official release before rebuilding");
  const expand = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "expand.exe");
  // This pinned Burn bundle contains the engine CAB followed by its payload CAB.
  const cabinets = [];
  for (let offset = 0; (offset = bytes.indexOf("MSCF", offset)) >= 0; offset += 4) {
    if (offset + 36 > bytes.length) continue;
    const size = bytes.readUInt32LE(offset + 8);
    if (bytes.readUInt32LE(offset + 4) === 0 && size > 36 && offset + size <= bytes.length) cabinets.push(bytes.subarray(offset, offset + size));
  }
  if (cabinets.length !== 2) throw new Error("Unexpected Microsoft runtime cabinet layout");
  for (const [index, bytes] of cabinets.entries()) {
    const file = path.join(cache, `${index}.cab`);
    const folder = path.join(cache, `${index}`);
    await mkdir(folder, { recursive: true });
    await writeFile(file, bytes);
    await run(expand, [file, "-F:*", folder]);
  }
  const manifest = await readFile(path.join(cache, "0", "0"), "utf8");
  const extracted = path.join(cache, "dlls");
  await mkdir(extracted, { recursive: true });
  for (const group of ["Minimum", "Additional"]) {
    const payload = [...manifest.matchAll(/<Payload\s[^>]*>/g)].find(([entry]) => entry.includes(`packages\\vcRuntime${group}_amd64\\cab1.cab`))?.[0];
    const source = payload?.match(/SourcePath="(a\d+)"/)?.[1];
    if (!source) throw new Error(`Microsoft runtime ${group} payload missing`);
    await run(expand, [path.join(cache, "1", source), "-F:*", extracted]);
  }
  for (const name of dlls) await cp(path.join(extracted, `${name}.dll_amd64`), path.join(target, `${name}.dll`));
  // Preserve Microsoft's supplied license text beside the unmodified libraries.
  const licensePayload = [...manifest.matchAll(/<Payload\s[^>]*>/g)].find(([entry]) => entry.includes('FilePath="license.rtf"'))?.[0];
  const license = licensePayload?.match(/SourcePath="(u\d+)"/)?.[1];
  if (!license) throw new Error("Microsoft runtime license missing");
  await cp(path.join(cache, "0", license), path.join(target, "MICROSOFT-REDIST-LICENSE.rtf"));
  await writeFile(path.join(target, "MICROSOFT-REDIST-NOTICE.txt"), "Microsoft Visual C++ Runtime 14.44.35211 (x64)\nCopyright Microsoft Corporation. All rights reserved.\nThese unmodified libraries retain Microsoft's terms; the ArguMesh MIT license does not apply to them.\nhttps://learn.microsoft.com/visualstudio/releases/2022/redistribution\n");
}
