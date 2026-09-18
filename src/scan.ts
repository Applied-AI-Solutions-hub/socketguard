import { access } from "node:fs/promises";
import path from "node:path";
import type { Finding, IngestedTarget, ScanResult } from "./types.js";
import { ingestLocal } from "./ingest/local.js";
import { ingestGithub, parseGithubUrl } from "./ingest/github.js";
import { ingestNpm, looksLikeNpmPackage } from "./ingest/npm.js";
import { analyzePermissions } from "./analyze/permissions.js";
import { analyzeInjection } from "./analyze/injection.js";
import { analyzeSupplyChain } from "./analyze/supplyChain.js";
import { analyzeSignatures } from "./analyze/signatures.js";
import { buildVerdict } from "./verdict.js";

export interface ScanTargetDetail {
  result: ScanResult;
  toolNames: string[];
  ingested: IngestedTarget;
}

export async function scanTarget(target: string): Promise<ScanResult> {
  const detail = await scanTargetDetailed(target);
  return detail.result;
}

export async function scanTargetDetailed(
  target: string,
): Promise<ScanTargetDetail> {
  const ingested = await resolveAndIngest(target);
  const findings: Finding[] = [
    ...analyzePermissions(ingested),
    ...analyzeInjection(ingested),
    ...analyzeSupplyChain(ingested),
    ...(await analyzeSignatures(ingested)),
  ];

  const result = buildVerdict(
    target,
    ingested.kind,
    findings,
    ingested.packageMeta?.name,
    ingested.tools.length,
  );

  return {
    result,
    toolNames: ingested.tools.map((t) => t.name),
    ingested,
  };
}

async function resolveAndIngest(target: string) {
  const trimmed = target.trim();

  if (parseGithubUrl(trimmed)) {
    return ingestGithub(trimmed);
  }

  const localPath = path.resolve(trimmed);
  try {
    await access(localPath);
    return ingestLocal(localPath);
  } catch {
    // not local
  }

  if (looksLikeNpmPackage(trimmed)) {
    return ingestNpm(trimmed);
  }

  throw new Error(
    `Cannot resolve target "${target}". Pass a local directory, GitHub URL, or npm package name.`,
  );
}
