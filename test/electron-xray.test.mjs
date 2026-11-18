import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, SCORED } from "../src/analyze.mjs";
import { score } from "../src/score.mjs";
import { fixtureDir } from "../src/fixtures.mjs";
import { defaultOf, vendorOf } from "../src/electron.mjs";
import { reportCard } from "../src/report.mjs";
const truth = JSON.parse(readFileSync(new URL("../fixtures/truth.json", import.meta.url)));
const S = (fs) => fs.filter((f) => SCORED.includes(f.category));
const planted = analyze(fixtureDir("electron-planted"));
const clean = analyze(fixtureDir("electron-clean"));

test("planted twin: all 12 planted items and both real behaviours found, zero false positives", () => {
  const s = score(S(planted.facts), truth["electron-planted"].behaviours);
  assert.equal(s.planted_found, 12, s.missed.join(","));
  assert.equal(s.real_found, 2, s.missed.join(","));
  assert.equal(s.false_positives, 0, s.fp_detail.join("; "));
});
test("clean twin: declared update host found, zero false positives; grep is fooled by comments", () => {
  const s = score(S(clean.facts), truth["electron-clean"].behaviours);
  assert.equal(s.real_found, 1);
  assert.equal(s.false_positives, 0, s.fp_detail.join("; "));
  assert.ok(score(S(clean.grep), truth["electron-clean"].behaviours).false_positives >= 3);
});
test("Electron version support and insecure defaults", () => {
  assert.equal(planted.electron.major, 13);
  assert.equal(planted.electron.supported, false);
  assert.equal(clean.electron.supported, true);
  assert.equal(defaultOf("sandbox", 13), false);
  assert.equal(defaultOf("sandbox", 20), true);
  assert.equal(defaultOf("contextIsolation", 11), false);
  assert.ok(planted.implicit.some((f) => f.value.startsWith("sandbox: false")));
  assert.equal(clean.implicit.length, 0);
});
test("telemetry: vendor hosts and SDK dependency", () => {
  assert.equal(vendorOf("o12345.ingest.sentry.io"), "Sentry");
  assert.equal(vendorOf("www.google-analytics.com"), "Google Analytics");
  assert.equal(vendorOf("updates.quicknotes-example.test"), null);
  assert.deepEqual(planted.telemetry_deps, ["@sentry/electron"]);
});
test("openExternal on an IPC-supplied URL is tied to its IPC channel", () => {
  const r = planted.facts.find((f) => f.category === "risky-api");
  assert.match(r.value, /inside IPC handler "open"/);
});
test("analysis never executes target code", () => {
  const dir = mkdtempSync(join(tmpdir(), "elx-"));
  const marker = join(dir, "EXECUTED");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "trap", main: "main.js", devDependencies: { electron: "^30.0.0" } }));
  writeFileSync(join(dir, "main.js"), `require("fs").writeFileSync(${JSON.stringify(marker)}, "x");\nconst { BrowserWindow } = require("electron");\nnew BrowserWindow({ webPreferences: { nodeIntegration: true } });\n`);
  const rep = analyze(dir);
  assert.equal(existsSync(marker), false);
  assert.ok(rep.facts.some((f) => f.value === "nodeIntegration: true"));
});
test("report card labels fixtures only when asked", () => {
  assert.match(reportCard(planted, { fixture: true }), /OUR TEST FIXTURE/);
  assert.doesNotMatch(reportCard(clean), /class="tag"/);
});
