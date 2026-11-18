// What the package says about itself: the hosts its README and package.json mention.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
export function readmeClaims(root) {
  const name = readdirSync(root).find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
  const text = name ? readFileSync(join(root, name), "utf8") : "";
  let pkg = {}; try { pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); } catch {}
  const all = text + "\n" + (pkg.description || "") + "\n" + (pkg.homepage || "");
  const hosts = new Set([...all.matchAll(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/gi)].map((m) => m[1].toLowerCase()).filter((h) => !/\.(md|js|ts|json|py|png|jpg|gif|svg|txt|yml|yaml|sh|tsx|html)$/.test(h)));
  return { readme: name || null, hosts, pkg };
}
// Suffixes under which unrelated parties get their own subdomain: a README naming one site there does not document another.
const SHARED_SUFFIX = /\.(github\.io|gitlab\.io|netlify\.app|vercel\.app|pages\.dev|workers\.dev|herokuapp\.com|azurewebsites\.net|cloudfront\.net|amazonaws\.com|(co|com|org|net|ac|gov)\.[a-z]{2})$/;
// Registrable domain, approximated: the last two labels, or three under a shared suffix.
const siteOf = (host) => host.split(".").slice(SHARED_SUFFIX.test(host) ? -3 : -2).join(".");

// A host counts as documented if the README names it or any host on the same site (e.g. updates.x.com and x.com).
export function hostDocumented(host, claims) {
  if (!host || host.startsWith("(")) return false;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(host)) return true;
  const site = siteOf(host);
  return [...claims.hosts].some((h) => h === host || siteOf(h) === site);
}
