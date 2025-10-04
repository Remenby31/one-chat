import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    backgroundColor: '#1e1e1e',
    show: false
  });

  // Remove the menu bar
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Development vs Production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
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

// Helper function to get user data directory
function getUserDataPath() {
  return app.getPath('userData');
}

async function ensureConfigDirectory() {
  const configDir = getUserDataPath();
  try {
    await fs.access(configDir);
  } catch {
    await fs.mkdir(configDir, { recursive: true });
  }
  return configDir;
}

// IPC Handlers
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Config file operations
ipcMain.handle('config:read', async (_event, filename: string) => {
  try {
    const configDir = await ensureConfigDirectory();
    const filePath = path.join(configDir, filename);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist yet
    }
    throw error;
  }
});

ipcMain.handle('config:write', async (_event, filename: string, data: any) => {
  const configDir = await ensureConfigDirectory();
  const filePath = path.join(configDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

// Export configuration
ipcMain.handle('config:export', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Configuration',
      defaultPath: 'onechat-config.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const configDir = await ensureConfigDirectory();
    const modelsPath = path.join(configDir, 'models.json');
    const apiKeysPath = path.join(configDir, 'apiKeys.json');

    const config: any = {};

    try {
      const modelsData = await fs.readFile(modelsPath, 'utf-8');
      config.models = JSON.parse(modelsData);
    } catch {
      config.models = [];
    }

    try {
      const apiKeysData = await fs.readFile(apiKeysPath, 'utf-8');
      config.apiKeys = JSON.parse(apiKeysData);
    } catch {
      config.apiKeys = [];
    }

    await fs.writeFile(result.filePath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true, path: result.filePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Import configuration
ipcMain.handle('config:import', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import Configuration',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const configData = await fs.readFile(result.filePaths[0], 'utf-8');
    const config = JSON.parse(configData);

    const configDir = await ensureConfigDirectory();

    if (config.models) {
      await fs.writeFile(
        path.join(configDir, 'models.json'),
        JSON.stringify(config.models, null, 2),
        'utf-8'
      );
    }

    if (config.apiKeys) {
      await fs.writeFile(
        path.join(configDir, 'apiKeys.json'),
        JSON.stringify(config.apiKeys, null, 2),
        'utf-8'
      );
    }

    return { success: true, config };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Resolve environment variables
ipcMain.handle('env:resolve', async (_event, value: string) => {
  if (typeof value !== 'string') {
    return value;
  }

  // Check if the value starts with $
  if (value.startsWith('$')) {
    const envVarName = value.slice(1);
    const envValue = process.env[envVarName];
    return envValue || value; // Return original if not found
  }

  return value;
});

// List environment variables
ipcMain.handle('env:list', async () => {
  // Return only environment variables that might be API keys or useful for configuration
  const relevantPrefixes = ['OPENAI', 'ANTHROPIC', 'API', 'KEY', 'TOKEN', 'GOOGLE', 'AZURE', 'AWS', 'GROQ', 'COHERE', 'MISTRAL', 'HUGGINGFACE', 'HF', 'GEMINI'];
  const envVars: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value && relevantPrefixes.some(prefix => key.toUpperCase().includes(prefix))) {
      envVars[key] = value;
    }
  }

  return envVars;
});