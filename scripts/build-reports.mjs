// Builds reports/ (fixture + real-target cards, index.html with the measured tables), results/measured.json, and the
// fixture results that scripts/score-fixtures.mjs also writes. Real targets come from scripts/fetch-targets.mjs.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, compare, SCORED } from "../src/analyze.mjs";
import { reportCard, CSS } from "../src/report.mjs";
import { scoreFixtures } from "../src/fixtures.mjs";
import { REA_VERSION } from "../src/rea.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const targets = JSON.parse(readFileSync("targets.json", "utf8"));
const missing = targets.filter((t) => !existsSync(`targets/${t.id}/src`)).map((t) => t.id);
if (missing.length) { console.error(`missing target checkouts (${missing.join(", ")}): run node scripts/fetch-targets.mjs first`); process.exit(1); }
mkdirSync("reports", { recursive: true }); mkdirSync("results/targets", { recursive: true });
const S = (fs) => fs.filter((f) => SCORED.includes(f.category));
const fx = {};
for (const [twin, { rep, behaviours, scores }] of Object.entries(scoreFixtures())) {
  const planted = new Map();
  for (const b of behaviours.filter((b) => b.planted)) for (const l of b.lines) {
    planted.set(`${b.category}|${b.file}|${l}|${b.value.split(" (")[0].split(":")[0]}`, b.id);
    if (!planted.has(`${b.category}|${b.file}|${l}`)) planted.set(`${b.category}|${b.file}|${l}`, b.id);
  }
  writeFileSync(`reports/fixture-${twin}.html`, reportCard(rep, { fixture: true, planted }));
  writeFileSync(`results/${twin}.json`, JSON.stringify(rep, null, 1) + "\n");
  fx[twin] = scores;
}
writeFileSync("results/fixture-scores.json", JSON.stringify(fx, null, 1) + "\n");
const real = [];
for (const t of targets) {
  const root = `targets/${t.id}/src`;
  const rep = analyze(root, { cache: `targets/${t.id}/rea.json` });
  rep.repo = t.repo;
  rep.commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"]).toString().trim();
  rep.commit_date = execFileSync("git", ["-C", root, "log", "-1", "--format=%cs"]).toString().trim();
  writeFileSync(`reports/${t.id}.html`, reportCard(rep));
  writeFileSync(`results/targets/${t.id}.json`, JSON.stringify(rep, null, 1) + "\n");
  const hosts = new Set(rep.facts.filter((f) => f.category === "network" && !String(f.value).startsWith("(")).map((f) => f.value));
  real.push({ id: t.id, repo: t.repo, commit: rep.commit.slice(0, 7), commit_date: rep.commit_date, license: rep.license, files: rep.js_files, rea_s: +(rep.rea_ms / 1000).toFixed(1), coverage: rep.coverage.status + (rep.coverage.truncated ? "*" : ""),
    electron: rep.electron ? `${rep.electron.range} (${rep.electron.supported ? "supported" : rep.electron.majors_behind + " majors behind"})` : "?",
    windows: rep.windows.length, windows_prefs_resolved: rep.windows.filter((w) => w.status === "object-literal").length,
    unsafe_prefs: S(rep.facts).filter((f) => f.category === "web-preference").map((f) => f.value), unsafe_by_default: rep.implicit.map((f) => f.value),
    telemetry: [...new Set(rep.facts.filter((f) => f.category === "telemetry").map((f) => f.value)), ...rep.telemetry_deps], hosts: [...hosts], hosts_not_in_readme: [...hosts].filter((h) => !rep.facts.find((f) => f.value === h).documented),
    risky: rep.facts.filter((f) => f.category === "risky-api").length, ipc_handlers: rep.rea_summary.ipc?.main_handlers ?? 0, deps: rep.deps.length, ...compare(rep) });
}
const sum = (k) => real.reduce((a, r) => a + r[k], 0);
const only_grep_by_category = {};
for (const r of real) for (const [c, n] of Object.entries(r.only_grep_by_category)) only_grep_by_category[c] = (only_grep_by_category[c] || 0) + n;
const totals = { apps: real.length, both: sum("both"), only_rea: sum("only_rea"), only_grep: sum("only_grep"), only_grep_in_comments: sum("only_grep_in_comments"), only_grep_by_category,
  unsafe_by_default: real.reduce((a, r) => a + r.unsafe_by_default.length, 0) };
