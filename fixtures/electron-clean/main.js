// OUR TEST FIXTURE (clean twin). Never executed; analysed statically only.
const { app, BrowserWindow, ipcMain, net } = require("electron");
const path = require("path");

// Security notes for contributors (comments, not code):
//   never set nodeIntegration: true or contextIsolation: false
//   webSecurity: false and sandbox: false are not allowed here
//   we removed https://www.google-analytics.com/mp/collect in v0.9
const HELP = "Settings like contextIsolation: false are dangerous; see docs.";

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile("index.html");
}

function checkForUpdates() {
  const req = net.request("https://updates.quicknotes-example.test/latest.json");
  req.on("response", (res) => res.on("data", () => {}));
  req.end();
}

ipcMain.handle("help", () => HELP);
app.whenReady().then(() => { createWindow(); checkForUpdates(); });
