// Electron-specific checks on top of REA's application graph:
//  - BrowserWindow webPreferences (REA resolves literal options; we resolve a webPreferences identifier bound to a
//    const object literal in the same file, with @babel/parser)
//  - insecure defaults implied by the declared Electron major when a key is absent (reported separately, not scored)
//  - Electron version support status (snapshot of the npm registry release dates in data/)
//  - telemetry vendors (hosts + SDK dependencies), shell.openExternal on non-literal URLs (notably inside IPC handlers)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";

// The unsafe value of each webPreferences key we report.
export const BAD = { nodeIntegration: true, contextIsolation: false, webSecurity: false, sandbox: false, enableRemoteModule: true,
  allowRunningInsecureContent: true, webviewTag: true, nodeIntegrationInSubFrames: true, nodeIntegrationInWorker: true, experimentalFeatures: true };
export const WHY = { nodeIntegration: "page scripts get Node.js (files, processes)", contextIsolation: "page can tamper with preload/Electron internals",
  webSecurity: "same-origin policy off", sandbox: "renderer runs without the OS sandbox", enableRemoteModule: "remote module: renderer reaches main-process objects",
  allowRunningInsecureContent: "HTTP content allowed on HTTPS pages", webviewTag: "<webview> tag enabled", nodeIntegrationInSubFrames: "Node.js in iframes",
  nodeIntegrationInWorker: "Node.js in workers", experimentalFeatures: "experimental web features on" };
const WHY_NODE_ISOLATED = "Node.js in the preload's isolated world; page scripts do not get it while contextIsolation is on";

// Value Electron uses when the key is absent, by Electron major. `set` holds the keys that are set, for defaults that
// depend on other keys (since Electron 20 the sandbox is on by default unless nodeIntegration is true).
export function defaultOf(key, major, set = {}) {
  if (key === "nodeIntegration") return major < 5;
  if (key === "contextIsolation") return major >= 12;
  if (key === "sandbox") return major >= 20 && set.nodeIntegration !== true;
  if (key === "enableRemoteModule") return major < 10;
  if (key === "webSecurity") return true;
  return undefined;
}

// Ingest/collection domains as documented by each vendor.
export const TELEMETRY_HOSTS = [
  ["Google Analytics", /(^|\.)(google-analytics\.com|analytics\.google\.com|googletagmanager\.com|app-measurement\.com)$/],
  ["Sentry", /(^|\.)sentry\.io$/], ["Segment", /(^|\.)segment\.(io|com)$/], ["Mixpanel", /(^|\.)mixpanel\.com$/],
  ["Amplitude", /(^|\.)amplitude\.com$/], ["PostHog", /(^|\.)posthog\.com$/], ["Bugsnag", /(^|\.)bugsnag\.com$/],
  ["Datadog", /(^|\.)(datadoghq\.(com|eu)|browser-intake-datadoghq\.com)$/], ["New Relic", /(^|\.)nr-data\.net$|(^|\.)newrelic\.com$/],
  ["App Center", /(^|\.)appcenter\.ms$/], ["Azure App Insights", /(^|\.)(applicationinsights\.azure\.com|dc\.services\.visualstudio\.com)$/],
  ["Aptabase", /(^|\.)aptabase\.com$/], ["TelemetryDeck", /(^|\.)telemetrydeck\.com$/], ["Plausible", /(^|\.)plausible\.io$/],
  ["Rollbar", /(^|\.)rollbar\.com$/], ["LogRocket", /(^|\.)(logrocket\.(io|com)|lr-ingest\.io)$/], ["Hotjar", /(^|\.)hotjar\.com$/],
  ["Heap", /(^|\.)heapanalytics\.com$/], ["Countly", /(^|\.)count\.ly$/],
];
export const TELEMETRY_DEPS = /^(@sentry\/|electron-google-analytics|universal-analytics|ga4-mp|mixpanel|@amplitude\/|amplitude-js|posthog-|@bugsnag\/|@segment\/|analytics-node|applicationinsights|@aptabase\/|@datadog\/|newrelic|rollbar|logrocket|nucleus-(nodejs|analytics)|insight$|countly-|@rudderstack\/|electron-analytics|@telemetrydeck\/|plausible-tracker)/;
export const vendorOf = (host) => (TELEMETRY_HOSTS.find(([, re]) => re.test(host || "")) || [])[0] || null;

// Electron's support policy covers the latest three stable majors.
export function electronVersion(pkg, timesPath) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const range = deps.electron || deps["electron-nightly"] || null;
  if (!range) return null;
  const major = Number((String(range).match(/(\d+)/) || [])[1]);
  if (!Number.isFinite(major)) return null;
  const times = JSON.parse(readFileSync(timesPath, "utf8"));
  const majors = Object.keys(times).map((v) => v.match(/^(\d+)\.0\.0$/)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  const latest = majors.at(-1);
  const released = times[`${major}.0.0`]?.slice(0, 10) || null;
  return { range, major, latest, released, supported: major >= latest - 2, majors_behind: latest - major, snapshot: times.modified?.slice(0, 10) };
}

const keyName = (k) => (k.type === "Identifier" ? k.name : k.type === "StringLiteral" ? k.value : null);

