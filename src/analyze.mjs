// One Electron app directory (source checkout or extracted app.asar) in, one report object out.
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runRea, REA_VERSION } from "./rea.mjs";
import { extractFacts } from "./facts.mjs";
import { electronFacts, vendorOf, TELEMETRY_DEPS } from "./electron.mjs";
import { grepFacts } from "./grep.mjs";
import { readmeClaims, hostDocumented } from "./readme.mjs";
import { hostsInStrings } from "./strings.mjs";
import { jsFiles } from "./files.mjs";

const TIMES = fileURLToPath(new URL("../data/electron-time.json", import.meta.url));
// Categories scored against the fixtures' truth file and compared with grep.
export const SCORED = ["web-preference", "network", "telemetry", "electron-version", "risky-api"];

export function analyze(root, { cache } = {}) {
  const files = jsFiles(root);
  const fileSet = new Set(files);
  const ev = runRea(root, { cache });
  const claims = readmeClaims(root);
  const pkg = claims.pkg;
  const generic = extractFacts(ev, root).filter((f) => fileSet.has(f.file));
  const el = electronFacts(ev, root, pkg, TIMES);
  const strHosts = hostsInStrings(root, files).filter((h) => h.host);

  const facts = [...el.facts];
  const telemetry = [];
  for (const f of generic) {
    if (f.category === "network") {
      // vendor hosts are listed under telemetry, everything else under network
      const v = vendorOf(f.value);
      if (v) telemetry.push({ category: "telemetry", file: f.file, line: f.line, value: `${v} (${f.value})`, layer: f.layer });
      else facts.push({ ...f, documented: hostDocumented(f.value, claims) });
    } else if (["process", "dynamic-code", "file-write"].includes(f.category)) facts.push({ ...f, extra: true });
  }
  // vendor hosts in code strings (e.g. a Sentry DSN), unless a call site on that line already named one
  for (const h of strHosts) {
    const v = vendorOf(h.host);
    if (v && !telemetry.some((t) => t.file === h.file && t.line === h.line)) telemetry.push({ category: "telemetry", file: h.file, line: h.line, value: `${v} (${h.host})`, layer: "string" });
  }
  facts.push(...telemetry);

  const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) });
  const named = new Map();
  for (const h of strHosts) {
    if (!named.has(h.host)) named.set(h.host, { host: h.host, where: `${h.file}:${h.line}`, count: 0, documented: hostDocumented(h.host, claims), vendor: vendorOf(h.host) });
    named.get(h.host).count++;
  }
  const coverage = ev.normalized_result.semantic_graph.coverage;
  return {
    name: pkg.productName || pkg.name || basename(resolve(root)), pkg_name: pkg.name, version: pkg.version || null, description: pkg.description || "", license: pkg.license || null,
    analysed_at: new Date().toISOString(), rea_version: REA_VERSION, js_files: files.length, rea_ms: ev.__ms,
    coverage: { status: coverage?.status, truncated: !!coverage?.truncated },
    electron: el.version, windows: el.windows, rea_summary: el.summary, implicit: el.implicit,
    deps, dev_deps: Object.keys(pkg.devDependencies || {}).length, telemetry_deps: deps.filter((d) => TELEMETRY_DEPS.test(d)),
    facts, grep: grepFacts(root, files), hosts_in_strings: [...named.values()].sort((a, b) => b.count - a.count),
  };
}

// Overlap with the grep baseline, by category + file + line, in the scored categories.
export function compare(rep, cats = SCORED) {
  const key = (f) => `${f.category}|${f.file}|${f.line}`;
  const ours = new Set(rep.facts.filter((f) => cats.includes(f.category)).map(key));
  const grep = rep.grep.filter((f) => cats.includes(f.category));
  const grepKeys = new Set(grep.map(key));
  const onlyGrep = grep.filter((f) => !ours.has(key(f)));
  return {
    both: [...ours].filter((k) => grepKeys.has(k)).length,
    only_rea: [...ours].filter((k) => !grepKeys.has(k)).length,
    only_grep: new Set(onlyGrep.map(key)).size,
    only_grep_in_comments: new Set(onlyGrep.filter((f) => f.comment).map(key)).size,
    // grep-only locations that are not comments, by category
    only_grep_by_category: [...new Set(onlyGrep.filter((f) => !f.comment).map(key))].reduce((acc, k) => {
      const c = k.split("|")[0]; acc[c] = (acc[c] || 0) + 1; return acc; }, {}),
  };
}
