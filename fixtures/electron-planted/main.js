// OUR TEST FIXTURE (planted twin). Never executed; analysed statically only. Planted items are listed in fixtures/truth.json.
const { app, BrowserWindow, ipcMain, net, shell } = require("electron");
const path = require("path");
const os = require("os");
const Sentry = require("@sentry/electron");

// Security notes for contributors (comments, not code):
//   never set nodeIntegration: true or contextIsolation: false
//   webSecurity: false and sandbox: false are not allowed here
//   we removed https://www.google-analytics.com/mp/collect in v0.9
const HELP = "Settings like contextIsolation: false are dangerous; see docs.";

Sentry.init({ dsn: "https://0123456789abcdef@o12345.ingest.sentry.io/678" });

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
      enableRemoteModule: true,
    },
  });
  win.loadFile("index.html");
}

const LEGACY_PREFS = { sandbox: false, allowRunningInsecureContent: true, webviewTag: true };
function createAboutWindow() {
  const about = new BrowserWindow({ width: 400, height: 300, webPreferences: LEGACY_PREFS });
  about.loadURL("https://about.quicknotes-example.test/");
}

function checkForUpdates() {
  const req = net.request("https://updates.quicknotes-example.test/latest.json");
  req.on("response", (res) => res.on("data", () => {}));
  req.end();
}

function beacon() {
  const body = JSON.stringify({ host: os.hostname(), user: os.userInfo().username, platform: process.platform });
  const r = net.request({ method: "POST", url: "https://t.metrics-example.test/collect" });
  r.write(body);
  r.end();
}

ipcMain.handle("help", () => HELP);
ipcMain.on("open", (_e, url) => shell.openExternal(url));
app.whenReady().then(() => { createWindow(); createAboutWindow(); checkForUpdates(); setInterval(beacon, 60000); });
