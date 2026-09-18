# Socketguard

Scan an MCP server **before** you trust it — and **guard tool calls at runtime**.

Local-first CLI for any MCP host (**Hermes**, **OpenClaw**, Claude Desktop configs, etc.).

**Repo:** https://github.com/Applied-AI-Solutions-hub/socketguard

## Install

```bash
git clone https://github.com/Applied-AI-Solutions-hub/socketguard.git
cd socketguard
npm install
npm run build
```

## Usage

### Scan a server (pre-install)

```bash
node dist/cli.js scan ./fixtures/benign-weather
node dist/cli.js scan ./fixtures/evil-shell-weather
node dist/cli.js scan https://github.com/owner/mcp-server
node dist/cli.js scan @modelcontextprotocol/server-everything --json
```

### Scan Hermes / OpenClaw configs

```bash
node dist/cli.js scan-config
node dist/cli.js scan-config --hermes
node dist/cli.js scan-config --openclaw
```

### Runtime wrap (live protection)

Point your agent at Socketguard instead of the raw MCP server:

```bash
socketguard wrap --policy balanced -- <upstream-command> [args...]
```

**OpenClaw / Hermes example** — wrap a stdio server:

```json
{
  "command": "node",
  "args": [
    "/path/to/socketguard/dist/cli.js",
    "wrap",
    "--policy",
    "balanced",
    "--",
    "npx",
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/home/you/projects"
  ]
}
```

Policies:

| Posture | Behavior |
|---------|----------|
| `paranoid` | Blocks shell-like tools, path traversal, secret-looking args; redacts secrets in results |
| `balanced` (default) | Blocks secrets + destructive patterns; logs shell-like tools; redacts secrets in results |
| `permissive` | Blocks clear secret args; redacts secrets in results; otherwise allows |

## Exit codes (`scan` / `scan-config`)

| Code | Meaning |
|------|---------|
| 0 | Safe |
| 1 | Caution |
| 2 | Do not install |
| 3 | Scan error |

## What it checks (scanner)

- Permission vs purpose
- Prompt-injection surface in tool descriptions
- Supply-chain red flags
- Seeded known-bad signatures

A clean scan is **not** a guarantee of safety. Prefer `wrap` for live calls.

## License

MIT
