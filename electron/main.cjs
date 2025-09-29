const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1e1e1e',
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Development vs Production
  if (process.env.NODE_ENV === 'development') {
    // In development, we can either use Vite or load the built files
    const { spawn } = require('child_process');
    const viteProcess = spawn('npm', ['run', 'dev'], {
      shell: true,
      env: { ...process.env, BROWSER: 'none' }
    });

    // Wait for Vite to start
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    }, 3000);

    // Clean up Vite process on exit
    app.on('before-quit', () => {
      viteProcess.kill();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

// IPC Handlers
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Model management handlers
ipcMain.handle('models:save', async (event, model) => {
  // In a real app, you'd save this to electron-store
  // For now, we'll let the renderer handle localStorage
  return { success: true };
});

ipcMain.handle('models:load', async () => {
  // In a real app, you'd load from electron-store
  return [];
});

ipcMain.handle('models:delete', async (event, id) => {
  return { success: true };
});

// Conversation handlers
ipcMain.handle('conversation:save', async (event, conversation) => {
  return { success: true };
});

ipcMain.handle('conversation:load', async () => {
  return [];
});

ipcMain.handle('conversation:delete', async (event, id) => {
  return { success: true };
});

// MCP handlers
ipcMain.handle('mcp:connect', async (event, config) => {
  // MCP connection logic would go here
  return { success: true, id: Date.now().toString() };
});

ipcMain.handle('mcp:disconnect', async (event, id) => {
  return { success: true };
});

ipcMain.handle('mcp:get-tools', async (event, id) => {
  return [];
});

// Settings handlers
ipcMain.handle('settings:save', async (event, settings) => {
  return { success: true };
});

ipcMain.handle('settings:load', async () => {
  return {};
});