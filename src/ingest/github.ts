import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IngestedTarget } from "../types.js";
import { ingestLocal } from "./local.js";

const GITHUB_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i;

export function parseGithubUrl(
  input: string,
): { owner: string; repo: string } | null {
  const m = input.trim().match(GITHUB_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/**
 * Best-effort: fetch key files via raw.githubusercontent.com (no git required).
 * Falls back to cloning via `git` if available is intentionally skipped for MVP simplicity —
 * we pull common MCP entry paths from the default branch.
 */
export async function ingestGithub(input: string): Promise<IngestedTarget> {
  const parsed = parseGithubUrl(input);
  if (!parsed) {
    throw new Error(`Not a GitHub URL: ${input}`);
  }
  const { owner, repo } = parsed;
  const baseApi = `https://api.github.com/repos/${owner}/${repo}`;

  const repoMeta = await fetchJson<{
    default_branch?: string;
    description?: string;
    html_url?: string;
  }>(baseApi);

  const branch = repoMeta.default_branch ?? "main";
  const tree = await fetchJson<{
    tree?: Array<{ path: string; type: string; size?: number }>;
  }>(`${baseApi}/git/trees/${branch}?recursive=1`);

  const interesting = (tree.tree ?? [])
    .filter((t) => t.type === "blob")
    .filter((t) =>
      /\.(js|mjs|cjs|ts|py|json|md)$/i.test(t.path) ||
      /(^|\/)(package\.json|pyproject\.toml|mcp\.json)$/i.test(t.path),
    )
    .filter((t) => !t.path.includes("node_modules/"))
    .filter((t) => (t.size ?? 0) < 512_000)
    .slice(0, 80);

  const tmp = await mkdtemp(path.join(tmpdir(), "socketguard-gh-"));
  try {
    for (const item of interesting) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
      const res = await fetch(rawUrl, {
        headers: { "User-Agent": "socketguard" },
      });
      if (!res.ok) continue;
      const text = await res.text();
      const dest = path.join(tmp, item.path);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, text, "utf8");
    }

    // Ensure package.json has repository for signature matching
    const pkgPath = path.join(tmp, "package.json");
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      if (!pkg.repository) {
        pkg.repository = { url: repoMeta.html_url ?? input };
      }
      if (!pkg.description && repoMeta.description) {
        pkg.description = repoMeta.description;
      }
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
    } catch {
      await writeFile(
        pkgPath,
        JSON.stringify(
          {
            name: `${owner}/${repo}`,
            description: repoMeta.description,
            repository: { url: repoMeta.html_url ?? input },
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    const ingested = await ingestLocal(tmp);
    ingested.kind = "github";
    ingested.origin = repoMeta.html_url ?? `https://github.com/${owner}/${repo}`;
    return ingested;
  } catch (err) {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "socketguard",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}
