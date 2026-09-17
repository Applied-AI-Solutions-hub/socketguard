import type { ScanResult, Verdict } from "../types.js";

export type AgentHost = "hermes" | "openclaw";

export interface ConfiguredServer {
  host: AgentHost;
  name: string;
  enabled: boolean;
  /** How the host launches/connects the server */
  transport: "stdio" | "http" | "sse" | "unknown";
  command?: string;
  args?: string[];
  url?: string;
  raw: Record<string, unknown>;
}

export type ResolveKind =
  | { kind: "scan"; target: string }
  | { kind: "skip"; reason: string }
  | { kind: "remote"; url: string; reason: string };

export interface ConfigServerResult {
  host: AgentHost;
  name: string;
  enabled: boolean;
  transport: ConfiguredServer["transport"];
  resolved?: string;
  result?: ScanResult;
  error?: string;
  note?: string;
}

export interface ConfigScanSummary {
  hosts: AgentHost[];
  configPaths: string[];
  servers: ConfigServerResult[];
  worstVerdict: Verdict | "error" | "empty";
}
