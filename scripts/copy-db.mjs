import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "..", "src", "db", "signatures.json");
const destDir = path.join(root, "..", "dist", "db");
await mkdir(destDir, { recursive: true });
await copyFile(src, path.join(destDir, "signatures.json"));
console.log("copied signatures.json -> dist/db/");
