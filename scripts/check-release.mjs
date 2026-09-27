import { readFileSync } from "node:fs";

const tag = process.argv[2];
const app = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url)));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const cargo = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!cargoVersion || pkg.version !== app.version || pkg.version !== cargoVersion) {
  console.error(`Version mismatch: package=${pkg.version}, Tauri=${app.version}, Cargo=${cargoVersion}`);
  process.exit(1);
}
if (tag && tag !== `v${pkg.version}`) {
  console.error(`Tag ${tag} does not match app version v${pkg.version}`);
  process.exit(1);
}
console.log(`Release versions agree: v${pkg.version}`);
