#!/usr/bin/env node
// electron-xray <app-dir> [--json] [--out report.html]
// <app-dir> is a source checkout or an extracted app (package.json at its root). Static only: nothing is installed or run.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { analyze } from "../src/analyze.mjs";
import { reportCard } from "../src/report.mjs";

const USAGE = "usage: electron-xray <app-dir> [--json] [--out report.html]";
let args;
try { args = parseArgs({ allowPositionals: true, options: { json: { type: "boolean" }, out: { type: "string" }, help: { type: "boolean", short: "h" } } }); }
catch (e) { console.error(`${e.message}\n${USAGE}`); process.exit(2); }
const { values, positionals } = args;
if (values.help) { console.log(USAGE); process.exit(0); }
const dir = positionals[0];
if (!dir || positionals.length > 1) { console.error(USAGE); process.exit(2); }
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  const hint = dir.endsWith(".asar") ? `\nextract it first: npx @electron/asar extract ${dir} <out-dir>` : "";
  console.error(`not a directory: ${dir}${hint}`);
  process.exit(2);
}

const rep = analyze(dir);
if (values.json) {
  // no process.exit here: it can cut off a large write to a pipe
  process.stdout.write(JSON.stringify({ ...rep, grep: undefined }, null, 1) + "\n");
} else {
  const out = values.out ?? `reports/${String(rep.pkg_name || "app").replace(/[@/]/g, "_")}.html`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, reportCard(rep));
  const count = (category) => rep.facts.filter((f) => f.category === category).length;
  const electron = rep.electron ? `${rep.electron.range} ${rep.electron.supported ? "supported" : "OUT OF SUPPORT"}` : "not declared";
  console.log(`${rep.name}: electron ${electron}, unsafe prefs ${count("web-preference")} (+${rep.implicit.length} by default), telemetry ${count("telemetry") + rep.telemetry_deps.length}, risky ${count("risky-api")} -> ${out}`);
}
