import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(root, "..", "dist", "cli.js");
const echo = path.join(root, "..", "fixtures", "echo-upstream.js");

function runOnce(policy, callArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "wrap", "--policy", policy, "--quiet", "--", process.execPath, echo],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.stderr.on("data", (b) => {
      err += b.toString();
    });
    const msg = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "echo", arguments: callArgs },
    };
    child.stdin.write(`${JSON.stringify(msg)}\n`);
    child.stdin.end();
    child.on("close", () => resolve({ out, err }));
    child.on("error", reject);
    setTimeout(() => {
      child.kill();
      resolve({ out, err });
    }, 2000);
  });
}

const blocked = await runOnce("balanced", {
  token: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
});
const allowed = await runOnce("balanced", { city: "Paris" });

const blockOk = blocked.out.includes("Socketguard blocked") || blocked.out.includes("-32000");
const allowOk = allowed.out.includes("Paris") && !allowed.out.includes("-32000");

console.log("block secrets:", blockOk ? "PASS" : "FAIL", blocked.out.slice(0, 200));
console.log("allow benign:", allowOk ? "PASS" : "FAIL", allowed.out.slice(0, 200));

if (!blockOk || !allowOk) process.exit(1);
console.log("smoke-wrap: ok");
