// Unit tests for the pure pieces: scoring, host parsing, README matching, file listing, grep baseline, string hosts,
// const webPreferences resolution, Electron defaults and support window, the report card, and the CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "../src/score.mjs";
import { hostOf } from "../src/facts.mjs";
import { readmeClaims, hostDocumented } from "../src/readme.mjs";
import { jsFiles } from "../src/files.mjs";
import { grepFacts } from "../src/grep.mjs";
import { hostsInStrings } from "../src/strings.mjs";
import { compare } from "../src/analyze.mjs";
import { constObjectPrefs, defaultOf, electronVersion, vendorOf } from "../src/electron.mjs";
import { reportCard } from "../src/report.mjs";
import { fixtureDir } from "../src/fixtures.mjs";

const tmp = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "elx-unit-"));
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(dir, name, ".."), { recursive: true }); writeFileSync(join(dir, name), text); }
  return dir;
};

test("score: line match, value disambiguation on a shared line, false positives counted once per location", () => {
  const truth = [
    { id: "A", planted: true, category: "web-preference", file: "m.js", lines: [5], value: "sandbox: false" },
    { id: "B", planted: true, category: "web-preference", file: "m.js", lines: [5], value: "webviewTag: true" },
    { id: "C", category: "network", file: "m.js", lines: [9], value: "x.test" },
  ];
  const s = score([
    { category: "web-preference", file: "m.js", line: 5, value: "webviewTag: true" },
    { category: "web-preference", file: "m.js", line: 5, value: "sandbox: false" },
    { category: "network", file: "m.js", line: 12, value: "y.test" },
    { category: "network", file: "m.js", line: 12, value: "y.test" },
    { category: "telemetry", file: "m.js", line: 9, value: "Sentry" },
  ], truth);
  assert.deepEqual(s.found, ["A", "B"]);
  assert.deepEqual(s.missed, ["C"]);
  assert.equal(s.planted_found, 2);
  assert.equal(s.real_found, 0);
  assert.equal(s.false_positives, 2, s.fp_detail.join("; "));
});

test("hostOf: URLs, credentials, bare domains, and non-hosts", () => {
  assert.equal(hostOf("https://user:pw@O1.Ingest.Sentry.io/42"), "o1.ingest.sentry.io");
  assert.equal(hostOf("wss://chat.example.com:8443/socket"), "chat.example.com");
  assert.equal(hostOf("updates.example.io"), "updates.example.io");
  assert.equal(hostOf("index.html"), null);
  assert.equal(hostOf("file:///etc/passwd"), null);
  assert.equal(hostOf(null), null);
});

test("vendorOf: subdomains match, lookalikes do not", () => {
  assert.equal(vendorOf("api.mixpanel.com"), "Mixpanel");
  assert.equal(vendorOf("notsentry.io"), null);
  assert.equal(vendorOf("sentry.io.evil.test"), null);
});

test("README matching: exact host, parent domain, localhost; unrelated host is undocumented", () => {
  const dir = tmp({ "README.md": "Updates come from https://updates.acme-example.com.\nSee docs.md", "package.json": JSON.stringify({ name: "a" }) });
  const claims = readmeClaims(dir);
  assert.equal(claims.readme, "README.md");
  assert.equal(hostDocumented("updates.acme-example.com", claims), true);
  assert.equal(hostDocumented("cdn.acme-example.com", claims), true);
  assert.equal(hostDocumented("localhost", claims), true);
  assert.equal(hostDocumented("t.tracker-example.net", claims), false);
  assert.equal(hostDocumented("(host not static)", claims), false);
  assert.equal(claims.hosts.has("docs.md"), false);
  const pages = readmeClaims(tmp({ "README.md": "Docs: https://alice.github.io/app and https://shop.example.co.uk" }));
  assert.equal(hostDocumented("alice.github.io", pages), true);
  assert.equal(hostDocumented("mallory.github.io", pages), false);
  assert.equal(hostDocumented("other.co.uk", pages), false);
  assert.equal(hostDocumented("api.example.co.uk", pages), true);
});

test("jsFiles: skips node_modules, .git, tests and type declarations", () => {
  const dir = tmp({
    "main.js": "", "src/a.ts": "", "src/b.d.ts": "", "src/c.test.js": "", "test/d.js": "",
    "node_modules/x/index.js": "", ".git/hooks/e.js": "", "README.md": "",
  });
  assert.deepEqual(jsFiles(dir), ["main.js", "src/a.ts"]);
});

test("grep baseline: flags settings, vendor hosts and calls line by line, marks comments", () => {
  const dir = tmp({
    "main.js": '// nodeIntegration: true\nnew BrowserWindow({ webPreferences: { sandbox: false } });\nfetch("https://www.google-analytics.com/x");\nshell.openExternal(u);\n',
    "package.json": '{\n  "devDependencies": {\n    "electron": "^30.0.0"\n  }\n}\n',
  });
  const g = grepFacts(dir, ["main.js"]);
  const at = (line, category) => g.find((f) => f.file === "main.js" && f.line === line && f.category === category);
  assert.equal(at(1, "web-preference").comment, true);
  assert.equal(at(2, "web-preference").value, "sandbox: false");
  assert.equal(at(3, "telemetry").value, "Google Analytics");
  assert.ok(at(4, "risky-api"));
  assert.ok(g.some((f) => f.file === "package.json" && f.line === 3 && f.category === "electron-version"));
});

