import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IngestedTarget } from "../types.js";
import { ingestLocal } from "./local.js";

const execFileAsync = promisify(execFile);

const NPM_NAME_RE =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

export function looksLikeNpmPackage(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.includes("://") ||
    trimmed.includes("\\") ||
    (trimmed.includes("/") && !trimmed.startsWith("@"))
  ) {
    return false;
  }
  if (trimmed.startsWith("@") && trimmed.split("/").length !== 2) {
    return false;
  }
  return NPM_NAME_RE.test(trimmed);
}

/**
 * Fetch packument + download tarball via npm registry, extract with tar when available.
 */
export async function ingestNpm(packageName: string): Promise<IngestedTarget> {
  const name = packageName.trim();
  if (!looksLikeNpmPackage(name)) {
    throw new Error(`Not a valid npm package name: ${name}`);
  }

  const urlName = name.startsWith("@")
    ? `@${name.slice(1).replace("/", "%2F")}`
    : encodeURIComponent(name);

  const packument = await fetchJson<{
    name?: string;
    description?: string;
    time?: Record<string, string>;
    "dist-tags"?: { latest?: string };
    versions?: Record<
      string,
      {
        version: string;
        description?: string;
        main?: string;
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        repository?: string | { url?: string };
        dist?: { tarball?: string };
      }
    >;
  }>(`https://registry.npmjs.org/${urlName}`);

  const version =
    packument["dist-tags"]?.latest ??
    Object.keys(packument.versions ?? {}).pop();
  if (!version || !packument.versions?.[version]) {
    throw new Error(`No versions found for npm package ${name}`);
  }
  const meta = packument.versions[version];
  const tarball = meta.dist?.tarball;
  if (!tarball) {
    throw new Error(`No tarball URL for ${name}@${version}`);
  }

  const publishedAt = packument.time?.[version];
  const tmp = await mkdtemp(path.join(tmpdir(), "socketguard-npm-"));
  const tgzPath = path.join(tmp, "package.tgz");
  const extractDir = path.join(tmp, "extract");
  await mkdir(extractDir, { recursive: true });

  try {
    const res = await fetch(tarball, {
      headers: { "User-Agent": "socketguard" },
    });
    if (!res.ok) {
      throw new Error(`Failed to download tarball (${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(tgzPath, buf);

    try {
      await execFileAsync("tar", ["-xzf", tgzPath, "-C", extractDir]);
    } catch {
      try {
        await execFileAsync("tar.exe", ["-xzf", tgzPath, "-C", extractDir]);
      } catch {
        await extractTarballLite(buf, extractDir);
      }
    }

    const root = path.join(extractDir, "package");
    const ingested = await ingestLocal(root);
    ingested.kind = "npm";
    ingested.origin = `${name}@${version}`;
    ingested.packageMeta = {
      ...ingested.packageMeta,
      name: packument.name ?? name,
      version,
      description: meta.description ?? packument.description,
      publishedAt,
      repositoryUrl:
        typeof meta.repository === "string"
          ? meta.repository
          : meta.repository?.url,
    };
    return ingested;
  } catch (err) {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "socketguard", Accept: "application/json" },
  });
  if (res.status === 404) {
    throw new Error(`npm package not found: ${url}`);
  }
  if (!res.ok) {
    throw new Error(`npm registry ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

/** Minimal ustar .tar.gz reader when system tar is unavailable. */
async function extractTarballLite(
  gzipped: Buffer,
  dest: string,
): Promise<void> {
  const tar = gunzipSync(gzipped);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    const name = header
      .subarray(0, 100)
      .toString("utf8")
      .replace(/\0.*$/, "");
    if (!name) break;
    const sizeOctal = header
      .subarray(124, 136)
      .toString("utf8")
      .replace(/\0/g, "")
      .trim();
    const size = parseInt(sizeOctal || "0", 8) || 0;
    const typeFlag = String.fromCharCode(header[156] ?? 0);
    const data = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (typeFlag === "5" || name.endsWith("/")) {
      await mkdir(path.join(dest, name), { recursive: true });
      continue;
    }
    if (typeFlag !== "0" && typeFlag !== "\0" && typeFlag !== "") continue;
    const outPath = path.join(dest, name);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, data);
  }
}
