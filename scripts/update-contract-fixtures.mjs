// Vendors agent-workflow's golden fixtures (docs/contract.md "Golden fixtures") into src/core/contract-fixtures/ at one
// pinned revision, and writes PIN.json (the revision and a SHA-256 per file) next to them. The tests read only these
// copies (src/core/contract-v1.test.ts), never the network or a local agent-workflow checkout.
//
//   npm run contract:update -- <revision>     a commit SHA or tag of jaylouiz/agent-workflow, never a branch
//
// Needs `gh auth login`. After a run: `npm test`, and when the contract version changed, CONTRACT_VERSION in
// src/core/contract.ts together with the readers and writers the new version touches.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "jaylouiz/agent-workflow";
const SOURCE = "docs/contract-fixtures";
const TARGET = "src/core/contract-fixtures";

const rev = process.argv[2];
if (!rev) {
  console.error("usage: npm run contract:update -- <revision>   (a commit SHA or tag of jaylouiz/agent-workflow)");
  process.exit(64);
}

const gh = (args, encoding) => execFileSync("gh", ["api", ...args], { encoding, maxBuffer: 16 * 1024 * 1024 });
const revision = gh([`repos/${REPO}/commits/${encodeURIComponent(rev)}`, "--jq", ".sha"], "utf8").trim();
const names = JSON.parse(gh([`repos/${REPO}/contents/${SOURCE}?ref=${revision}`, "--jq", "[.[] | select(.type == \"file\") | .name]"], "utf8")).sort();
if (!names.includes("manifest.json")) throw new Error(`${SOURCE} at ${revision} has no manifest.json`);

mkdirSync(TARGET, { recursive: true });
for (const old of readdirSync(TARGET)) rmSync(join(TARGET, old));

const files = {};
let contract = null;
for (const name of names) {
  const bytes = gh(["-H", "Accept: application/vnd.github.raw", `repos/${REPO}/contents/${SOURCE}/${name}?ref=${revision}`]);
  writeFileSync(join(TARGET, name), bytes);
  files[name] = createHash("sha256").update(bytes).digest("hex");
  if (name === "manifest.json") contract = JSON.parse(bytes.toString("utf8")).contract;
}
writeFileSync(join(TARGET, "PIN.json"), JSON.stringify({ repo: REPO, path: SOURCE, revision, contract, files }, null, 2) + "\n");
console.log(`${names.length} fixtures from ${REPO}@${revision.slice(0, 7)} (contract ${contract}) -> ${TARGET}`);
