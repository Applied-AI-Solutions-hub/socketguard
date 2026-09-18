export type PolicyPosture = "paranoid" | "balanced" | "permissive";

export type PolicyAction = "allow" | "block" | "sanitize" | "ask";

export interface PolicyDecision {
  action: PolicyAction;
  ruleId: string;
  reason: string;
  sanitizedText?: string;
}

export interface ToolCallContext {
  toolName: string;
  arguments: unknown;
}

export interface PolicyOptions {
  posture: PolicyPosture;
  approvedTools?: string[];
  ask?: boolean;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/,
  /\b(ghp_[a-zA-Z0-9]{20,})\b/,
  /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/i,
  /\b(AKIA[0-9A-Z]{16})\b/,
  /\b(eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/,
  /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*\S+/i,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const SHELL_TOOL =
  /\b(run_command|execute_command|shell_exec|exec_command|bash|powershell|terminal)\b/i;

const PATH_TRAVERSAL = /(\.\.\/|\.\.\\|%2e%2e)/i;

const DANGEROUS_ARG =
  /\b(rm\s+-rf|del\s+\/s|format\s+[a-z]:|Invoke-Expression|curl\s+[^\n]*\|.*sh)\b/i;

export function evaluateToolCall(
  ctx: ToolCallContext,
  opts: PolicyOptions,
): PolicyDecision {
  const posture = opts.posture;
  const blob = `${ctx.toolName}\n${safeStringify(ctx.arguments)}`;

  for (const re of SECRET_PATTERNS) {
    if (re.test(blob)) {
      return {
        action: "block",
        ruleId: "rt-secret-in-args",
        reason:
          "Tool call arguments look like they contain credentials or secrets. Socketguard blocked this call.",
      };
    }
  }

  if (PATH_TRAVERSAL.test(blob)) {
    if (posture === "permissive") {
      return {
        action: "allow",
        ruleId: "rt-path-traversal-warn",
        reason:
          "Path traversal pattern in arguments (allowed in permissive mode).",
      };
    }
    return {
      action: "block",
      ruleId: "rt-path-traversal",
      reason:
        "Tool call arguments contain path-traversal patterns. Blocked by Socketguard.",
    };
  }

  if (DANGEROUS_ARG.test(blob)) {
    return {
      action: "block",
      ruleId: "rt-dangerous-command",
      reason:
        "Tool call arguments match a destructive shell pattern. Blocked by Socketguard.",
    };
  }

  if (opts.approvedTools && opts.approvedTools.length > 0) {
    const allowed = new Set(opts.approvedTools.map((t) => t.toLowerCase()));
    if (!allowed.has(ctx.toolName.toLowerCase())) {
      if (opts.ask) {
        return {
          action: "ask",
          ruleId: "rt-unknown-tool",
          reason: `Tool "${ctx.toolName}" was not in the approved scan profile.`,
        };
      }
      return {
        action: "block",
        ruleId: "rt-unknown-tool",
        reason: `Tool "${ctx.toolName}" was not in the approved scan profile. Blocked by Socketguard.`,
      };
    }
  }

  if (SHELL_TOOL.test(ctx.toolName)) {
    if (posture === "paranoid") {
      if (opts.ask) {
        return {
          action: "ask",
          ruleId: "rt-shell-tool",
          reason: `Tool "${ctx.toolName}" looks like shell execution.`,
        };
      }
      return {
        action: "block",
        ruleId: "rt-shell-tool",
        reason: `Tool "${ctx.toolName}" looks like shell execution. Paranoid mode blocks it.`,
      };
    }
    if (posture === "balanced") {
      if (opts.ask) {
        return {
          action: "ask",
          ruleId: "rt-shell-tool",
          reason: `Shell-like tool "${ctx.toolName}" requires approval.`,
        };
      }
      return {
        action: "allow",
        ruleId: "rt-shell-tool-warn",
        reason: `Shell-like tool "${ctx.toolName}" allowed in balanced mode (logged).`,
      };
    }
  }

  return {
    action: "allow",
    ruleId: "rt-allow",
    reason: "Allowed",
  };
}

export function evaluateToolResult(
  text: string,
  posture: PolicyPosture,
): PolicyDecision {
  let found = false;
  let sanitized = text;
  for (const re of SECRET_PATTERNS) {
    if (re.test(sanitized)) {
      found = true;
      sanitized = sanitized.replace(re, "[REDACTED_BY_SOCKETGUARD]");
    }
  }

  if (!found) {
    return { action: "allow", ruleId: "rt-result-ok", reason: "Allowed" };
  }

  return {
    action: "sanitize",
    ruleId: "rt-secret-in-result",
    reason: "Secret-like material in tool result; redacted by Socketguard.",
    sanitizedText: sanitized,
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(v);
  }
}
