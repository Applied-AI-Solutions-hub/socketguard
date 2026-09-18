#!/usr/bin/env node
import { Command } from "commander";
import { scanTarget } from "./scan.js";
import { exitCodeFor } from "./verdict.js";
import type { ScanResult } from "./types.js";
import {
  exitCodeForConfigScan,
  scanAgentConfigs,
} from "./config/scanConfig.js";
import type { ConfigScanSummary } from "./config/types.js";

const program = new Command();

program
  .name("socketguard")
  .description(
    "Scan an MCP server before you trust it with your files and credentials",
  )
  .version("0.2.0");

program
  .command("scan")
  .description("Scan a local path, GitHub URL, or npm package")
  .argument("<target>", "Local directory, github.com URL, or npm package name")
  .option("--json", "Print machine-readable JSON", false)
  .action(async (target: string, opts: { json?: boolean }) => {
    try {
      const result = await scanTarget(target);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printHuman(result);
      }
      process.exitCode = exitCodeFor(result.verdict);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        console.log(
          JSON.stringify({
            verdict: "error",
            label: "Error",
            reasons: [message],
            findings: [],
            target,
          }),
        );
      } else {
        console.error(`Socketguard error: ${message}`);
      }
      process.exitCode = exitCodeFor("error");
    }
  });

program
  .command("scan-config")
  .description(
    "Scan MCP servers configured for Hermes and/or OpenClaw",
  )
  .option("--hermes", "Only scan ~/.hermes/config.yaml", false)
  .option("--openclaw", "Only scan ~/.openclaw/openclaw.json", false)
  .option("--hermes-path <path>", "Override Hermes config path")
  .option("--openclaw-path <path>", "Override OpenClaw config path")
  .option("--json", "Print machine-readable JSON", false)
  .action(
    async (opts: {
      hermes?: boolean;
      openclaw?: boolean;
      hermesPath?: string;
      openclawPath?: string;
      json?: boolean;
    }) => {
      try {
        const summary = await scanAgentConfigs({
          hermes: opts.hermes || undefined,
          openclaw: opts.openclaw || undefined,
          hermesPath: opts.hermesPath,
          openclawPath: opts.openclawPath,
        });

        if (opts.json) {
          console.log(JSON.stringify(summary, null, 2));
        } else {
          printConfigHuman(summary);
        }

        if (summary.configPaths.length === 0) {
          if (!opts.json) {
            console.error(
              "No Hermes or OpenClaw config found. Pass --hermes-path / --openclaw-path, or install those agents first.",
            );
          }
          process.exitCode = 3;
          return;
        }

        process.exitCode = exitCodeForConfigScan(summary);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(
            JSON.stringify({
              worstVerdict: "error",
              hosts: [],
              configPaths: [],
              servers: [],
              error: message,
            }),
          );
        } else {
          console.error(`Socketguard error: ${message}`);
        }
        process.exitCode = 3;
      }
    },
  );

program
  .command("wrap")
  .description(
    "Runtime MCP stdio proxy — sit between Hermes/OpenClaw and an MCP server",
  )
  .option(
    "--policy <posture>",
    "paranoid | balanced | permissive",
    "balanced",
  )
  .option("--quiet", "Less stderr logging", false)
  .argument("[command...]", "Upstream command and args (or use -- ...)")
  .action(async (commandParts: string[], opts: { policy?: string; quiet?: boolean }) => {
    const parts = (() => {
      const after = extractAfterDashDash(process.argv);
      return after.length ? after : commandParts;
    })();
    if (!parts.length) {
      console.error(
        "Usage: socketguard wrap [--policy balanced] -- <command> [args...]\n" +
          "Example: socketguard wrap --policy balanced -- node ./server.js",
      );
      process.exitCode = 3;
      return;
    }

    const posture = normalizePosture(opts.policy ?? "balanced");
    const { runStdioProxy } = await import("./runtime/proxy.js");
    const code = await runStdioProxy({
      command: parts[0],
      args: parts.slice(1),
      posture,
      verbose: !opts.quiet,
    });
    process.exitCode = code;
  });

program.parse();

function printHuman(result: ScanResult): void {
  const bar =
    result.verdict === "safe"
      ? "--------"
      : result.verdict === "caution"
        ? "========"
        : "########";

  console.log("");
  console.log(`Socketguard  ${bar}`);
  console.log(`Verdict:  ${result.label}`);
  console.log(`Target:   ${result.target}`);
  if (result.packageName) console.log(`Package:  ${result.packageName}`);
  console.log(`Tools:    ${result.toolCount}`);
  console.log("");
  console.log("Why:");
  for (const reason of result.reasons) {
    console.log(`  • ${reason}`);
  }
  if (result.findings.length > 2) {
    console.log("");
    console.log(
      `Also found ${result.findings.length - 2} more issue(s). Use --json for the full list.`,
    );
  }
  console.log("");
}

function printConfigHuman(summary: ConfigScanSummary): void {
  console.log("");
  console.log("Socketguard  scan-config");
  if (summary.configPaths.length === 0) {
    console.log("No configs found.");
    console.log("");
    return;
  }

  console.log(`Hosts:    ${summary.hosts.join(", ") || "(none)"}`);
  for (const p of summary.configPaths) {
    console.log(`Config:   ${p}`);
  }
  console.log(`Servers:  ${summary.servers.length}`);
  console.log(`Worst:    ${labelWorst(summary.worstVerdict)}`);
  console.log("");

  if (summary.servers.length === 0) {
    console.log("No MCP servers listed in the config file(s).");
    console.log("");
    return;
  }

  const nameWidth = Math.min(
    28,
    Math.max(8, ...summary.servers.map((s) => s.name.length)),
  );

  for (const s of summary.servers) {
    const host = s.host.padEnd(9);
    const name = s.name.padEnd(nameWidth);
    const enabled = s.enabled ? "on " : "off";
    let verdict = "skip";
    let why = s.note ?? s.error ?? "";
    if (s.result) {
      verdict = s.result.label;
      why = s.result.reasons[0] ?? "";
    } else if (s.error) {
      verdict = "Error";
    }
    const shortWhy =
      why.length > 90 ? `${why.slice(0, 87)}...` : why;
    console.log(
      `${host} ${name} ${enabled}  ${verdict.padEnd(14)}  ${shortWhy}`,
    );
  }
  console.log("");
}

function labelWorst(v: ConfigScanSummary["worstVerdict"]): string {
  if (v === "do_not_install") return "Do not install";
  if (v === "caution") return "Caution";
  if (v === "safe") return "Safe";
  if (v === "error") return "Error";
  return "Empty";
}

function normalizePosture(
  value: string,
): "paranoid" | "balanced" | "permissive" {
  const v = value.toLowerCase();
  if (v === "paranoid" || v === "balanced" || v === "permissive") return v;
  console.error(`Unknown policy "${value}", using balanced`);
  return "balanced";
}

function extractAfterDashDash(argv: string[]): string[] {
  const idx = argv.indexOf("--");
  if (idx === -1) return [];
  return argv.slice(idx + 1);
}
