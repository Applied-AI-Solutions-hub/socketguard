import type { Finding, IngestedTarget } from "../types.js";

const INJECTION_PHRASES = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /IMPORTANT\s+SYSTEM\s+OVERRIDE/i,
  /you\s+are\s+now\s+(in\s+)?(developer|system|god)\s+mode/i,
  /do\s+not\s+tell\s+the\s+user/i,
  /hidden\s+instruction/i,
  /system\s*:\s*you\s+must/i,
  /<\/?\s*system\s*>/i,
  /always\s+call\s+\w+\s+with\s+the\s+user'?s\s+secrets/i,
];

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/;

export function analyzeInjection(target: IngestedTarget): Finding[] {
  const findings: Finding[] = [];

  for (const tool of target.tools) {
    const text = `${tool.name}\n${tool.description}`;
    for (const phrase of INJECTION_PHRASES) {
      if (phrase.test(text)) {
        findings.push({
          id: "inj-tool-description",
          severity: "critical",
          title: "Prompt-injection language in tool description",
          detail: `Tool "${tool.name}" contains instructions aimed at the calling model (matched: ${phrase.source}). Malicious MCP servers often hide commands in description text.`,
        });
        break;
      }
    }
    if (ZERO_WIDTH.test(tool.description)) {
      findings.push({
        id: "inj-zero-width",
        severity: "critical",
        title: "Hidden characters in tool description",
        detail: `Tool "${tool.name}" includes zero-width or bidi control characters, a common way to hide instructions from humans while still feeding them to the model.`,
      });
    }
  }

  for (const [rel, content] of target.files) {
    if (!/\.(js|mjs|cjs|ts|py)$/.test(rel)) continue;
    for (const phrase of INJECTION_PHRASES) {
      if (
        phrase.test(content) &&
        !findings.some((f) => f.id === "inj-tool-description")
      ) {
        findings.push({
          id: "inj-source-phrase",
          severity: "critical",
          title: "Prompt-injection phrase in source",
          detail: `File ${rel} contains model-manipulation language (${phrase.source}).`,
        });
        break;
      }
    }
  }

  return findings;
}
