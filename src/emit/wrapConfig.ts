import path from "node:path";
import { fileURLToPath } from "node:url";

export type EmitHost = "openclaw" | "hermes";

export interface EmitWrapInput {
  host: EmitHost;
  serverName: string;
  upstreamCommand: string;
  upstreamArgs: string[];
  policy: string;
  profile?: string;
  ask?: boolean;
  /** Absolute path to socketguard cli.js; default: this package dist/cli.js */
  socketguardCli?: string;
}

export function defaultSocketguardCli(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/emit -> dist/cli.js
  return path.resolve(here, "..", "cli.js");
}

export function buildWrapArgv(input: EmitWrapInput): string[] {
  const cli = input.socketguardCli ?? defaultSocketguardCli();
  const args = [cli, "wrap", "--policy", input.policy];
  if (input.profile) {
    args.push("--profile", input.profile);
  }
  if (input.ask) {
    args.push("--ask");
  }
  args.push("--", input.upstreamCommand, ...input.upstreamArgs);
  return args;
}

export function emitOpenclawSnippet(input: EmitWrapInput): string {
  const wrapArgs = buildWrapArgv(input);
  // OpenClaw: command + args under mcp.servers.<name>
  const block = {
    mcp: {
      servers: {
        [input.serverName]: {
          command: process.execPath,
          args: wrapArgs,
        },
      },
    },
  };
  return JSON.stringify(block, null, 2);
}

export function emitHermesSnippet(input: EmitWrapInput): string {
  const wrapArgs = buildWrapArgv(input);
  const argsYaml = wrapArgs
    .map((a) => `      - ${JSON.stringify(a)}`)
    .join("\n");
  return `mcp_servers:
  ${input.serverName}:
    command: ${JSON.stringify(process.execPath)}
    args:
${argsYaml}
`;
}
