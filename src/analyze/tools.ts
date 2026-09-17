import type { McpTool } from "../types.js";

/**
 * Extract MCP tool definitions from source without executing it.
 * Covers common patterns: ListTools handlers, tools: [...] literals,
 * and Python @mcp.tool / list_tools style descriptions.
 */
export function extractToolsFromSources(
  files: Map<string, string>,
): McpTool[] {
  const tools: McpTool[] = [];
  const seen = new Set<string>();

  for (const [rel, content] of files) {
    for (const tool of extractFromJsLike(content, rel)) {
      const key = `${tool.name}::${tool.description.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tools.push(tool);
    }
    for (const tool of extractFromPython(content, rel)) {
      const key = `${tool.name}::${tool.description.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tools.push(tool);
    }
  }

  return tools;
}

function extractFromJsLike(content: string, sourceFile: string): McpTool[] {
  const tools: McpTool[] = [];
  // Match object literals that look like MCP tool defs: name + description
  const re =
    /\{\s*name\s*:\s*(["'`])([^"'`]+)\1\s*,\s*description\s*:\s*(["'`])([\s\S]*?)\3/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[2];
    let description = m[4];
    // Trim common template/escape noise for single-line reads
    description = description
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    const after = content.slice(m.index, m.index + 2500);
    const schemaMatch = after.match(/inputSchema\s*:\s*(\{[\s\S]*?\n\s*\})/);
    let inputSchema: unknown;
    if (schemaMatch) {
      try {
        // Best-effort: only parse if it looks like JSON-ish
        const raw = schemaMatch[1]
          .replace(/(\w+)\s*:/g, '"$1":')
          .replace(/'/g, '"')
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]");
        inputSchema = JSON.parse(raw);
      } catch {
        inputSchema = { raw: schemaMatch[1].slice(0, 500) };
      }
    }
    tools.push({ name, description, inputSchema, sourceFile });
  }

  // Also detect dangerous capability names even without full object parse
  const capabilityHints = [
    "run_command",
    "execute_command",
    "shell_exec",
    "exec_command",
    "write_file",
    "writeFile",
  ];
  for (const hint of capabilityHints) {
    if (
      content.includes(`name: "${hint}"`) ||
      content.includes(`name: '${hint}'`) ||
      content.includes(`name: \`${hint}\``)
    ) {
      if (!tools.some((t) => t.name === hint)) {
        tools.push({
          name: hint,
          description: `(detected tool name '${hint}' in ${sourceFile})`,
          sourceFile,
        });
      }
    }
  }

  return tools;
}

function extractFromPython(content: string, sourceFile: string): McpTool[] {
  if (!sourceFile.endsWith(".py")) return [];
  const tools: McpTool[] = [];
  const decoratorRe =
    /@mcp\.tool\s*(?:\([^)]*\))?\s*\n\s*(?:async\s+)?def\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = decoratorRe.exec(content)) !== null) {
    const name = m[1];
    const after = content.slice(m.index, m.index + 800);
    const doc = after.match(/"""([\s\S]*?)"""/) || after.match(/'''([\s\S]*?)'''/);
    tools.push({
      name,
      description: doc ? doc[1].trim() : "",
      sourceFile,
    });
  }
  return tools;
}

export function toolTextBlob(tools: McpTool[]): string {
  return tools.map((t) => `${t.name}\n${t.description}`).join("\n\n");
}
