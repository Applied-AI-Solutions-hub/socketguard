import type { Finding, IngestedTarget, McpTool } from "../types.js";

const BENIGN_PURPOSE =
  /\b(weather|forecast|notes?|todo|calendar|translate|dictionary|joke|quote|math|calculator|unit.?convert)\b/i;

const POWERFUL_TOOL =
  /\b(run_command|execute_command|shell|exec|spawn|bash|powershell|write_file|writeFile|delete_file|rm_rf|eval|os\.system|subprocess|child_process)\b/i;

const FS_WRITE =
  /\b(writeFile|write_file|write_cache|unlink|rmdir|mkdir|createWriteStream|fs\.write)\b/i;

const SHELL =
  /\b(execSync|exec\(|spawn\(|child_process|os\.system|subprocess\.|Popen|shell=True)\b/i;

function purposeLooksBenign(target: IngestedTarget): boolean {
  const bits = [
    target.packageMeta?.name ?? "",
    target.packageMeta?.description ?? "",
    ...target.tools.map((t) => `${t.name} ${t.description}`),
  ].join(" ");
  return BENIGN_PURPOSE.test(bits);
}

function toolIsPowerful(tool: McpTool): boolean {
  if (POWERFUL_TOOL.test(tool.name)) return true;
  if (
    typeof tool.inputSchema === "object" &&
    tool.inputSchema !== null &&
    POWERFUL_TOOL.test(JSON.stringify(tool.inputSchema))
  ) {
    return true;
  }
  return false;
}

export function analyzePermissions(target: IngestedTarget): Finding[] {
  const findings: Finding[] = [];
  const sources = [...target.files.values()].join("\n");
  const benign = purposeLooksBenign(target);
  const powerfulTools = target.tools.filter(toolIsPowerful);

  if (benign && powerfulTools.length > 0) {
    findings.push({
      id: "perm-purpose-mismatch",
      severity: "critical",
      title: "Permissions do not match stated purpose",
      detail: `This server presents as a limited helper (${summarizePurpose(target)}) but exposes powerful tools: ${powerfulTools
        .map((t) => t.name)
        .join(", ")}. That combination is a strong install risk.`,
    });
  } else if (powerfulTools.length > 0) {
    findings.push({
      id: "perm-powerful-tools",
      severity: "caution",
      title: "Server requests powerful capabilities",
      detail: `Tools with shell/filesystem power: ${powerfulTools
        .map((t) => t.name)
        .join(", ")}. Only install if you intentionally want that access.`,
    });
  }

  if (benign && SHELL.test(sources)) {
    findings.push({
      id: "perm-shell-in-benign",
      severity: "critical",
      title: "Shell execution found in a limited-purpose server",
      detail:
        "Source imports or calls process/shell APIs while marketing a narrow purpose (e.g. weather). That is a classic malicious MCP pattern.",
    });
  } else if (SHELL.test(sources) && !findings.some((f) => f.id === "perm-shell-in-benign")) {
    findings.push({
      id: "perm-shell-apis",
      severity: "caution",
      title: "Shell or process APIs present",
      detail:
        "Source uses child_process / subprocess / os.system. Confirm this matches what you expect from the server.",
    });
  }

  if (benign && FS_WRITE.test(sources)) {
    findings.push({
      id: "perm-fs-write-benign",
      severity: "critical",
      title: "Filesystem write in a limited-purpose server",
      detail:
        "A narrow-purpose MCP server that writes arbitrary files can exfiltrate or overwrite data on your machine.",
    });
  }

  return dedupe(findings);
}

function summarizePurpose(target: IngestedTarget): string {
  const d = target.packageMeta?.description || target.packageMeta?.name || "helper";
  return d.length > 80 ? `${d.slice(0, 77)}...` : d;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}
