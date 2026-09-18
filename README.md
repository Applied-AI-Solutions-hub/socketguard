# Socketguard

Scan an MCP server **before** you trust it — and **guard tool calls at runtime**.

Local-first CLI for any MCP host (**Hermes**, **OpenClaw**, and others).

**Repo:** https://github.com/Applied-AI-Solutions-hub/socketguard

## Install

```bash
git clone https://github.com/Applied-AI-Solutions-hub/socketguard.git
cd socketguard
npm install
npm run build
```

## Quick path (what people actually want)

```bash
# 1) Scan and save an approved-tool profile
node dist/cli.js scan ./path/to/mcp-server --save-profile my-server

# 2) Print an OpenClaw/Hermes snippet that wraps the server
node dist/cli.js emit-wrap --host openclaw --name my-server \
  --cmd npx --arg -y --arg @scope/mcp-server \
  --policy balanced --profile my-server

# 3) Or wrap directly
node dist/cli.js wrap --policy balanced --profile my-server --ask -- \
  npx -y @scope/mcp-server
```

## Commands

| Command | Purpose |
|---------|---------|
| `scan` | Pre-install verdict (Safe / Caution / Do not install) |
| `scan --save-profile <name>` | Save approved tools to `~/.socketguard/profiles` |
| `scan-config` | Scan every server in Hermes / OpenClaw config |
| `profiles` | List saved profiles |
| `wrap` | Live stdio proxy (secrets, path traversal, profile lock, optional ask) |
| `emit-wrap` | Generate host config that routes through `wrap` |

### Policies (`wrap --policy`)

| Posture | Behavior |
|---------|----------|
| `paranoid` | Blocks shell-like tools (+ ask if `--ask`); blocks secrets / traversal |
| `balanced` | Default. Blocks secrets / destructive patterns; shell tools logged (or asked) |
| `permissive` | Blocks clear secret args; redacts secrets in results |

`--profile` locks tool names to what was seen at scan time. Unknown tools are blocked (or asked with `--ask`).  
`--ask` prompts on the **console TTY** — it never reads MCP stdin.

## Exit codes (`scan` / `scan-config`)

| Code | Meaning |
|------|---------|
| 0 | Safe |
| 1 | Caution |
| 2 | Do not install |
| 3 | Error |

## License

MIT
