const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let catalogServer = null;

const isDev = !app.isPackaged;
const CATALOG_PORT = 3001;
const CATALOG_URL = `http://127.0.0.1:${CATALOG_PORT}`;

function serverEntryPath() {
  const candidates = [
    // Packaged: extraResources copies the standalone build to resources/catalog.
    path.join(process.resourcesPath || '', 'catalog', 'server.js'),
    path.join(process.resourcesPath || '', 'catalog', '_next', 'standalone', 'server.js'),
    path.join(process.resourcesPath || '', '_next', 'standalone', 'server.js'),
    // Running from the repo: windows/ -> catalog/.next/standalone.
    path.join(__dirname, '..', '..', '..', 'catalog', '.next', 'standalone', 'server.js'),
    path.join(__dirname, '..', '..', 'catalog', '.next', 'standalone', 'server.js'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return candidates[0];
}

function startCatalogServer() {
  const serverPath = serverEntryPath();
  const serverDir = path.dirname(serverPath);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], {
      cwd: serverDir,
      env: {
        ...process.env,
        // Make the Electron binary behave as plain Node for the child server.
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(CATALOG_PORT),
        HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    catalogServer = child;
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      out += d;
    });
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > 20000) {
        clearInterval(timer);
        try {
          child.kill();
        } catch {}
        reject(new Error(`catalog server did not start in time: ${out.slice(-800)}`));
        return;
      }
      const socket = net.connect(CATALOG_PORT, '127.0.0.1', () => {
        clearInterval(timer);
        try {
          socket.destroy();
        } catch {}
        resolve(child);
      });
      socket.on('error', () => {});
      setTimeout(() => {
        try {
          socket.destroy();
        } catch {}
      }, 1500);
    }, 300);
    child.on('exit', (code) => clearInterval(timer));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Tessera Music',
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadURL(CATALOG_URL);
  }
}

// ---- Downloader: streams a licensed full-length file from its source into a folder.
ipcMain.handle('download:track', async (event, payload) => {
  const url = payload?.url;
  const filename = String(payload?.filename || 'track').replace(/[<>:"/\\|?*]/g, '_');
  const folder = payload?.folder || app.getPath('downloads');
  if (!url) return { ok: false, error: 'missing url' };
  const targetDir = folder;
  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  const dest = path.join(targetDir, filename);
  const mod = url.startsWith('https') ? https : http;

  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    mod.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        const m2 = loc.startsWith('https') ? https : http;
        m2.get(loc, (res2) => pipe(res2));
        return;
      }
      pipe(res);
    }).on('error', (e) => {
      try {
        fs.unlinkSync(dest);
      } catch {}
      resolve({ ok: false, error: String(e) });
    });

    function pipe(res) {
      const total = Number(res.headers['content-length']) || 0;
      let received = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        if (mainWindow) {
          mainWindow.webContents.send('download:progress', { received, total, dest });
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve({ ok: true, path: dest }));
      });
      res.on('error', (e) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        resolve({ ok: false, error: String(e) });
      });
    }
  });
});

ipcMain.handle('download:pickFolder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle('app:downloadsPath', () => app.getPath('downloads'));

ipcMain.handle('shell:openPath', async (event, p) => {
  if (!p) return false;
  const r = await shell.openPath(p);
  return !r;
});

function setupAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update:available', info);
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update:downloaded', info);
  });
  autoUpdater.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('update:error', String(err));
  });
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
}

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(async () => {
  if (!isDev) {
    try {
      await startCatalogServer();
    } catch (e) {
      console.error('catalog server failed', e);
    }
  }

  createWindow();
  setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Don't leave the bundled catalog server running after the window closes.
app.on('will-quit', () => {
  if (catalogServer) {
    try {
      catalogServer.kill();
    } catch {
      /* already gone */
    }
    catalogServer = null;
  }
});
