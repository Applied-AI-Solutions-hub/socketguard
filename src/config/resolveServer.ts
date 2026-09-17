import path from "node:path";
import type { ConfiguredServer, ResolveKind } from "./types.js";

/**
 * Turn a host MCP config entry into something scanTarget() can ingest,
 * or a skip/remote note when static scanning is not possible.
 */
export function resolveConfiguredServer(server: ConfiguredServer): ResolveKind {
  if (server.url) {
    const url = server.url.trim();
    if (/github\.com\//i.test(url)) {
      return { kind: "scan", target: url };
    }
    return {
      kind: "remote",
      url,
      reason:
        "Remote MCP endpoint — Socketguard cannot statically scan hosted servers yet. Review the provider and scopes manually.",
    };
  }

  if (!server.command) {
    return {
      kind: "skip",
      reason: "No command or URL in this MCP server entry.",
    };
  }

  const cmd = server.command.trim();
  const args = server.args ?? [];
  const base = path.basename(cmd).toLowerCase();

  // npx / pnpm dlx / yarn dlx → npm package
  if (
    base === "npx" ||
    base === "npx.cmd" ||
    base === "pnpm" ||
    base === "pnpm.cmd" ||
    base === "yarn" ||
    base === "yarn.cmd" ||
    base === "bunx" ||
    base === "bunx.exe"
  ) {
    const pkg = extractNpmPackage(args);
    if (pkg) return { kind: "scan", target: pkg };
    return {
      kind: "skip",
      reason: `Could not extract an npm package from: ${cmd} ${args.join(" ")}`,
    };
  }

  // uvx / uv tool run → treat trailing token as package name for npm-style scan attempt
  if (base === "uvx" || base === "uv" || base === "uv.exe") {
    const pkg = extractUvxPackage(args);
    if (pkg) {
      return {
        kind: "scan",
        target: pkg,
      };
    }
    return {
      kind: "skip",
      reason: `Could not extract a package from: ${cmd} ${args.join(" ")}`,
    };
  }

  // node / python / deno running a local script
  if (
    base === "node" ||
    base === "node.exe" ||
    base === "python" ||
    base === "python3" ||
    base === "python.exe" ||
    base === "deno" ||
    base === "deno.exe"
  ) {
    const script = args.find(
      (a) =>
        !a.startsWith("-") &&
        /\.(js|mjs|cjs|ts|py)$/i.test(a),
    );
    if (script) {
      const dir = path.isAbsolute(script)
        ? path.dirname(script)
        : path.dirname(path.resolve(script));
      return { kind: "scan", target: dir };
    }
  }

  // Bare path to an executable or directory
  if (
    cmd.includes("/") ||
    cmd.includes("\\") ||
    /\.(js|mjs|cjs|ts|py)$/i.test(cmd)
  ) {
    const target = /\.(js|mjs|cjs|ts|py)$/i.test(cmd)
      ? path.dirname(path.resolve(cmd))
      : path.resolve(cmd);
    return { kind: "scan", target };
  }

  return {
    kind: "skip",
    reason: `Unsupported launch command for static scan: ${cmd} ${args.join(" ")}`.trim(),
  };
}

function extractNpmPackage(args: string[]): string | null {
  const skip = new Set([
    "-y",
    "--yes",
    "-p",
    "--package",
    "dlx",
    "exec",
    "--",
  ]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (skip.has(a)) continue;
    if (a.startsWith("-")) continue;
    // scoped or unscoped package
    if (/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(a)) {
      return a;
    }
  }
  return null;
}

function extractUvxPackage(args: string[]): string | null {
  const filtered = args.filter(
    (a) => a !== "tool" && a !== "run" && !a.startsWith("-"),
  );
  return filtered[0] ?? null;
}
