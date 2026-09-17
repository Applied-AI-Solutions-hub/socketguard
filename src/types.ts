export type Verdict = "safe" | "caution" | "do_not_install";

export type FindingSeverity = "info" | "caution" | "critical";

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
  sourceFile?: string;
}

export interface PackageMeta {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  publishedAt?: string;
  repositoryUrl?: string;
}

export interface IngestedTarget {
  kind: "local" | "github" | "npm";
  origin: string;
  rootDir: string;
  packageMeta?: PackageMeta;
  files: Map<string, string>;
  tools: McpTool[];
}

export interface ScanResult {
  target: string;
  kind: IngestedTarget["kind"];
  verdict: Verdict;
  label: string;
  reasons: string[];
  findings: Finding[];
  packageName?: string;
  toolCount: number;
}

export interface SignatureEntry {
  id: string;
  severity: FindingSeverity;
  reason: string;
  match: {
    npmNames?: string[];
    repoUrls?: string[];
    contentSubstrings?: string[];
  };
}