test("hostsInStrings: string and template literals count, comments do not", () => {
  const dir = tmp({ "a.js": '// https://comment.example.com\nconst u = "https://api.example.com/v1";\nconst t = `https://tpl.example.com/${x}`;\n' });
  assert.deepEqual(hostsInStrings(dir, ["a.js"]).map((h) => `${h.host}:${h.line}`), ["api.example.com:2", "tpl.example.com:3"]);
});

test("constObjectPrefs: resolves a shared const across lines, ignores non-boolean and other objects", () => {
  const src = 'const OTHER = { sandbox: true };\nconst PREFS = {\n  sandbox: false,\n  "webviewTag": true,\n  preload: p,\n  nested: { nodeIntegration: true },\n};\n';
  assert.deepEqual(constObjectPrefs(src, "PREFS"), [{ name: "sandbox", value: false, line: 3 }, { name: "webviewTag", value: true, line: 4 }]);
  assert.equal(constObjectPrefs(src, "MISSING"), null);
  assert.equal(constObjectPrefs("const A = makePrefs();", "A"), null);
});

test("defaultOf: Electron defaults by major, sandbox off when nodeIntegration is on", () => {
  assert.equal(defaultOf("nodeIntegration", 4), true);
  assert.equal(defaultOf("nodeIntegration", 5), false);
  assert.equal(defaultOf("contextIsolation", 11), false);
  assert.equal(defaultOf("contextIsolation", 12), true);
  assert.equal(defaultOf("sandbox", 19), false);
  assert.equal(defaultOf("sandbox", 20), true);
  assert.equal(defaultOf("sandbox", 29, { nodeIntegration: true }), false);
  assert.equal(defaultOf("experimentalFeatures", 30), undefined);
});

test("electronVersion: latest three majors supported, relative to the snapshot", () => {
  const dir = tmp({ "t.json": JSON.stringify({ modified: "2026-01-02T00:00:00Z", "40.0.0": "2025-01-01T00:00:00Z", "41.0.0": "2025-03-01T00:00:00Z", "42.0.0": "2025-05-01T00:00:00Z", "42.1.0": "2025-06-01T00:00:00Z" }) });
  const t = join(dir, "t.json");
  assert.deepEqual(electronVersion({ devDependencies: { electron: "~40.2.0" } }, t),
    { range: "~40.2.0", major: 40, latest: 42, released: "2025-01-01", supported: true, majors_behind: 2, snapshot: "2026-01-02" });
  assert.equal(electronVersion({ dependencies: { electron: "^39.0.0" } }, t).supported, false);
  assert.equal(electronVersion({ dependencies: { electron: "latest" } }, t), null);
  assert.equal(electronVersion({}, t), null);
});

test("compare: overlap with grep by location, comments and categories split out", () => {
  const rep = {
    facts: [{ category: "network", file: "a.js", line: 1 }, { category: "risky-api", file: "a.js", line: 2 }, { category: "env", file: "a.js", line: 3 }],
    grep: [{ category: "network", file: "a.js", line: 1 }, { category: "network", file: "a.js", line: 5, comment: true }, { category: "network", file: "a.js", line: 6 }, { category: "network", file: "a.js", line: 6 }],
  };
  assert.deepEqual(compare(rep), { both: 1, only_rea: 1, only_grep: 2, only_grep_in_comments: 1, only_grep_by_category: { network: 1 } });
});

test("report card escapes app-controlled text", () => {
  const rep = { name: "<img src=x onerror=alert(1)>", description: '"><script>', facts: [], implicit: [], grep: [], windows: [], deps: [], telemetry_deps: [], electron: null, rea_version: "x", js_files: 0 };
  const html = reportCard(rep);
  assert.doesNotMatch(html, /<img src=x|<script>/);
  assert.match(html, /&lt;img src=x/);
});

const BIN = fileURLToPath(new URL("../bin/electron-xray.mjs", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd: tmpdir() });

test("CLI: usage errors exit 2", () => {
  assert.equal(cli().status, 2);
  assert.equal(cli("/nonexistent/dir").status, 2);
  assert.equal(cli("--bogus", "x").status, 2);
});

test("CLI: --out may come before the app dir; --json prints the report", () => {
  const out = join(mkdtempSync(join(tmpdir(), "elx-out-")), "r.html");
  const r = cli("--out", out, fixtureDir("electron-clean"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(out, "utf8"), /QuickNotes/);
  const j = cli(fixtureDir("electron-planted"), "--json");
  assert.equal(j.status, 0, j.stderr);
  const rep = JSON.parse(j.stdout);
  assert.equal(rep.electron.major, 13);
  assert.equal(rep.grep, undefined);
});
