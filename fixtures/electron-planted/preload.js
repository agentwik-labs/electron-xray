// OUR TEST FIXTURE (planted twin).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("notes", { help: () => ipcRenderer.invoke("help") });
