// Scores both fixture twins against fixtures/truth.json; writes results/electron-*.json and results/fixture-scores.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scoreFixtures } from "../src/fixtures.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
mkdirSync("results", { recursive: true });
const fixtures = scoreFixtures();
for (const [twin, { rep }] of Object.entries(fixtures)) writeFileSync(`results/${twin}.json`, JSON.stringify(rep, null, 1) + "\n");
const scores = Object.fromEntries(Object.entries(fixtures).map(([twin, f]) => [twin, f.scores]));
writeFileSync("results/fixture-scores.json", JSON.stringify(scores, null, 1) + "\n");
for (const [twin, s] of Object.entries(scores)) {
  console.log(`${twin}: electron-xray ${s.tool.planted_found}/${s.tool.planted_total} planted, ${s.tool.real_found}/${s.tool.real_total} other, ${s.tool.false_positives} FP${s.tool.fp_detail.length ? ` (${s.tool.fp_detail.join("; ")})` : ""}`);
  console.log(`  REA facts alone ${s.rea_only.planted_found}/${s.rea_only.planted_total}, ${s.rea_only.false_positives} FP; grep ${s.grep.planted_found}/${s.grep.planted_total}, ${s.grep.false_positives} FP`);
  if (s.tool.missed.length) console.log(`  missed: ${s.tool.missed.join(", ")}`);
}
