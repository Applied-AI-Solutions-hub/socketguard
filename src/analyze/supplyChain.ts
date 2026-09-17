import type { Finding, IngestedTarget } from "../types.js";

const UNPINNED = /^(latest|\*|x|\d+\.x)$/i;

function hasPowerfulSurface(target: IngestedTarget): boolean {
  const blob = [
    ...target.tools.map((t) => `${t.name} ${t.description}`),
    ...target.files.values(),
  ].join("\n");
  return /\b(execSync|child_process|subprocess|writeFile|run_command)\b/.test(
    blob,
  );
}

export function analyzeSupplyChain(target: IngestedTarget): Finding[] {
  const findings: Finding[] = [];
  const deps = {
    ...target.packageMeta?.dependencies,
    ...target.packageMeta?.optionalDependencies,
  };

  const unpinned = Object.entries(deps).filter(([, v]) => UNPINNED.test(v));
  if (unpinned.length > 0) {
    findings.push({
      id: "sc-unpinned-deps",
      severity: "caution",
      title: "Unpinned dependencies",
      detail: `Dependencies use floating versions (${unpinned
        .map(([k, v]) => `${k}@${v}`)
        .join(", ")}). That enables supply-chain swaps after you first reviewed the package.`,
    });
  }

  // Obfuscation: single huge minified main with hex escapes / packed look
  const main = target.packageMeta?.main;
  if (main) {
    const mainContent = target.files.get(main.replace(/^\.\//, ""));
    if (mainContent && looksObfuscated(mainContent)) {
      findings.push({
        id: "sc-obfuscated-entry",
        severity: "critical",
        title: "Obfuscated entrypoint",
        detail: `Main entry "${main}" looks heavily minified/obfuscated, which blocks review of what the MCP server actually does.`,
      });
    }
  }

  if (target.packageMeta?.publishedAt) {
    const published = Date.parse(target.packageMeta.publishedAt);
    if (!Number.isNaN(published)) {
      const ageDays = (Date.now() - published) / (1000 * 60 * 60 * 24);
      if (ageDays < 14 && hasPowerfulSurface(target)) {
        findings.push({
          id: "sc-very-new-powerful",
          severity: "caution",
          title: "Very new package with powerful capabilities",
          detail: `Published about ${Math.floor(ageDays)} day(s) ago and includes shell/filesystem capabilities. Brand-new packages with broad access deserve extra skepticism.`,
        });
      }
    }
  }

  return findings;
}

function looksObfuscated(content: string): boolean {
  if (content.length < 4000) return false;
  const lines = content.split("\n");
  if (lines.length <= 3 && content.length > 8000) return true;
  const hexRatio =
    (content.match(/\\x[0-9a-f]{2}/gi) ?? []).length /
    Math.max(content.length / 50, 1);
  return hexRatio > 5;
}
