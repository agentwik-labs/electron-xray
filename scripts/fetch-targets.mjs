// Fetches each target's source at the commit pinned in targets.json into targets/<id>/src: one shallow fetch, no
// submodules, hooks disabled, nothing installed or run.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
for (const t of JSON.parse(readFileSync("targets.json", "utf8"))) {
  const dir = `targets/${t.id}/src`;
  if (existsSync(dir)) {
    const head = git("-C", dir, "rev-parse", "HEAD");
    console.log(head === t.commit ? `have ${t.id} ${head.slice(0, 7)}` : `have ${t.id} at ${head.slice(0, 7)}, not the pinned ${t.commit.slice(0, 7)}: delete ${dir} to refetch`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  git("-C", dir, "init", "-q");
  git("-C", dir, "fetch", "-q", "--depth", "1", "--no-recurse-submodules", t.repo, t.commit);
  git("-C", dir, "checkout", "-q", "FETCH_HEAD");
  console.log("got", t.id, git("-C", dir, "rev-parse", "--short", "HEAD"));
}