writeFileSync("results/measured.json", JSON.stringify({ measured_at: new Date().toISOString().slice(0, 10), rea_version: REA_VERSION, fixtures: fx, real, totals }, null, 1) + "\n");
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const fxRow = (name, s) => `<tr><td>${name}</td><td class="big">${s.planted_found} / ${s.planted_total}</td><td class="big">${s.false_positives}</td></tr>`;
writeFileSync("reports/index.html", `<!doctype html><html><head><meta charset="utf-8"><title>electron-xray: measured</title><style>${CSS}</style></head><body><div class="wrap">
<div class="top"><h1>electron-xray</h1><span class="ver">privacy and security report for a desktop app</span></div>
<p class="desc">What IT asks before approving an Electron app: unsafe window settings, telemetry, endpoints, Electron age, risky calls. Built on REA; static only.</p>
<div class="grid" style="grid-template-columns:1fr 1.3fr">
<div class="card" id="fixture"><h2><span class="tag">OUR TEST FIXTURE</span> &nbsp;${fx["electron-planted"].tool.planted_total} planted, frozen before the first run</h2>
<table><tr><th>planted twin</th><th>planted found</th><th>false positives</th></tr>${fxRow("electron-xray", fx["electron-planted"].tool)}${fxRow("REA facts alone", fx["electron-planted"].rea_only)}${fxRow("plain grep", fx["electron-planted"].grep)}</table>
<table style="margin-top:12px"><tr><th>clean twin</th><th>false positives</th></tr><tr><td>electron-xray</td><td class="big">${fx["electron-clean"].tool.false_positives}</td></tr><tr><td>plain grep</td><td class="big">${fx["electron-clean"].grep.false_positives}</td></tr></table>
<div class="foot">electron-xray false positives: ${fx["electron-planted"].tool.false_positives + fx["electron-clean"].tool.false_positives}. grep's: comments, a help string, and a current Electron version it cannot date.</div></div>
<div class="card" id="real"><h2>${real.length} open-source Electron apps (source, permissive licences)</h2>
<table><tr><th>app</th><th>electron</th><th>unsafe set</th><th>unsafe by default</th><th>telemetry</th><th>hosts</th></tr>
${real.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.electron)}</td><td>${r.unsafe_prefs.length}</td><td>${r.unsafe_by_default.length}</td><td>${r.telemetry.length}</td><td>${r.hosts.length}</td></tr>`).join("")}</table>
<div class="foot">Unsafe settings are often deliberate in local-only apps; this lists them, it does not judge them.</div></div></div>
<div class="card" style="margin-top:16px" id="vs"><h2>REA vs grep on the same files (${real.length} apps, scored categories, by location)</h2>
<table><tr><th>found by both</th><th>only REA layer</th><th>only grep</th><th>… in comments</th><th>unsafe-by-default (grep cannot see)</th></tr>
<tr><td class="big">${totals.both}</td><td class="big">${totals.only_rea}</td><td class="big">${totals.only_grep}</td><td>${totals.only_grep_in_comments}</td><td class="big">${totals.unsafe_by_default}</td></tr></table>
<div class="foot">See README for what each side found that the other missed.</div></div>
</div></body></html>`);
console.log(JSON.stringify({ fx: Object.fromEntries(Object.entries(fx).map(([k, v]) => [k, { tool: [v.tool.planted_found, v.tool.planted_total, v.tool.false_positives], rea_only: [v.rea_only.planted_found, v.rea_only.false_positives], grep: [v.grep.planted_found, v.grep.false_positives] }])), totals }));
for (const r of real) console.log(JSON.stringify(r));
