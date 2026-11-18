// Playwright is only needed for the demo scripts, so it is not a dependency. Install it in this checkout
// (npm i --no-save playwright) or point PLAYWRIGHT_DIR at a project that has it.
import { createRequire } from "node:module";
const from = process.env.PLAYWRIGHT_DIR ? process.env.PLAYWRIGHT_DIR.replace(/\/?$/, "/") : import.meta.url;
export const { chromium } = createRequire(from)("playwright");
