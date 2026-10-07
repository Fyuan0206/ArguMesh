import { z } from "zod";
import packageInfo from "../../package.json";

const REPOSITORY = "https://github.com/Fyuan0206/ArguMesh";
const RELEASE_API = "https://api.github.com/repos/Fyuan0206/ArguMesh/releases/latest";
export const currentVersion = packageInfo.version;

export interface AppUpdate {
  currentVersion: string;
  desktop?: boolean;
  status: "idle" | "available" | "up_to_date" | "unavailable";
  latestVersion?: string;
  downloadUrl?: string;
  releaseUrl?: string;
  checkedAt?: string;
}

const releaseSchema = z.object({
  tag_name: z.string(), draft: z.boolean(), prerelease: z.boolean(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
});

export function isNewerVersion(latest: string, current: string): boolean {
  if (![latest, current].every((value) => /^\d+\.\d+\.\d+$/.test(value))) return false;
  const next = latest.split(".").map(Number);
  const now = current.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (next[index] !== now[index]) return next[index] > now[index];
  }
  return false;
}

export function readRelease(value: unknown, version = currentVersion): AppUpdate {
  const release = releaseSchema.parse(value);
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error("Invalid stable release");
  const latestVersion = release.tag_name.slice(1);
  const releaseUrl = `${REPOSITORY}/releases/tag/${release.tag_name}`;
  if (!isNewerVersion(latestVersion, version)) return { currentVersion: version, latestVersion, status: "up_to_date", releaseUrl };
  const name = `ArguMesh_${latestVersion}_x64-setup.exe`;
  const downloadUrl = `${REPOSITORY}/releases/download/${release.tag_name}/${name}`;
  if (!release.assets.some((asset) => asset.name === name && asset.browser_download_url === downloadUrl)) throw new Error("Installer unavailable");
  return { currentVersion: version, latestVersion, status: "available", releaseUrl, downloadUrl };
}

let cached: { result: AppUpdate; expiresAt: number } | undefined;
let pending: Promise<AppUpdate> | undefined;

/** Optional metadata lookup. Never sends workspace content or AI configuration. */
export async function checkAppUpdate(force = false): Promise<AppUpdate> {
  if (pending) return pending;
  if (!force && cached && cached.expiresAt > Date.now()) return cached.result;
  pending = (async () => {
    let result: AppUpdate;
    try {
      const response = await fetch(RELEASE_API, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "ArguMesh-update-check" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Release lookup failed");
      result = { ...readRelease(await response.json()), checkedAt: new Date().toISOString() };
    } catch {
      result = { currentVersion, status: "unavailable", checkedAt: new Date().toISOString() };
    }
    cached = { result, expiresAt: Date.now() + (result.status === "unavailable" ? 300_000 : 3_600_000) };
    return result;
  })();
  try { return await pending; } finally { pending = undefined; }
}
