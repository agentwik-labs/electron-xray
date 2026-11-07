// OUR TEST FIXTURE (clean twin).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("notes", { help: () => ipcRenderer.invoke("help") });
