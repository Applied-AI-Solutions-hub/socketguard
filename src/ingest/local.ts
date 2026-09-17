import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { IngestedTarget, PackageMeta } from "../types.js";
import { extractToolsFromSources } from "../analyze/tools.js";

const TEXT_EXTS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".json",
  ".md",
  ".py",
  ".toml",
  ".yaml",
  ".yml",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  "vendor",
]);

async function walkFiles(
  dir: string,
  base: string,
  out: Map<string, string>,
  maxFiles = 200,
): Promise<void> {
  if (out.size >= maxFiles) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.size >= maxFiles) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkFiles(full, base, out, maxFiles);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTS.has(ext) && entry.name !== "Dockerfile") continue;
    try {
      const st = await stat(full);
      if (st.size > 512_000) continue;
      const rel = path.relative(base, full).split(path.sep).join("/");
      out.set(rel, await readFile(full, "utf8"));
    } catch {
      // skip unreadable
    }
  }
}

export async function ingestLocal(
  targetPath: string,
): Promise<IngestedTarget> {
  const rootDir = path.resolve(targetPath);
  const st = await stat(rootDir);
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${rootDir}`);
  }

  const files = new Map<string, string>();
  await walkFiles(rootDir, rootDir, files);

  let packageMeta: PackageMeta | undefined;
  const pkgRaw = files.get("package.json");
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as PackageMeta & {
        repository?: string | { url?: string };
      };
      packageMeta = {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        main: pkg.main,
        dependencies: pkg.dependencies,
        optionalDependencies: pkg.optionalDependencies,
        peerDependencies: pkg.peerDependencies,
        repositoryUrl:
          typeof pkg.repository === "string"
            ? pkg.repository
            : pkg.repository?.url,
      };
    } catch {
      // ignore malformed package.json
    }
  }

  const tools = extractToolsFromSources(files);

  return {
    kind: "local",
    origin: rootDir,
    rootDir,
    packageMeta,
    files,
    tools,
  };
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
