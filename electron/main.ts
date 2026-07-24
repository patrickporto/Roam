import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerMediaProtocol, refreshRoots } from './services/mediaProtocol';
import { registerIpcHandlers, rescanAllRoots } from './ipc/handlers';
import { closeDb } from './services/db';

let mainWindow: BrowserWindow | null = null;

const isDev =
  !app.isPackaged &&
  (process.env.NODE_ENV === 'development' || process.argv.includes('--dev'));

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    resizable: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to work properly
    },
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
  });

  mainWindow.setMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html');
    if (!fs.existsSync(indexPath)) {
      console.error(
        `[roam] Build do renderer não encontrado em ${indexPath}.\n` +
          '       Rode `npm run build` para produção ou `npm run dev` para desenvolvimento.',
      );
    }
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error);
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[did-fail-load]', code, description);
  });
}

app.whenReady().then(() => {
  registerMediaProtocol();
  refreshRoots();
  registerIpcHandlers();
  createWindow();

  // revalida o índice cacheado em background
  void rescanAllRoots();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
