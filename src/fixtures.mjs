// Analyses our two fixture twins and scores them against the frozen answer key in fixtures/truth.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, compare, SCORED } from "./analyze.mjs";
import { score } from "./score.mjs";

export const TWINS = ["electron-planted", "electron-clean"];
export const fixtureDir = (twin) => fileURLToPath(new URL(`../fixtures/${twin}`, import.meta.url));
export const loadTruth = () => JSON.parse(readFileSync(new URL("../fixtures/truth.json", import.meta.url), "utf8"));

const scored = (findings) => findings.filter((f) => SCORED.includes(f.category));

// Three columns per twin: the full tool, REA's own facts alone, and the grep baseline.
export function scoreReport(rep, behaviours) {
  return {
    tool: score(scored(rep.facts), behaviours),
    rea_only: score(scored(rep.facts).filter((f) => f.layer === "rea"), behaviours),
    grep: score(scored(rep.grep), behaviours),
    overlap: compare(rep),
    implicit: rep.implicit.map((f) => `${f.file}:${f.line} ${f.value}`),
  };
}

export function scoreFixtures() {
  const truth = loadTruth();
  return Object.fromEntries(TWINS.map((twin) => {
    const rep = analyze(fixtureDir(twin));
    return [twin, { rep, behaviours: truth[twin].behaviours, scores: scoreReport(rep, truth[twin].behaviours) }];
  }));
}
