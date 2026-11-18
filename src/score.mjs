// Scores findings against a frozen ground-truth list: same category, same file, line in the item's lines.
export function score(findings, truth) {
  const hit = new Set();
  const fps = [];
  const fpKeys = new Set();
  const norm = (v) => String(v ?? "").toLowerCase();
  for (const f of findings) {
    const here = truth.filter((t) => t.category === f.category && t.file === f.file && t.lines.includes(f.line));
    if (!here.length) { const k = `${f.category}|${f.file}|${f.line}`; if (!fpKeys.has(k)) { fpKeys.add(k); fps.push(f); } continue; }
    // several truth items can share a line (e.g. one prefs object): prefer the one whose value the finding names
    const t = here.find((t) => !hit.has(t.id) && (norm(f.value).startsWith(norm(t.value).split(" (")[0]) || norm(t.value).startsWith(norm(f.value)))) || here.find((t) => !hit.has(t.id) && here.length === 1) || here.find((t) => t.category !== "web-preference" && !hit.has(t.id));
    if (t) hit.add(t.id);
  }
  const planted = truth.filter((t) => t.planted);
  return {
    found: truth.filter((t) => hit.has(t.id)).map((t) => t.id),
    missed: truth.filter((t) => !hit.has(t.id)).map((t) => t.id),
    planted_found: planted.filter((t) => hit.has(t.id)).length,
    planted_total: planted.length,
    real_found: truth.filter((t) => !t.planted && hit.has(t.id)).length,
    real_total: truth.filter((t) => !t.planted).length,
    false_positives: fps.length,
    fp_detail: fps.map((f) => `${f.category} ${f.file}:${f.line} ${f.value ?? ""}`.trim()),
  };
}
