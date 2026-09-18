import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ScanResult, Verdict } from "../types.js";

export interface ScanProfile {
  name: string;
  createdAt: string;
  updatedAt: string;
  target: string;
  packageName?: string;
  verdict: Verdict;
  reasons: string[];
  /** Tools observed at scan time — wrap can lock to this list */
  approvedTools: string[];
  findingIds: string[];
}

export function profilesDir(home = os.homedir()): string {
  return path.join(home, ".socketguard", "profiles");
}

export async function ensureProfilesDir(): Promise<string> {
  const dir = profilesDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function profilePath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) throw new Error("Invalid profile name");
  return path.join(profilesDir(), `${safe}.json`);
}

export async function saveProfileFromScan(
  name: string,
  result: ScanResult,
  toolNames: string[],
): Promise<ScanProfile> {
  if (result.verdict === "do_not_install") {
    throw new Error(
      `Refusing to save profile "${name}": scan verdict is Do not install. Fix or override manually.`,
    );
  }

  await ensureProfilesDir();
  const now = new Date().toISOString();
  let createdAt = now;
  try {
    const existing = await loadProfile(name);
    createdAt = existing.createdAt;
  } catch {
    // new
  }

  const profile: ScanProfile = {
    name,
    createdAt,
    updatedAt: now,
    target: result.target,
    packageName: result.packageName,
    verdict: result.verdict,
    reasons: result.reasons,
    approvedTools: [...new Set(toolNames)].sort(),
    findingIds: result.findings.map((f) => f.id),
  };

  await writeFile(profilePath(name), JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

export async function loadProfile(name: string): Promise<ScanProfile> {
  const raw = await readFile(profilePath(name), "utf8");
  return JSON.parse(raw) as ScanProfile;
}

export async function listProfiles(): Promise<string[]> {
  try {
    const dir = profilesDir();
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}
