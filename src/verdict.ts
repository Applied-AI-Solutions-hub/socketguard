import type { Finding, ScanResult, Verdict } from "./types.js";

const LABELS: Record<Verdict, string> = {
  safe: "Safe",
  caution: "Caution",
  do_not_install: "Do not install",
};

export function buildVerdict(
  targetLabel: string,
  kind: ScanResult["kind"],
  findings: Finding[],
  packageName: string | undefined,
  toolCount: number,
): ScanResult {
  let verdict: Verdict = "safe";
  if (findings.some((f) => f.severity === "critical")) {
    verdict = "do_not_install";
  } else if (findings.some((f) => f.severity === "caution")) {
    verdict = "caution";
  }

  const ranked = [...findings].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
  const reasons = ranked.slice(0, 2).map((f) => f.detail);

  if (verdict === "safe" && reasons.length === 0) {
    reasons.push(
      toolCount === 0
        ? "No obvious MCP tools or high-risk APIs were found in the scanned files. Still review the code yourself before granting access."
        : `Scanned ${toolCount} tool(s); no high-confidence red flags. That is not a guarantee of safety.`,
    );
  }

  return {
    target: targetLabel,
    kind,
    verdict,
    label: LABELS[verdict],
    reasons,
    findings: ranked,
    packageName,
    toolCount,
  };
}

function severityRank(s: Finding["severity"]): number {
  if (s === "critical") return 3;
  if (s === "caution") return 2;
  return 1;
}

export function exitCodeFor(verdict: Verdict | "error"): number {
  if (verdict === "safe") return 0;
  if (verdict === "caution") return 1;
  if (verdict === "do_not_install") return 2;
  return 3;
}
