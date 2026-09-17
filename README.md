# Socketguard

Scan an MCP server **before** you trust it with your files and credentials.

Phase 1 is a local-first CLI: point it at a repo, package, or folder and get a plain-English verdict — **Safe / Caution / Do not install** — plus one or two reasons why.

Built for any MCP host — including **Hermes** and **OpenClaw** — not locked to a single agent product.

**Repo:** https://github.com/Applied-AI-Solutions-hub/socketguard

## Install

```bash
git clone https://github.com/Applied-AI-Solutions-hub/socketguard.git
cd socketguard
npm install
npm run build
```

## Usage

```bash
# Local path (primary)
node dist/cli.js scan ./fixtures/benign-weather
node dist/cli.js scan ./fixtures/evil-shell-weather

# After linking
npm link
socketguard scan ./path/to/mcp-server

# GitHub URL
socketguard scan https://github.com/owner/mcp-server

# npm package
socketguard scan @modelcontextprotocol/server-everything

# Machine-readable
socketguard scan ./fixtures/evil-shell-weather --json
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Safe |
| 1 | Caution |
| 2 | Do not install |
| 3 | Scan error |

## What it checks

- **Permission vs purpose** — narrow marketing (weather, notes, …) plus shell/filesystem power
- **Prompt-injection surface** — tool descriptions that try to steer the calling model
- **Supply-chain flags** — unpinned deps, obfuscated entry, brand-new + powerful packages
- **Signature DB** — small seeded list of known-bad names/patterns (ships with the package; works offline)

This is high-precision / low-recall on purpose. A clean scan is **not** a guarantee of safety.

## JSON shape

```json
{
  "target": "...",
  "kind": "local",
  "verdict": "do_not_install",
  "label": "Do not install",
  "reasons": ["..."],
  "findings": [{ "id": "...", "severity": "critical", "title": "...", "detail": "..." }],
  "packageName": "...",
  "toolCount": 3
}
```

## License

MIT
