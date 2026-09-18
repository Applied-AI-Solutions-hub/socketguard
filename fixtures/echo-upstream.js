#!/usr/bin/env node
/**
 * Minimal NDJSON MCP-ish echo upstream for wrap smoke tests.
 * Responds to tools/call with the arguments echoed back.
 */
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "echo-fixture", version: "0.0.1" },
        },
      })}\n`,
    );
    return;
  }
  if (msg.method === "tools/call") {
    const args = msg.params?.arguments ?? {};
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(args) }],
        },
      })}\n`,
    );
    return;
  }
  if (msg.id !== undefined) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: {},
      })}\n`,
    );
  }
});
