import { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import { mcpSDKManager } from './mcp-sdk.js';
import {
  startOAuthFlow,
  handleOAuthCallback,
  exchangeCodeForTokens,
  refreshAccessToken,
  needsTokenRefresh,
  getOAuthState,
  type MCPOAuthConfig,
} from './mcp-oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

// ========================================
// File Write Queue
// ========================================

class FileWriteQueue {
  private queues: Map<string, Promise<any>> = new Map();

  async enqueue<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const existingQueue = this.queues.get(filePath) || Promise.resolve();
    const newQueue = existingQueue
      .catch(() => {})
      .then(() => operation());

    this.queues.set(filePath, newQueue);

    try {
      const result = await newQueue;
      return result;
    } finally {
      if (this.queues.get(filePath) === newQueue) {
        this.queues.delete(filePath);
      }
    }
  }
}

const fileWriteQueue = new FileWriteQueue();

// ========================================
// Custom Protocol Handler (jarvis://)
// ========================================

protocol.registerSchemesAsPrivileged([
  { scheme: 'jarvis', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('jarvis', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('jarvis');
}

function handleDeepLink(url: string) {
  if (mainWindow) {
    mainWindow.webContents.send('oauth:callback', url);
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const url = commandLine.find(arg => arg.startsWith('jarvis://'));
      if (url) {
        handleDeepLink(url);
      }
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

// ========================================
// Config File Watcher
// ========================================

function setupConfigFileWatcher() {
  const mcpServersPath = path.join(app.getPath('userData'), 'mcpServers.json');
  let debounceTimer: NodeJS.Timeout | null = null;


  const watcher = fsSync.watch(mcpServersPath, (eventType) => {
    if (eventType === 'change') {
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        try {
          const content = await fs.readFile(mcpServersPath, 'utf-8');
          let data;

          try {
            data = JSON.parse(content);
          } catch (parseError: any) {
            console.error('[FileWatcher] JSON parse error:', parseError.message);
            const extracted = extractValidJSON(content);
            if (extracted) {
              console.warn('[FileWatcher] Repaired corrupted JSON');
              data = extracted;
              const backupPath = `${mcpServersPath}.corrupted.${Date.now()}`;
              await fs.copyFile(mcpServersPath, backupPath);
              await fs.writeFile(mcpServersPath, JSON.stringify(data, null, 2), 'utf-8');
              await fs.writeFile(`${mcpServersPath}.backup`, JSON.stringify(data, null, 2), 'utf-8');
            } else {
              console.error('[FileWatcher] Could not extract valid JSON, skipping broadcast');
              return;
            }
          }

          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('config:changed', 'mcpServers.json', data);
          });
        } catch (error) {
          console.error('[FileWatcher] Error reading config file:', error);
        }
      }, 100);
    }
  });

  app.on('before-quit', () => {
    watcher.close();
  });
}

// ========================================
// Helper Functions
// ========================================

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

function extractValidJSON(corruptedData: string): any | null {
  try {
    let validContent = '';
    let bracketCount = 0;
    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < corruptedData.length; i++) {
      const char = corruptedData[i];
      validContent += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      if (bracketCount === 0 && braceCount === 0 && (char === ']' || char === '}')) {
        try {
          return JSON.parse(validContent);
        } catch {
          // Continue searching
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ========================================
// Window Creation
// ========================================

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      webSecurity: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    backgroundColor: '#1e1e1e',
    show: false
  });

  // Set MCP SDK manager's main window reference
  mcpSDKManager.setMainWindow(mainWindow);

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    delete headers['content-security-policy'];
    delete headers['Content-Security-Policy'];
    headers['Content-Security-Policy'] = ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *"];
    callback({ responseHeaders: headers });
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && !input.alt && !input.control && !input.meta) {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools();
        }
      }
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mcpSDKManager.setMainWindow(null);
  });
}

// ========================================
// App Lifecycle
// ========================================

app.whenReady().then(() => {
  protocol.handle('jarvis', (request) => {
    const url = request.url;
    console.log('[Protocol] Protocol handler called:', url);
    handleDeepLink(url);
    return new Response('OAuth callback received', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    });
  });

  createWindow();
  setupConfigFileWatcher();

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

app.on('before-quit', async () => {
  console.log('[MCP] Stopping all servers...');
  await mcpSDKManager.stopAll();
});

// ========================================
// IPC Handlers - App/System
// ========================================

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:get-root', () => {
  return app.getAppPath();
});

ipcMain.handle('app:get-user-data-path', () => {
  return getUserDataPath();
});

