// One-screen privacy and security report for an Electron app. Neutral wording: lists settings and endpoints, not a verdict.
const CSS = `*{box-sizing:border-box}body{margin:0;background:#0d1016;color:#e8ecf3;font:16px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif}
.wrap{max-width:1500px;margin:0 auto;padding:34px 44px}
.top{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}.top h1{font:800 40px/1.1 ui-monospace,Menlo,monospace;margin:0;letter-spacing:-1px}
.ver{color:#8b95a7;font:600 20px ui-monospace,Menlo,monospace}.desc{color:#aab3c5;margin:6px 0 0;font-size:18px;max-width:1100px}
.tag{display:inline-block;background:#f5c04a;color:#10131a;font:800 15px ui-monospace,Menlo,monospace;padding:5px 12px;border-radius:6px;letter-spacing:.5px}
.meta{color:#8b95a7;font:14px ui-monospace,Menlo,monospace;margin-top:10px}
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:22px 0}
.tile{background:#151a23;border:1px solid #232a37;border-radius:12px;padding:14px 16px}.tile b{display:block;font:800 38px/1 ui-monospace,Menlo,monospace}.tile span{color:#8b95a7;font-size:14px}
.tile.warn b{color:#ff8a65}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.card{background:#151a23;border:1px solid #232a37;border-radius:12px;padding:14px 18px;min-height:120px}.card h2{font-size:15px;text-transform:uppercase;letter-spacing:1.2px;color:#8b95a7;margin:0 0 10px}
.row{display:flex;gap:8px;align-items:center;font:14.5px/1.5 ui-monospace,Menlo,monospace;padding:3px 0;border-bottom:1px solid #1c2230}.row:last-child{border:0}
.row .v{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row .w{color:#6d7789;font-size:12.5px}
.b{font:700 11.5px ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:5px;white-space:nowrap}.b.doc{background:#16352a;color:#5fd39a}.b.undoc{background:#3d2a14;color:#ffb35c}
.b.sec{background:#3a1a24;color:#ff7a95}.b.pl{background:#f5c04a;color:#111}.b.lay{background:#1f2633;color:#8fa3c4}
.none{color:#5c6577;font-style:italic}.foot{color:#6d7789;font-size:13.5px;margin-top:16px}
table{border-collapse:collapse;width:100%;font:15px ui-monospace,Menlo,monospace}td,th{padding:8px 10px;border-bottom:1px solid #232a37;text-align:right}td:first-child,th:first-child{text-align:left}th{color:#8b95a7;font-weight:600}
.big{font:800 30px ui-monospace,Menlo,monospace}`;
export { CSS };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const where = (f) => `<span class="w">${esc(String(f.file).split("/").slice(-2).join("/"))}:${f.line}</span>`;
const rows = (items, render, empty = "none found") => (items.length ? items.map(render).join("") : `<div class="none">${empty}</div>`);

export function reportCard(rep, { fixture = false, planted = new Map() } = {}) {
  const F = rep.facts, by = (c) => F.filter((f) => f.category === c);
  const pl = (f) => { const id = planted.get(`${f.category}|${f.file}|${f.line}|${String(f.value).split(" (")[0].split(":")[0]}`) || planted.get(`${f.category}|${f.file}|${f.line}`); return id ? `<span class="b pl">${id}</span>` : ""; };
  const prefs = by("web-preference"), implicit = rep.implicit || [];
  const net = by("network"); const hosts = new Map(); for (const f of net) { if (!hosts.has(f.value)) hosts.set(f.value, { ...f, n: 0 }); hosts.get(f.value).n++; }
  const tele = by("telemetry");
  const e = rep.electron;
  const t = (n, label, warn) => `<div class="tile${warn && n ? " warn" : ""}"><b>${n}</b><span>${label}</span></div>`;
  const s = rep.rea_summary || {};
  const undocHosts = [...hosts.values()].filter((h) => !h.documented && !String(h.value).startsWith("(")).length;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.name)} - electron-xray</title><style>${CSS}</style></head><body><div class="wrap">
