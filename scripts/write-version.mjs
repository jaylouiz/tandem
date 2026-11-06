// Build stamp: which commit `dist/` was built from (read by the server for the "Update pending" check).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

let commit = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  // no git (tarball): the check stays off
}
mkdirSync("dist", { recursive: true });
writeFileSync("dist/version.json", JSON.stringify({ commit }) + "\n");
