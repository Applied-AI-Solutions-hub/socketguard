import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import {
  evaluateToolCall,
  evaluateToolResult,
  type PolicyPosture,
} from "./policy.js";

export interface WrapOptions {
  command: string;
  args: string[];
  posture: PolicyPosture;
  /** Log decisions to stderr */
  verbose?: boolean;
}

/**
 * Stdio MCP proxy: client <-> (this process) <-> upstream MCP server.
 * Wire format: newline-delimited JSON-RPC (MCP stdio).
 */
export async function runStdioProxy(opts: WrapOptions): Promise<number> {
  const child = spawn(opts.command, opts.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    shell: false,
  });

  attachLifecycle(child, opts);

  // Upstream stderr → our stderr (never mix into protocol stdout)
  child.stderr.on("data", (buf: Buffer) => {
    process.stderr.write(buf);
  });

  const pendingCalls = new Map<
    string | number,
    { toolName: string }
  >();

  // Client → proxy → server
  const clientIn = createInterface({ input: process.stdin, crlfDelay: Infinity });
  clientIn.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      log(opts, `drop non-JSON from client: ${line.slice(0, 120)}`);
      return;
    }

    if (msg.method === "tools/call") {
      const params = (msg.params ?? {}) as {
        name?: string;
        arguments?: unknown;
      };
      const decision = evaluateToolCall(
        {
          toolName: String(params.name ?? ""),
          arguments: params.arguments,
        },
        opts.posture,
      );

      if (decision.action === "block") {
        log(opts, `BLOCK ${decision.ruleId}: ${decision.reason}`);
        const id = msg.id;
        if (id !== undefined) {
          writeClient({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32000,
              message: `Socketguard blocked tool call: ${decision.reason}`,
              data: { ruleId: decision.ruleId },
            },
          });
        }
        return;
      }

      if (decision.ruleId !== "rt-allow") {
        log(opts, `${decision.action.toUpperCase()} ${decision.ruleId}: ${decision.reason}`);
      }

      if (msg.id !== undefined) {
        pendingCalls.set(msg.id as string | number, {
          toolName: String(params.name ?? ""),
        });
      }
    }

    writeUpstream(child, msg);
  });

  // Server → proxy → client
  const serverOut = createInterface({ input: child.stdout, crlfDelay: Infinity });
  serverOut.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Non-JSON on stdout is a protocol violation; drop to protect client
      log(opts, `drop non-JSON from server: ${line.slice(0, 120)}`);
      return;
    }

    if (msg.id !== undefined && msg.result && pendingCalls.has(msg.id as string | number)) {
      pendingCalls.delete(msg.id as string | number);
      const result = msg.result as {
        content?: Array<{ type?: string; text?: string }>;
      };
      if (Array.isArray(result.content)) {
        let changed = false;
        for (const item of result.content) {
          if (item && item.type === "text" && typeof item.text === "string") {
            const d = evaluateToolResult(item.text, opts.posture);
            if (d.action === "sanitize" && d.sanitizedText !== undefined) {
              item.text = d.sanitizedText;
              changed = true;
              log(opts, `SANITIZE ${d.ruleId}: ${d.reason}`);
            }
          }
        }
        if (changed) {
          msg.result = result;
        }
      }
    }

    writeClient(msg);
  });

  return await new Promise<number>((resolve) => {
    const finish = (code: number) => resolve(code);
    child.on("exit", (code, signal) => {
      finish(code ?? (signal ? 1 : 0));
    });
    child.on("error", (err) => {
      log(opts, `failed to start upstream: ${err.message}`);
      finish(1);
    });
    process.stdin.on("end", () => {
      child.stdin.end();
    });
  });
}

function writeUpstream(
  child: ChildProcessWithoutNullStreams,
  msg: unknown,
): void {
  if (!child.stdin.writable) return;
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}

function writeClient(msg: unknown): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function attachLifecycle(
  child: ChildProcessWithoutNullStreams,
  opts: WrapOptions,
): void {
  const shutdown = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  log(
    opts,
    `wrap started posture=${opts.posture} upstream=${opts.command} ${opts.args.join(" ")}`,
  );
}

function log(opts: WrapOptions, message: string): void {
  if (opts.verbose === false) return;
  process.stderr.write(`[socketguard] ${message}\n`);
}
