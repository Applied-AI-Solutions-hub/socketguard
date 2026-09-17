import { readFile } from "node:fs/promises";
import JSON5 from "json5";
import type { ConfiguredServer } from "./types.js";

/**
 * OpenClaw stores MCP servers under mcp.servers in ~/.openclaw/openclaw.json
 * (JSON or JSON5).
 */
export async function parseOpenclawConfig(
  filePath: string,
): Promise<ConfiguredServer[]> {
  const raw = await readFile(filePath, "utf8");
  const doc = JSON5.parse(raw) as Record<string, unknown>;
  if (!doc || typeof doc !== "object") return [];

  const mcp = doc.mcp as Record<string, unknown> | undefined;
  const block =
    (mcp?.servers as Record<string, unknown> | undefined) ??
    (doc.mcpServers as Record<string, unknown> | undefined);

  if (!block || typeof block !== "object") return [];

  return Object.entries(block).map(([name, value]) =>
    normalizeEntry("openclaw", name, value),
  );
}

function normalizeEntry(
  host: "openclaw",
  name: string,
  value: unknown,
): ConfiguredServer {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const command = typeof obj.command === "string" ? obj.command : undefined;
  const args = Array.isArray(obj.args) ? obj.args.map(String) : undefined;
  const url = typeof obj.url === "string" ? obj.url : undefined;
  const enabled = obj.enabled === false ? false : true;

  let transport: ConfiguredServer["transport"] = "unknown";
  if (url) {
    const t = String(obj.transport ?? obj.type ?? "").toLowerCase();
    transport =
      t === "sse" ? "sse" : t.includes("http") || t === "" ? "http" : "http";
  } else if (command) {
    transport = "stdio";
  }

  return { host, name, enabled, transport, command, args, url, raw: obj };
}
