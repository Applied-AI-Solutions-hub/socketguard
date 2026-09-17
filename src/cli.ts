#!/usr/bin/env node
import { Command } from "commander";
import { scanTarget } from "./scan.js";
import { exitCodeFor } from "./verdict.js";
import type { ScanResult } from "./types.js";

const program = new Command();

program
  .name("socketguard")
  .description(
    "Scan an MCP server before you trust it with your files and credentials",
  )
  .version("0.1.0");

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
    console.log(`Also found ${result.findings.length - 2} more issue(s). Use --json for the full list.`);
  }
  console.log("");
}
