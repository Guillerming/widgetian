// Builds the installers for both kinds of Mac: Apple Silicon (arm64) and Intel (x64).
//
// koffi ships one native package per architecture and npm only installs the one of this Mac, so
// the missing one is fetched first: the exact version in package-lock.json, checked against its hash.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHITECTURES = ["arm64", "x64"];
// Unpacked apps electron-builder leaves behind. macOS could open one of them at login instead of
// the installed app (same bundle id), so they are removed.
const LEFTOVERS = ["mac", "mac-arm64"];

const run = (command, args, options = {}) => execFileSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const isInstalled = (directory, version) => {
  const manifest = path.join(directory, "package.json");
  return fs.existsSync(manifest) && readJson(manifest).version === version;
};

const fetchPackage = (name, { version, integrity }, directory) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "widgetian-dist-"));
  try {
    const output = run("npm", ["pack", `${name}@${version}`, "--json", "--pack-destination", temporary], {
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
    });
    const [packed] = JSON.parse(output);
    if (packed.integrity !== integrity) throw new Error(`${name}@${version} does not match package-lock.json`);
    fs.mkdirSync(directory, { recursive: true });
    run("tar", ["-xzf", path.join(temporary, packed.filename), "--strip-components", "1", "-C", directory]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

const ensureNativePackages = () => {
  const lock = readJson(path.join(ROOT, "package-lock.json"));
  for (const arch of ARCHITECTURES) {
    const name = `@koromix/koffi-darwin-${arch}`;
    const locked = lock.packages[`node_modules/${name}`];
    if (!locked) throw new Error(`${name} is not in package-lock.json: run npm install`);
    const directory = path.join(ROOT, "node_modules", name);
    if (isInstalled(directory, locked.version)) continue;
    console.log(`Fetching ${name}@${locked.version}`);
    fetchPackage(name, locked, directory);
  }
};

ensureNativePackages();
run("npx", ["electron-builder", "--mac", ...ARCHITECTURES.map((arch) => `--${arch}`)]);
for (const name of LEFTOVERS) fs.rmSync(path.join(ROOT, "dist", name), { recursive: true, force: true });