<div class="top">${fixture ? '<span class="tag">OUR TEST FIXTURE: behaviours planted by us</span>' : ""}<h1>${esc(rep.name)}</h1><span class="ver">${esc(rep.version || "")}${rep.license ? " · " + esc(rep.license) : ""}</span></div>
<p class="desc">${esc(rep.description).slice(0, 200)}</p>
<div class="meta">${rep.js_files} source files · ${rep.windows.length} BrowserWindow${rep.windows.length === 1 ? "" : "s"} · ${s.ipc?.main_handlers ?? 0} IPC handlers · ${s.context_bridge_apis ?? 0} contextBridge APIs · ${rep.deps.length} runtime deps · REA ${esc(rep.rea_version)}${rep.commit ? ` · commit ${esc(rep.commit.slice(0, 7))} (${esc(rep.commit_date)})` : ""} · static only, nothing executed</div>
<div class="tiles">${t(e ? (e.supported ? "ok" : e.majors_behind + " behind") : "?", e ? `Electron ${e.major} (latest ${e.latest})` : "Electron version not found", e && !e.supported)}${t(prefs.length, "unsafe webPreferences set", true)}${t(implicit.length, "unsafe by default (absent key)", true)}${t(tele.length + rep.telemetry_deps.length, "telemetry signals", true)}${t(undocHosts, "hosts not in README", true)}${t(by("risky-api").length, "openExternal on non-literal URL", true)}</div>
<div class="grid">
<div class="card"><h2>Window settings (webPreferences)</h2>${rows(prefs.slice(0, 8), (f) => `<div class="row">${pl(f)}<span class="v">${esc(f.value)}</span>${where(f)}</div>`, "no unsafe values set explicitly")}${implicit.slice(0, 4).map((f) => `<div class="row"><span class="b undoc">default</span><span class="v">${esc(f.value)}</span>${where(f)}</div>`).join("")}</div>
<div class="card"><h2>Telemetry and analytics</h2>${rows(tele.slice(0, 6), (f) => `<div class="row">${pl(f)}<span class="v">${esc(f.value)}</span>${where(f)}</div>`, "no known vendor endpoints")}${rep.telemetry_deps.map((d) => `<div class="row"><span class="b lay">dependency</span><span class="v">${esc(d)}</span></div>`).join("")}</div>
<div class="card"><h2>Network endpoints</h2>${rows([...hosts.values()].slice(0, 8), (f) => `<div class="row">${pl(f)}<span class="v">${esc(f.value)}</span><span class="w">${f.n}×</span>${String(f.value).startsWith("(") ? "" : `<span class="b ${f.documented ? "doc" : "undoc"}">${f.documented ? "in README" : "not in README"}</span>`}</div>`, "no outbound calls found")}</div>
<div class="card"><h2>Electron version</h2>${e ? `<div class="row">${pl({ category: "electron-version", file: "package.json", line: (F.find((f) => f.category === "electron-version") || {}).line })}<span class="v">electron ${esc(e.range)}</span><span class="b ${e.supported ? "doc" : "undoc"}">${e.supported ? "supported" : "out of support"}</span></div><div class="row"><span class="v">major ${e.major} released ${esc(e.released || "?")}</span></div><div class="row"><span class="v">latest ${e.latest}; supported ${e.latest - 2}-${e.latest}</span><span class="w">npm registry ${esc(e.snapshot || "")}</span></div>` : '<div class="none">not declared in package.json</div>'}</div>
<div class="card"><h2>Risky calls</h2>${rows([...by("risky-api"), ...F.filter((f) => f.extra)].slice(0, 6), (f) => `<div class="row">${pl(f)}<span class="v">${esc(f.category === "risky-api" ? f.value : f.category + ": " + f.value)}</span>${where(f)}</div>`)}</div>
<div class="card"><h2>Same files, plain grep</h2><div class="row"><span class="v">grep hits (locations)</span><b>${new Set(rep.grep.map((f) => f.category + f.file + f.line)).size}</b></div><div class="row"><span class="v">this report (locations)</span><b>${new Set(F.map((f) => f.category + f.file + f.line)).size}</b></div><div class="w" style="margin-top:6px">grep cannot see defaults, or tell a comment from a setting.</div></div>
</div>
<div class="foot">electron-xray: static analysis with REA (rea-agents ${esc(rep.rea_version)}) plus our checks. Settings and endpoints the code declares, with file:line. Not a verdict on the app.</div>
</div></body></html>`;
}