ipcMain.handle('app:open-external', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ========================================
// IPC Handlers - Config
// ========================================

ipcMain.handle('config:read', async (_event, filename: string) => {
  const configDir = await ensureConfigDirectory();
  const filePath = path.join(configDir, filename);
  const backupPath = `${filePath}.backup`;

  const tryParseJSON = async (path: string, isBackup: boolean = false): Promise<any> => {
    try {
      const data = await fs.readFile(path, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }

      if (error instanceof SyntaxError && !isBackup) {
        console.error(`[ConfigRead] Corrupted file detected: ${filename}`);

        try {
          console.log(`[ConfigRead] Attempting recovery from backup...`);
          const backupData = await tryParseJSON(backupPath, true);

          if (backupData !== null) {
            console.log(`[ConfigRead] Successfully recovered from backup`);
            const corruptedBackupPath = `${path}.corrupted.${Date.now()}`;
            await fs.copyFile(path, corruptedBackupPath);
            await fs.writeFile(path, JSON.stringify(backupData, null, 2), 'utf-8');
            return backupData;
          }
        } catch (backupError) {
          console.error(`[ConfigRead] Backup recovery failed:`, backupError);
        }

        console.log(`[ConfigRead] Attempting to extract valid JSON from corrupted file...`);
        try {
          const corruptedData = await fs.readFile(path, 'utf-8');
          const extracted = extractValidJSON(corruptedData);

          if (extracted) {
            console.log(`[ConfigRead] Successfully extracted valid JSON`);
            const corruptedBackupPath = `${path}.corrupted.${Date.now()}`;
            await fs.copyFile(path, corruptedBackupPath);
            await fs.writeFile(path, JSON.stringify(extracted, null, 2), 'utf-8');
            await fs.writeFile(backupPath, JSON.stringify(extracted, null, 2), 'utf-8');
            return extracted;
          }
        } catch (extractError) {
          console.error(`[ConfigRead] JSON extraction failed:`, extractError);
        }

        console.error(`[ConfigRead] All recovery attempts failed, returning empty data`);
        const defaultData = filename.includes('.json') ? [] : null;
        const corruptedBackupPath = `${path}.corrupted.${Date.now()}`;
        await fs.copyFile(path, corruptedBackupPath);
        await fs.writeFile(path, JSON.stringify(defaultData, null, 2), 'utf-8');
        return defaultData;
      }

      throw error;
    }
  };

  return tryParseJSON(filePath);
});

ipcMain.handle('config:write', async (_event, filename: string, data: any) => {
  const configDir = await ensureConfigDirectory();
  const filePath = path.join(configDir, filename);
  const fileDir = path.dirname(filePath);

  return fileWriteQueue.enqueue(filePath, async () => {
    try {
      await fs.access(fileDir);
    } catch {
      await fs.mkdir(fileDir, { recursive: true });
    }

    try {
      const jsonContent = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, jsonContent, 'utf-8');

      if (['mcpServers.json', 'models.json', 'apiKeys.json'].includes(filename)) {
        const backupPath = `${filePath}.backup`;
        await fs.writeFile(backupPath, jsonContent, 'utf-8');
      }

      return true;
    } catch (error: any) {
      console.error(`[ConfigWrite] Error writing ${filename}:`, error);
      throw error;
    }
  });
});

ipcMain.handle('config:export', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Configuration',
      defaultPath: 'jarvis-config.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const configDir = await ensureConfigDirectory();
    const config: any = {};

    try {
      const modelsData = await fs.readFile(path.join(configDir, 'models.json'), 'utf-8');
      config.models = JSON.parse(modelsData);
    } catch {
      config.models = [];
    }

    try {
      const apiKeysData = await fs.readFile(path.join(configDir, 'apiKeys.json'), 'utf-8');
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

// ========================================
// IPC Handlers - Environment
// ========================================

ipcMain.handle('env:resolve', async (_event, value: string) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.startsWith('$')) {
    const envVarName = value.slice(1);
    const envValue = process.env[envVarName];
    return envValue || value;
  }

  return value;
});

ipcMain.handle('env:list', async () => {
  const relevantPrefixes = ['OPENAI', 'ANTHROPIC', 'API', 'KEY', 'TOKEN', 'GOOGLE', 'AZURE', 'AWS', 'GROQ', 'COHERE', 'MISTRAL', 'HUGGINGFACE', 'HF', 'GEMINI'];
  const envVars: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value && relevantPrefixes.some(prefix => key.toUpperCase().includes(prefix))) {
      envVars[key] = value;
    }
  }

  return envVars;
});

// ========================================
// IPC Handlers - API
// ========================================

