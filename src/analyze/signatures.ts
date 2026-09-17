import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Finding, IngestedTarget, SignatureEntry } from "../types.js";

let cached: SignatureEntry[] | null = null;

async function loadSignatures(): Promise<SignatureEntry[]> {
  if (cached) return cached;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Prefer adjacent JSON (copied to dist/db) then src/db for dev
  const candidates = [
    path.join(here, "db", "signatures.json"),
    path.join(here, "..", "db", "signatures.json"),
    path.join(here, "..", "..", "src", "db", "signatures.json"),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      cached = JSON.parse(raw) as SignatureEntry[];
      return cached;
    } catch {
      // try next
    }
  }
  cached = [];
  return cached;
}

export async function analyzeSignatures(
  target: IngestedTarget,
): Promise<Finding[]> {
  const db = await loadSignatures();
  const findings: Finding[] = [];
  const npmName = (target.packageMeta?.name ?? "").toLowerCase();
  const repo = (
    target.packageMeta?.repositoryUrl ??
    target.origin ??
    ""
  ).toLowerCase();
  const blob = [...target.files.values()].join("\n");

  for (const entry of db) {
    let hit = false;
    if (
      entry.match.npmNames?.some((n) => n.toLowerCase() === npmName)
    ) {
      hit = true;
    }
    if (
      !hit &&
      entry.match.repoUrls?.some((u) => repo.includes(u.toLowerCase()))
    ) {
      hit = true;
    }
    if (
      !hit &&
      entry.match.contentSubstrings?.some((s) => blob.includes(s))
    ) {
      hit = true;
    }
    if (hit) {
      findings.push({
        id: `sig:${entry.id}`,
        severity: entry.severity,
        title: "Known-bad signature match",
        detail: entry.reason,
      });
    }
  }

  return findings;
}