// `const IDENT = { a: true, b: false }` in the same file: its boolean keys, each with its own line.
export function constObjectPrefs(src, ident) {
  let ast;
  try { ast = parse(src, { sourceType: "unambiguous", errorRecovery: true, allowReturnOutsideFunction: true, plugins: ["jsx", "typescript"] }); }
  catch { return null; }
  let found = null;
  const visit = (node) => {
    if (found || !node || typeof node.type !== "string") return;
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === ident && node.init?.type === "ObjectExpression") {
      found = node.init.properties
        .filter((p) => p.type === "ObjectProperty" && !p.computed && keyName(p.key) && p.value.type === "BooleanLiteral")
        .map((p) => ({ name: keyName(p.key), value: p.value.value, line: p.loc.start.line }));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "loc" || k === "comments" || k === "leadingComments" || k === "trailingComments") continue;
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  };
  visit(ast.program);
  return found;
}

// Line of `key: value` in the constructor call, or up to 60 lines above it (REA resolves an options object built there).
function prefLine(lines, start, end, re) {
  for (let i = start; i <= Math.min(end, lines.length); i++) if (re.test(lines[i - 1])) return i;
  for (let i = start - 1; i >= Math.max(1, start - 60); i--) if (re.test(lines[i - 1])) return i;
  return start;
}

export function electronFacts(ev, root, pkg, timesPath) {
  const n = ev.normalized_result;
  const out = [], implicit = [], windows = [];
  const src = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { return ""; } };
  const ver = electronVersion(pkg, timesPath);
  for (const x of n.graph.nodes) {
    if (x.kind !== "browser-window") continue;
    for (const o of x.observations) {
      const p = o.properties, lv = o.evidence?.location?.value || {};
      const file = p.source_path || lv.source || lv.path;
      const start = lv.start?.line, end = lv.end?.line ?? start;
      const s = src(file), lines = s.split("\n");
      let prefs = (p.web_preferences || []).filter((w) => w.value?.status === "literal").map((w) => ({ name: w.name, value: w.value.value }));
      let layer = "rea", resolved = p.web_preferences_status !== "dynamic";
      if (p.web_preferences_status !== "object-literal" && start) {
        const id = lines.slice(start - 1, end).join("\n").match(/webPreferences\s*:\s*([A-Za-z_$][\w$]*)/);
        const r = id && constObjectPrefs(s, id[1]);
        if (r) { prefs = r; layer = "rea-site"; resolved = true; }
      }
      windows.push({ file, line: start, prefs: prefs.length, status: p.web_preferences_status });
      const set = Object.fromEntries(prefs.map((w) => [w.name, w.value]));
      const isolated = set.contextIsolation ?? (ver ? defaultOf("contextIsolation", ver.major) : false);
      for (const w of prefs) {
        if (BAD[w.name] !== w.value) continue;
        const line = w.line ?? prefLine(lines, start, end, new RegExp(`\\b${w.name}\\s*:\\s*${w.value}\\b`));
        const why = w.name === "nodeIntegration" && isolated ? WHY_NODE_ISOLATED : WHY[w.name];
        out.push({ category: "web-preference", file, line, value: `${w.name}: ${w.value}`, why, layer });
      }
      // defaults only when we know every key that is set
      if (ver && start && resolved) for (const key of ["nodeIntegration", "contextIsolation", "sandbox"]) {
        if (key in set) continue;
        const d = defaultOf(key, ver.major, set);
        if (d !== BAD[key]) continue;
        const because = key === "sandbox" && ver.major >= 20 ? " with nodeIntegration on" : "";
        implicit.push({ category: "web-preference-default", file, line: start, value: `${key}: ${d} (default in Electron ${ver.major}${because})`, why: WHY[key], layer: "default" });
      }
    }
  }
  if (ver && !ver.supported) {
    const line = src("package.json").split("\n").findIndex((l) => /"electron(-nightly)?"\s*:/.test(l)) + 1;
    out.push({ category: "electron-version", file: "package.json", line, value: `electron ${ver.range}: ${ver.majors_behind} majors behind ${ver.latest}, out of support (released ${ver.released})`, layer: "registry" });
  }
  // shell.openExternal with a non-literal argument (REA call sites), tied to the IPC handler that contains it
  const handlers = n.graph.nodes.filter((x) => x.kind === "ipc-handler").flatMap((x) => x.observations.map((o) => ({
    ch: o.properties.channel, loc: o.properties.handler_location, file: o.evidence?.location?.value?.source })));
  for (const x of n.semantic_graph.nodes) {
    if (x.kind !== "call-site" || !x.identity.source_range) continue;
    const r = x.identity.source_range, file = x.identity.module_path;
    const t = (src(file).split("\n")[r.start.line - 1] || "").slice(r.start.column);
    const m = t.match(/^((?:[\w$]+\.)*openExternal)\s*\(\s*([^)"'`]*)/);
    if (!m || /^\s*["'`]/.test(t.slice(m[1].length + 1))) continue;
    const h = handlers.find((h) => h.loc && (!h.file || h.file === file) && h.loc.start.line <= r.start.line && h.loc.end.line >= r.start.line);
    out.push({ category: "risky-api", file, line: r.start.line, value: `shell.openExternal(${m[2].trim() || "…"})${h ? ` inside IPC handler "${h.ch}"` : ""}`, layer: "rea-site" });
  }
  const seen = new Set();
  const facts = out.filter((f) => { const k = `${f.category}|${f.file}|${f.line}|${f.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { facts, implicit, windows, version: ver, summary: n.summary };
}
