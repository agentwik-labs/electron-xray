// Records the real report pages (built by scripts/build-reports.mjs from real analysis runs) in clean headless Chromium.
// Captions, title card and highlight boxes are overlays added by this script. Writes demo/_work/raw.webm.
import { chromium } from "./pw.mjs";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const { fixtures: fx, totals } = JSON.parse(readFileSync("results/measured.json", "utf8"));
const [tool, grep, cleanTool, cleanGrep] = [fx["electron-planted"].tool, fx["electron-planted"].grep, fx["electron-clean"].tool, fx["electron-clean"].grep];
const W = "demo/_work"; rmSync(W, { recursive: true, force: true }); mkdirSync(W, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: W, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
const T0 = Date.now(); const marks = [];
const OVER = `#h-cap{position:fixed;left:50%;transform:translateX(-50%);bottom:40px;max-width:1500px;z-index:99;font:700 40px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;background:#05070bf0;border:2px solid #f5c04a;padding:16px 30px;border-radius:14px;text-align:center;box-shadow:0 12px 50px #000a}
#h-cap small{display:block;font:500 25px/1.3 ui-sans-serif,system-ui,sans-serif;color:#aab3c5;margin-top:6px}
.h-hl{outline:4px solid #f5c04a!important;outline-offset:4px;border-radius:12px;transition:outline .2s}
#h-title{position:fixed;inset:0;background:#0d1016;z-index:100;display:flex;flex-direction:column;justify-content:center;padding-left:180px;font-family:ui-sans-serif,system-ui,sans-serif;color:#fff}
#h-title h1{font:800 120px/1 ui-monospace,Menlo,monospace;margin:0 0 26px;letter-spacing:-3px}#h-title p{font-size:46px;color:#aab3c5;margin:0}`;
async function open(file) { await p.goto(new URL(`../reports/${file}`, import.meta.url).href); await p.addStyleTag({ content: OVER + (file === "index.html" ? ".wrap{zoom:.8;padding-top:20px}" : ".wrap{zoom:1.12}") }); }
async function cap(html, hl) {
  await p.evaluate(([h, sel]) => {
    let c = document.getElementById("h-cap"); if (!c) { c = document.createElement("div"); c.id = "h-cap"; document.body.append(c); }
    c.innerHTML = h; c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: "forwards" });
    document.querySelectorAll(".h-hl").forEach((e) => e.classList.remove("h-hl"));
    if (sel) for (const s of sel.split("|")) { const e = document.querySelectorAll(s.split("@")[0])[+(s.split("@")[1] || 0)]; e && e.classList.add("h-hl"); }
  }, [html, hl || ""]);
}
const wait = (ms) => p.waitForTimeout(ms);
const mark = (n) => marks.push([n, (Date.now() - T0) / 1000]);

await open("fixture-electron-planted.html");
await p.evaluate(() => { const t = document.createElement("div"); t.id = "h-title"; t.innerHTML = "<h1>electron-xray</h1><p>The privacy and security report IT asks for<br>before approving a desktop app. Built on REA. Nothing is run.</p>"; document.body.append(t); });
mark("start"); await wait(2700);
await p.evaluate(() => document.getElementById("h-title").remove());
await cap(`Our test fixture: an Electron notes app with <b>${tool.planted_total} things we planted</b>.<small>Yellow tags = planted. The list was frozen before the first run.</small>`, ".tag");
await wait(3600);
await cap("Unsafe window settings, with file:line.<small>Including ones hidden in a shared const, and one that is unsafe only by default.</small>", ".card@0");
await wait(3800);
await cap("Telemetry the README never mentions:<small>Google Analytics, Sentry, and a beacon sending hostname and username.</small>", ".card@1|.card@2");
await wait(3800);
await cap("Electron 13: 32 majors behind, out of support.<small>And a link-opener that takes any URL over IPC.</small>", ".card@3|.card@4");
await wait(3400); mark("fixture done");
await open("index.html");
await cap(`Planted found: <b>${tool.planted_found} of ${tool.planted_total}</b>. False positives: <b>${tool.false_positives}</b>.<small>grep also found ${grep.planted_found}, with ${grep.false_positives} false positives. Clean twin: ${cleanTool.false_positives} vs ${cleanGrep.false_positives}.</small>`, "#fixture");
await wait(4800);
await open("electron-markdownify.html");
await cap("Real open-source app (MIT): electron-markdownify<small>Electron 7, nodeIntegration on, context isolation off by default. Listed, not judged.</small>", ".card@0|.card@3");
await wait(4400);
await open("index.html");
await cap(`Honest result: on ${totals.apps} real apps REA found nothing grep missed.<small>It adds precision (${totals.only_grep_in_comments} grep hits were comments) and what grep cannot see: defaults and Electron age.</small>`, "#vs");
await wait(5000); mark("end");
await ctx.close(); await b.close();
const f = readdirSync(W).find((x) => x.endsWith(".webm")); renameSync(`${W}/${f}`, `${W}/raw.webm`);
console.log(JSON.stringify(marks));
