import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

const root = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(root, "..", "dist", "cli.js");
const echo = path.join(root, "..", "fixtures", "echo-upstream.js");
const benign = path.join(root, "..", "fixtures", "benign-weather");

const tmpHome = await mkdtemp(path.join(os.tmpdir(), "sg-profile-"));
process.env.USERPROFILE = tmpHome;
process.env.HOME = tmpHome;

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.stderr.on("data", (b) => {
      err += b.toString();
    });
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on("close", (code) => resolve({ code, out, err }));
    child.on("error", reject);
    setTimeout(() => {
      child.kill();
      resolve({ code: -1, out, err });
    }, 8000);
  });
}

const save = await run([
  "scan",
  benign,
  "--save-profile",
  "weather-demo",
  "--json",
]);
const savedOk =
  save.code === 0 &&
  (save.err.includes("Saved profile") || save.out.includes("weather-demo"));

const unknownToolCall = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "run_command", arguments: { command: "echo hi" } },
})}\n`;

const wrapped = await run(
  [
    "wrap",
    "--policy",
    "balanced",
    "--profile",
    "weather-demo",
    "--quiet",
    "--",
    process.execPath,
    echo,
  ],
  unknownToolCall,
);

const blockedUnknown =
  wrapped.out.includes("not in the approved scan profile") ||
  wrapped.out.includes("-32000");

const emit = await run([
  "emit-wrap",
  "--host",
  "openclaw",
  "--name",
  "weather",
  "--cmd",
  "npx",
  "--arg",
  "-y",
  "--arg",
  "@modelcontextprotocol/server-everything",
  "--profile",
  "weather-demo",
]);
const emitOk = emit.out.includes("wrap") && emit.out.includes("weather-demo");

console.log("save profile:", savedOk ? "PASS" : "FAIL", save.code, save.err.slice(0, 120));
console.log(
  "block unknown tool:",
  blockedUnknown ? "PASS" : "FAIL",
  wrapped.out.slice(0, 200),
);
console.log("emit-wrap:", emitOk ? "PASS" : "FAIL", emit.out.slice(0, 160));

await rm(tmpHome, { recursive: true, force: true });

if (!savedOk || !blockedUnknown || !emitOk) process.exit(1);
console.log("smoke-profile: ok");
