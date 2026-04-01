import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererBuildPath = path.join(__dirname, '../../dist/index.html');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    title: 'Control de peso familiar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    console.log(`[electron] loading renderer URL: ${rendererUrl}`);
    mainWindow.loadURL(rendererUrl);
    return;
  }

  if (!fs.existsSync(rendererBuildPath)) {
    throw new Error(`No se encuentra el renderer en ${rendererBuildPath}`);
  }

  console.log(`[electron] loading renderer file: ${rendererBuildPath}`);
  mainWindow.loadFile(rendererBuildPath);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
