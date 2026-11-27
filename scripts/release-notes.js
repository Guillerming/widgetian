// Prints the CHANGELOG.md section of a version (package.json's by default), for the GitHub release:
//   gh release create v0.2.1 … --notes "$(npm run -s release-notes)"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2] ?? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const lines = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8").split("\n");

const start = lines.findIndex((line) => line.startsWith(`## ${version} `) || line === `## ${version}`);
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}
const length = lines.slice(start + 1).findIndex((line) => line.startsWith("## "));
const section = lines.slice(start + 1, length === -1 ? undefined : start + 1 + length);
process.stdout.write(`${section.join("\n").trim()}\n`);