ipcMain.handle('api:fetch-models', async (_event, baseURL: string, apiKey: string) => {
  try {
    let resolvedApiKey = apiKey;
    if (apiKey.startsWith('$')) {
      const envVarName = apiKey.slice(1);
      resolvedApiKey = process.env[envVarName] || apiKey;
    }

    const response = await fetch(`${baseURL}/models`, {
      headers: {
        'Authorization': `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      return { success: true, models: data.data.map((m: any) => m.id) };
    }

    return { success: false, error: 'Invalid response format' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ========================================
// IPC Handlers - Threads
// ========================================

ipcMain.handle('thread:list', async () => {
  try {
    const configDir = await ensureConfigDirectory();
    const conversationsDir = path.join(configDir, 'conversations');

    try {
      await fs.access(conversationsDir);
    } catch {
      await fs.mkdir(conversationsDir, { recursive: true });
      return [];
    }

    const files = await fs.readdir(conversationsDir);
    const threadFiles = files.filter(f => f.startsWith('thread_') && f.endsWith('.json'));
    return threadFiles;
  } catch (error: any) {
    console.error('[Threads] Failed to list threads:', error);
    return [];
  }
});

ipcMain.handle('thread:delete', async (_event, filename: string) => {
  try {
    const configDir = await ensureConfigDirectory();
    const conversationsDir = path.join(configDir, 'conversations');
    const filePath = path.join(conversationsDir, filename);

    await fs.unlink(filePath);
    return { success: true };
  } catch (error: any) {
    console.error('[Threads] Failed to delete thread:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// IPC Handlers - MCP (using SDK)
// ========================================

ipcMain.handle('mcp:start-server', async (_event, server: any) => {
  const { id, command, args, env, httpUrl, oauthConfig } = server;

  // Handle OAuth token refresh if needed
  if (oauthConfig && needsTokenRefresh(oauthConfig)) {
    try {
      const newTokens = await refreshAccessToken(oauthConfig);
      oauthConfig.accessToken = newTokens.access_token;
      if (newTokens.refresh_token) {
        oauthConfig.refreshToken = newTokens.refresh_token;
      }
      if (newTokens.expires_in) {
        oauthConfig.tokenExpiresAt = Date.now() + newTokens.expires_in * 1000;
      }
    } catch (error: any) {
      console.error(`[MCP] Token refresh failed for ${id}:`, error);
      return { success: false, error: `Token refresh failed: ${error.message}`, authRequired: true };
    }
  }

  // Inject OAuth token into environment if available
  const finalEnv = { ...env };
  if (oauthConfig?.accessToken) {
    finalEnv.OAUTH_ACCESS_TOKEN = oauthConfig.accessToken;
    finalEnv.ACCESS_TOKEN = oauthConfig.accessToken;
    finalEnv.TOKEN = oauthConfig.accessToken;
  }

  return mcpSDKManager.startServer({
    id,
    name: server.name || id,
    command,
    args,
    env: finalEnv,
    httpUrl,
    oauthConfig,
  });
});

ipcMain.handle('mcp:stop-server', async (_event, serverId: string) => {
  return mcpSDKManager.stopServer(serverId);
});

ipcMain.handle('mcp:list-tools', async (_event, serverId: string) => {
  return mcpSDKManager.listTools(serverId);
});

ipcMain.handle('mcp:get-capabilities', async (_event, serverId: string) => {
  return mcpSDKManager.getCapabilities(serverId);
});

ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: any) => {
  return mcpSDKManager.callTool(serverId, toolName, args);
});

ipcMain.handle('mcp:list-prompts', async (_event, serverId: string) => {
  return mcpSDKManager.listPrompts(serverId);
});

ipcMain.handle('mcp:get-prompt', async (_event, serverId: string, promptName: string, args?: any) => {
  return mcpSDKManager.getPrompt(serverId, promptName, args);
});

ipcMain.handle('mcp:read-resource', async (_event, serverId: string, uri: string) => {
  return mcpSDKManager.readResource(serverId, uri);
});

ipcMain.handle('mcp:get-server-state', async (_event, serverId: string) => {
  return { success: true, state: mcpSDKManager.getServerState(serverId) };
});

ipcMain.handle('mcp:get-all-server-states', async () => {
  return { success: true, states: mcpSDKManager.getAllServerStates() };
});

// ========================================
// IPC Handlers - OAuth
// ========================================

ipcMain.handle('mcp:start-oauth', async (_event, serverId: string, oauthConfig: MCPOAuthConfig) => {
  try {
    const result = await startOAuthFlow(serverId, oauthConfig);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp:exchange-oauth-code', async (_event, code: string, state: string, oauthConfig: MCPOAuthConfig) => {
  try {
    const oauthState = getOAuthState(state);
    if (!oauthState) {
      return { success: false, error: 'Invalid or expired OAuth state' };
    }

    const tokens = await exchangeCodeForTokens(code, oauthState.codeVerifier, oauthConfig);
    return {
      success: true,
      tokens,
      serverId: oauthState.serverId,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
