// Prints the release notes for a version: its CHANGELOG section, then how to open an unsigned build.
//   node scripts/release-notes.mjs v0.6.0 > notes.md
import { readFileSync } from "node:fs";

const version = (process.argv[2] ?? "").replace(/^v/, "");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const start = changelog.search(new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b.*$`, "m"));
if (!version || start < 0) {
  console.error(`CHANGELOG.md has no "## ${version}" section`);
  process.exit(1);
}
const rest = changelog.slice(start);
const next = rest.slice(1).search(/^## /m);
const section = (next < 0 ? rest : rest.slice(0, next + 1)).replace(/^## .*\n/, "").trim();

console.log(`${section}

---

**Download:** \`nudge_${version}_universal.dmg\` below runs on Apple silicon and Intel Macs.

**Opening it the first time:** this beta isn't signed or notarized by Apple, so macOS will warn you. Drag nudge into Applications and open it. If macOS blocks it, go to System Settings → Privacy & Security and choose **Open Anyway**. You can check the download against \`SHA256SUMS.txt\`.`);
