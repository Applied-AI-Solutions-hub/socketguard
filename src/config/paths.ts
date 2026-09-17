import os from "node:os";
import path from "node:path";

export function hermesConfigPath(home = os.homedir()): string {
  return path.join(home, ".hermes", "config.yaml");
}

export function openclawConfigPath(home = os.homedir()): string {
  return path.join(home, ".openclaw", "openclaw.json");
}
