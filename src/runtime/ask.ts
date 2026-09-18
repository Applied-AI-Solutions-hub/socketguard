import fs from "node:fs";
import { createInterface } from "node:readline";

/**
 * Ask yes/no on the real console TTY without touching MCP stdin/stdout.
 * Returns false if no TTY is available (safe default: deny).
 */
export async function askAllow(prompt: string): Promise<boolean> {
  const ttyPath = process.platform === "win32" ? "\\\\.\\CON" : "/dev/tty";
  let input: fs.ReadStream;
  let output: fs.WriteStream;
  try {
    input = fs.createReadStream(ttyPath);
    output = fs.createWriteStream(ttyPath);
  } catch {
    return false;
  }

  const rl = createInterface({ input, output, terminal: true });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${prompt} [y/N] `, (a) => resolve(a ?? ""));
    });
    return /^\s*y(es)?\s*$/i.test(answer);
  } finally {
    rl.close();
    input.destroy();
    output.destroy();
  }
}
