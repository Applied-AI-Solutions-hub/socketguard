import { readFile } from "node:fs/promises";
import YAML from "yaml";
import type { ConfiguredServer } from "./types.js";

/**
 * Hermes stores MCP servers under mcp_servers in ~/.hermes/config.yaml
 */
export async function parseHermesConfig(
  filePath: string,
): Promise<ConfiguredServer[]> {
  const raw = await readFile(filePath, "utf8");
  const doc = YAML.parse(raw) as Record<string, unknown> | null;
  if (!doc || typeof doc !== "object") return [];

  const block =
    (doc.mcp_servers as Record<string, unknown> | undefined) ??
    ((doc.mcp as Record<string, unknown> | undefined)?.servers as
      | Record<string, unknown>
      | undefined);

  if (!block || typeof block !== "object") return [];

  return Object.entries(block).map(([name, value]) =>
    normalizeEntry("hermes", name, value),
  );
}

function normalizeEntry(
  host: "hermes",
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
    transport = t === "sse" ? "sse" : "http";
  } else if (command) {
    transport = "stdio";
  }

  return { host, name, enabled, transport, command, args, url, raw: obj };
}
