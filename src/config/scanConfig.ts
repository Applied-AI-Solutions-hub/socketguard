import { access } from "node:fs/promises";
import { scanTarget } from "../scan.js";
import { exitCodeFor } from "../verdict.js";
import type { Verdict } from "../types.js";
import { hermesConfigPath, openclawConfigPath } from "./paths.js";
import { parseHermesConfig } from "./parseHermes.js";
import { parseOpenclawConfig } from "./parseOpenclaw.js";
import { resolveConfiguredServer } from "./resolveServer.js";
import type {
  AgentHost,
  ConfigScanSummary,
  ConfigServerResult,
  ConfiguredServer,
} from "./types.js";

export interface ScanConfigOptions {
  hermes?: boolean;
  openclaw?: boolean;
  hermesPath?: string;
  openclawPath?: string;
  /** Include disabled servers (default true) */
  includeDisabled?: boolean;
}

export async function scanAgentConfigs(
  opts: ScanConfigOptions = {},
): Promise<ConfigScanSummary> {
  const wantHermes = opts.hermes || (!opts.hermes && !opts.openclaw);
  const wantOpenclaw = opts.openclaw || (!opts.hermes && !opts.openclaw);
  const includeDisabled = opts.includeDisabled !== false;

  const hosts: AgentHost[] = [];
  const configPaths: string[] = [];
  const servers: ConfiguredServer[] = [];

  if (wantHermes) {
    const p = opts.hermesPath ?? hermesConfigPath();
    if (await exists(p)) {
      hosts.push("hermes");
      configPaths.push(p);
      servers.push(...(await parseHermesConfig(p)));
    }
  }

  if (wantOpenclaw) {
    const p = opts.openclawPath ?? openclawConfigPath();
    if (await exists(p)) {
      hosts.push("openclaw");
      configPaths.push(p);
      servers.push(...(await parseOpenclawConfig(p)));
    }
  }

  const results: ConfigServerResult[] = [];

  for (const server of servers) {
    if (!includeDisabled && !server.enabled) continue;

    const base: ConfigServerResult = {
      host: server.host,
      name: server.name,
      enabled: server.enabled,
      transport: server.transport,
    };

    const resolved = resolveConfiguredServer(server);

    if (resolved.kind === "skip") {
      results.push({ ...base, note: resolved.reason });
      continue;
    }

    if (resolved.kind === "remote") {
      results.push({
        ...base,
        resolved: resolved.url,
        note: resolved.reason,
        result: {
          target: resolved.url,
          kind: "npm",
          verdict: "caution",
          label: "Caution",
          reasons: [resolved.reason],
          findings: [
            {
              id: "remote-unscanned",
              severity: "caution",
              title: "Remote MCP server",
              detail: resolved.reason,
            },
          ],
          toolCount: 0,
        },
      });
      continue;
    }

    try {
      const result = await scanTarget(resolved.target);
      results.push({
        ...base,
        resolved: resolved.target,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        ...base,
        resolved: resolved.target,
        error: message,
      });
    }
  }

  return {
    hosts,
    configPaths,
    servers: results,
    worstVerdict: worstOf(results),
  };
}

export function exitCodeForConfigScan(summary: ConfigScanSummary): number {
  if (summary.worstVerdict === "empty") return 0;
  if (summary.worstVerdict === "error") return 3;
  return exitCodeFor(summary.worstVerdict);
}

function worstOf(
  results: ConfigServerResult[],
): Verdict | "error" | "empty" {
  if (results.length === 0) return "empty";
  if (results.some((r) => r.error)) return "error";
  const verdicts = results
    .map((r) => r.result?.verdict)
    .filter((v): v is Verdict => !!v);
  if (verdicts.includes("do_not_install")) return "do_not_install";
  if (verdicts.includes("caution")) return "caution";
  if (verdicts.length > 0) return "safe";
  return "empty";
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
