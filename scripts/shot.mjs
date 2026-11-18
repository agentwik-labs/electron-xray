// node scripts/shot.mjs reports/x.html out.png
import { pathToFileURL } from "node:url";
import { chromium } from "./pw.mjs";
const [, , page, out] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(page).href);
await p.screenshot({ path: out });
await b.close();
