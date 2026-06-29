import { app, BrowserWindow, session } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const SERVER_URL = 'http://127.0.0.1:3001';
const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 540;

let mainWindow;
let serverProcess;

function startServer() {
  const envFile = path.join(projectRoot, '.env');
  const nodeArgs = existsSync(envFile)
    ? [`--env-file=${envFile}`, 'server.ts']
    : ['server.ts'];

  serverProcess = spawn('node', nodeArgs, {
    cwd: projectRoot,
    env: { ...process.env, PORT: '3001' },
    stdio: 'inherit',
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(SERVER_URL);
      if (response.ok) return;
    } catch {
      // Server still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Express server failed to start');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'Gio-System',
    useContentSize: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: '#f4f4f5',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(SERVER_URL);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  startServer();
  await waitForServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
