// The baseline: what a reviewer gets from grep over the same files (plus package.json), line by line.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hostOf } from "./facts.mjs";
import { BAD, vendorOf } from "./electron.mjs";
const PREF_RES = Object.entries(BAD).map(([k, v]) => [k, v, new RegExp(`\\b${k}\\s*:\\s*${v}\\b`)]);
export function grepFacts(root, files) {
  const out = [];
  for (const file of [...files, "package.json"]) {
    let text; try { text = readFileSync(join(root, file), "utf8"); } catch { continue; }
    text.split("\n").forEach((line, i) => {
      const comment = /^\s*(\/\/|\/\*|\*)/.test(line);
      const add = (category, value) => out.push({ category, file, line: i + 1, value, comment, layer: "grep" });
      for (const [k, v, re] of PREF_RES) if (re.test(line)) add("web-preference", `${k}: ${v}`);
      const hosts = new Set([...line.matchAll(/https?:\/\/[A-Za-z0-9@.-]+/g)].map((m) => hostOf(m[0].replace(/\/\/[^@/]*@/, "//"))).filter(Boolean));
      for (const h of hosts) { const v = vendorOf(h); if (v) add("telemetry", v); else add("network", h); }
      if (/\b(net\.request|fetch|https?\.(request|get)|axios)\s*\(/.test(line) && !hosts.size) add("network", "(call)");
      if (file === "package.json" && /"electron"\s*:/.test(line)) add("electron-version", line.trim());
      if (/openExternal\s*\(/.test(line)) add("risky-api", "openExternal");
    });
  }
  return out;
}
