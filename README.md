# electron-xray

**On our planted Electron test app, electron-xray finds 12 of 12 planted problems with 0 false positives, and 0 false
positives on its clean twin. Plain grep over the same files also finds 12 of 12, with 4 and 5 false positives.**
Measured by scoring both fixture twins against a hand-written answer key (`fixtures/truth.json`): a finding counts if its
category, file and line match an item; anything else is a false positive. Reproduce with `node scripts/score-fixtures.mjs`;
numbers in `results/fixture-scores.json`, also asserted by `npm test`. The fixture is ours and small (see
[How it was measured](#how-it-was-measured) and [Limitations](#limitations)).

electron-xray produces the privacy and security report an IT team asks for before approving an Electron desktop app:
unsafe `webPreferences` (set explicitly, or unsafe because of the declared Electron version's defaults), Electron version
age and support status, telemetry vendors (endpoints and SDK dependencies), network endpoints checked against the README,
`shell.openExternal` on non-literal URLs (tied to the IPC channel when inside a handler), and the IPC surface. Every item
has `file:line`. It is static: the app is read as text, never installed, built or launched (a test checks that).

Built on [REA](https://github.com/morluto/rea) (`rea-agents`, MIT), used as a local CLI only.

## Install and run

Requires Node.js 22.19+ or 24.11+ (the engines of `rea-agents` and `@babel/parser`).

```sh
git clone https://github.com/agentwik-labs/electron-xray
cd electron-xray
npm ci --ignore-scripts      # --ignore-scripts skips an optional native package (frida) that rea-agents pulls in
npm test                     # 21 tests
node bin/electron-xray.mjs fixtures/electron-planted --out reports/planted.html
node bin/electron-xray.mjs fixtures/electron-planted --json > planted.json
```

On your own app: `node bin/electron-xray.mjs path/to/app`, where `path/to/app` has the app's `package.json` at its root
(a source checkout, or an extracted package). The HTML report goes to `reports/<package-name>.html` unless you pass
`--out`. To get the `electron-xray` command on your PATH: `npm install -g .` from the clone.

A packaged app ships `resources/app.asar`; extract it first, then scan the folder:

```sh
npx @electron/asar extract /path/to/resources/app.asar /tmp/app-src
node bin/electron-xray.mjs /tmp/app-src
```

Reproduce everything below (needs network for the clones; nothing is installed or run from them):

```sh
node scripts/score-fixtures.mjs                                 # fixture scores -> results/
node scripts/fetch-targets.mjs && node scripts/build-reports.mjs  # 4 real apps at pinned commits -> reports/, results/measured.json
```

## How it works

- **REA** (`analyze-javascript-application`): BrowserWindow nodes with literal `webPreferences` (REA follows an options
  object built above the constructor), IPC handlers and channels, preload and contextBridge APIs, network endpoints
  (`fetch`, `net.request`, `loadURL`), call sites with exact AST ranges.
- **Our checks** (`src/electron.mjs`, `src/strings.mjs`):
  - a `webPreferences` identifier bound to a `const` object literal in the same file (REA reports these as dynamic),
    resolved with `@babel/parser`;
  - insecure defaults by Electron major when a key is absent: `nodeIntegration` on before 5, `contextIsolation` off
    before 12, `sandbox` off before 20 and, from 20, off whenever `nodeIntegration` is on;
  - version support from a snapshot of the npm registry's release dates (`data/electron-time.json`, taken 2026-11-06,
    latest major 45; Electron supports the latest three majors, so 43-45). Refresh with
    `node scripts/update-electron-times.mjs`; the report prints the snapshot date;
  - telemetry: a list of 19 vendors' ingest domains plus SDK dependency names, matched at call sites and in string
    literals (this is how a Sentry DSN is found);
  - `net.request({ url })`, and `shell.openExternal` whose argument is not a string literal.
- **grep baseline** (`src/grep.mjs`) over the same files plus `package.json`: a regex for each unsafe `key: value`,
  URLs, vendor hosts, `net.request(` / `fetch(`, the `"electron":` line, `openExternal(`. It is the comparison, not a
  straw man: it is what a reviewer gets in five minutes.

## How it was measured

Runs of 2026-11-18, rea-agents 6.7.0.

### Our test fixture

Two twins of a tiny notes app in `fixtures/`. The planted twin has 12 planted items: four unsafe prefs set inline, three
more in a shared const, a beacon POSTing hostname and username to an undeclared host via `net.request({url})`, Sentry
(DSN string + `@sentry/electron` dependency), Google Analytics from the renderer, Electron `^13.1.0`, and
`shell.openExternal(url)` on a URL sent over IPC. The clean twin uses secure settings, Electron `^45.2.0`, one declared
update host, and decoys (comments naming the unsafe settings, a GA URL in a comment, a help string).

The answer key is `fixtures/truth.json`. Its history is in git: the 12 planted items were committed before the first analyser
run; one commit fixes a line-number typo in the clean twin; and one later amendment adds `C2`, the about window's
`loadURL("https://about.quicknotes-example.test/")`. That is real network behaviour of the fixture that the key forgot:
the first scoring run reported it as electron-xray's only false positive, and grep flagged it too. It is not a planted
item, and no planted item was changed. Before the amendment the result was 12 of 12 with 1 false positive (grep: 5).

| planted twin | planted found | false positives |
| --- | --- | --- |
| **electron-xray** | **12 / 12** | **0** |
| REA facts alone | 5 / 12 | 0 |
| plain grep | 12 / 12 | 4 |

| clean twin | false positives |
| --- | --- |
| electron-xray | 0 |
| plain grep | 5 |

grep's false positives are the comments and the help string; on the clean twin it also flags the current
`"electron": "^45.2.0"` line, because it cannot date it. Not scored (not in the answer key): the main window is
sandbox-off **by default** on Electron 13, which electron-xray reports and grep cannot see.

### 4 real open-source Electron apps

Permissive licences; source fetched at the commits pinned in `targets.json` (the default branch's head on 2026-11-07).

| app | licence | commit | files | REA s | electron | windows | unsafe set | unsafe by default | telemetry | hosts at call sites | openExternal non-literal | IPC handlers | deps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [stretchly](https://github.com/hovancik/stretchly) | BSD-2-Clause | 64450ca (2026-11-05) | 46 | 10.9 | ^44.9.3, supported | 8 | 8 × `sandbox: false` | 0 | 0 | api.github.com | 5 | 31 | 14 |
| [caprine](https://github.com/sindresorhus/caprine) | MIT | c3cbcf9 (2026-01-01) | 18 | 4.5 | ^29.0.1, 16 majors behind | 1 | `nodeIntegration: true` (with `contextIsolation: true`) | `sandbox` off | 0 | - | 3 | 0 | 17 |
| [electron-markdownify](https://github.com/amitmerchant1990/electron-markdownify) | MIT | 13cb55c (2025-05-21) | 18 | 42.0 | ^7.2.4, 38 majors behind | 1 | `nodeIntegration: true` | `contextIsolation`, `sandbox` off | 0 | - | 3 | 1 | 8 |
| [jitsi-meet-electron](https://github.com/jitsi/jitsi-meet-electron) | Apache-2.0 | 28c2dfd (2026-10-28) | 69 | 11.8 | ^43.8.3, supported | 3 | 0 | 0 | 0 | - | 1 | 5 | 3 |

No telemetry vendors found in any of the four. These are listings of what the code declares, not verdicts: `sandbox:
false` with a preload is a common, deliberate choice; `nodeIntegration: true` with `contextIsolation: true` keeps Node out
of page scripts; an `openExternal` call may validate its URL before the call; "majors behind" is relative to the
registry snapshot, not to the date of each commit. Reports: `reports/<app>.html`.

### REA vs grep (same files, 4 apps, scored categories, by category + file + line)

| found by both | only REA layer | only grep | of which: comments | URL lines | `openExternal(` with literal URLs | supported `"electron"` lines |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | 0 | 79 | 33 | 39 | 5 | 2 |

**Plainly: on these 4 apps REA's layer found no setting or endpoint that grep missed.** grep's extra 79 hits are 33
comments and 46 lines that are not findings by our definitions (links opened in the browser, docs URLs, literal-URL
`openExternal`, current Electron versions). What REA plus our checks add over grep: precision (0 vs 5 false positives on
the clean twin), the IPC channel behind a risky call, resolution of options defined elsewhere, and judgements grep
cannot make (insecure defaults for the declared Electron version, version support). Totals in `results/measured.json`.

## Limitations

- **Our fixture, our answer key.** Two small twins (3 JS files each) written by us. 12 of 12 there shows the checks
  work on the patterns we planted, not that they generalise; grep also gets 12 of 12. The real-app sample is 4 apps
  with no answer key, so there is no recall figure for real code.
- **Static only.** It reads what the source declares. It cannot see: options computed at runtime (objects built by
  functions, spread from config, set in another file), `setWindowOpenHandler` / `will-navigate` handlers, session
  permission handlers, CSP actually served, what a loaded remote page does, or traffic that only happens at runtime.
  Hosts in URLs built from variables show as "host not static".
- **Packaged apps.** It scans a folder, not an `.asar`; extract first (above). We checked that route on our fixture
  packed into an asar, not on real packaged apps. Bundled or minified code was not tested; file:line then points into
  the bundle. Electron fuses and the Electron binary actually shipped are not inspected: the version comes from
  `package.json`, which a packaged app may not declare.
- **Telemetry** is a vendor list (19) plus dependency names; first-party analytics endpoints show up only as network
  endpoints not named in the README. "Named in the README" matches the host or any host on the same site.
- **Defaults** covered: `nodeIntegration`, `contextIsolation`, `sandbox`. Support status depends on the registry snapshot
  in `data/`.
- **Text heuristics remain** where REA gives a range but not a value: the line of an inline `key: value`, the
  `openExternal` argument, and README host extraction.
- **Dependencies:** `npm audit` reports advisories in packages `rea-agents` 6.7.0 pulls in (`zod`, `minimatch` via
  `@electron/asar` and `frida`). We pin that version because the numbers above were measured with it.
- No LLM step is used anywhere.

## Layout

`bin/` CLI · `src/` analyser (REA runner, generic facts, Electron checks, string hosts, grep baseline, scoring, report) ·
`fixtures/` twins + `truth.json` · `data/electron-time.json` the `time` field of
[registry.npmjs.org/electron](https://registry.npmjs.org/electron) (publish date per version) · `scripts/` scoring,
fetch, build reports, refresh data, record demo (needs Playwright, not a dependency) · `results/`, `reports/` measured
output · `demo/` video and poster made from the real report pages · `targets/` clones (gitignored).

## Licence

MIT, see [LICENSE](LICENSE). Scanned apps keep their own licences; this repo contains reports about them, not their code.
