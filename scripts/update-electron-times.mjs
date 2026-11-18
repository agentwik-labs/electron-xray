// Refreshes data/electron-time.json from the npm registry: the `time` field of https://registry.npmjs.org/electron
// (publish date of every electron version). Support status in reports is computed against this snapshot, so
// re-run the fixtures and reports after refreshing it.
import { writeFileSync } from "node:fs";
const res = await fetch("https://registry.npmjs.org/electron");
if (!res.ok) throw new Error(`registry answered ${res.status}`);
const { time } = await res.json();
writeFileSync(new URL("../data/electron-time.json", import.meta.url), JSON.stringify(time, null, 2) + "\n");
const majors = Object.keys(time).map((v) => v.match(/^(\d+)\.0\.0$/)).filter(Boolean).map((m) => Number(m[1]));
console.log(`electron-time.json: ${Object.keys(time).length} entries, latest major ${Math.max(...majors)}, modified ${time.modified}`);
