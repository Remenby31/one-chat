import { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

// MCP Server process management
interface MCPServerProcess {
  id: string;
  process: ChildProcess;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  messageId: number;
  pendingRequests: Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>;
}

type MCPLogType = 'stdout' | 'stderr' | 'error' | 'jsonrpc' | 'system';

interface MCPLogEntry {
  id: string;
  serverId: string;
  type: MCPLogType;
  message: string;
  timestamp: number;
  data?: any;
}

class MCPProcessManager {
  private processes: Map<string, MCPServerProcess> = new Map();
  private logs: Map<string, MCPLogEntry[]> = new Map();
  private readonly MAX_LOGS_PER_SERVER = 1000;
  private logIdCounter = 0;

  private addLog(serverId: string, type: MCPLogType, message: string, data?: any): void {
    const logEntry: MCPLogEntry = {
      id: `${serverId}-${this.logIdCounter++}`,
      serverId,
      type,
      message,
      timestamp: Date.now(),
      data,
    };

    // Get or create log array for this server
    if (!this.logs.has(serverId)) {
      this.logs.set(serverId, []);
    }

    const serverLogs = this.logs.get(serverId)!;
    serverLogs.push(logEntry);

    // Maintain circular buffer
    if (serverLogs.length > this.MAX_LOGS_PER_SERVER) {
      serverLogs.shift();
    }

    // Emit log to renderer in real-time
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp:log', logEntry);
    }
  }

  getLogs(serverId: string): MCPLogEntry[] {
    return this.logs.get(serverId) || [];
  }

  clearLogs(serverId: string): void {
    this.logs.set(serverId, []);
  }

  startServer(server: any): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      try {
        const { id, command, args, env } = server;

        // Check if already running
        if (this.processes.has(id)) {
          return resolve({ success: false, error: 'Server already running' });
        }

        console.log(`[MCP] Starting server ${id}: ${command} ${args.join(' ')}`);
        this.addLog(id, 'system', `Starting server: ${command} ${args.join(' ')}`);

        // Capture stderr for error reporting
        let stderrBuffer = '';
        let hasResolved = false;

        // On Windows, resolve full path to npx and prepare command
        let resolvedCommand = command;
        let resolvedArgs = args;

        if (command === 'npx' && process.platform === 'win32') {
          // Try to find npx.cmd in common locations
          const npmPaths = [
            'C:\\Program Files\\nodejs\\npx.cmd',
            path.join(process.env.APPDATA || '', 'npm', 'npx.cmd'),
            path.join(process.env.ProgramFiles || '', 'nodejs', 'npx.cmd'),
            'C:\\Program Files (x86)\\nodejs\\npx.cmd',
          ];

          let foundNpx = false;
          for (const npmPath of npmPaths) {
            try {
              const fs = require('fs');
              if (npmPath && fs.existsSync(npmPath)) {
                console.log(`[MCP] Found npx at: ${npmPath}`);
                // Use cmd.exe to run .cmd files on Windows
                resolvedCommand = 'cmd.exe';
                resolvedArgs = ['/c', npmPath, ...args];
                foundNpx = true;
                break;
              }
            } catch (e) {
              // Continue searching
            }
          }

          if (!foundNpx) {
            console.log(`[MCP] Warning: Could not find npx.cmd in standard locations, using npx directly`);
            // Fallback: just use 'npx' and hope it's in PATH
            resolvedCommand = 'npx';
            resolvedArgs = args;
          }
        }

        console.log(`[MCP] Executing: ${resolvedCommand} ${resolvedArgs.join(' ')}`);

        // Spawn the process
        const childProcess = spawn(resolvedCommand, resolvedArgs, {
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (!childProcess.stdin || !childProcess.stdout || !childProcess.stderr) {
          return resolve({ success: false, error: 'Failed to create stdio pipes' });
        }

        const serverProcess: MCPServerProcess = {
          id,
          process: childProcess,
          stdin: childProcess.stdin,
          stdout: childProcess.stdout,
          stderr: childProcess.stderr,
          messageId: 1,
          pendingRequests: new Map(),
        };

        this.processes.set(id, serverProcess);

        // Handle stdout (JSON-RPC responses)
        let buffer = '';
        childProcess.stdout.on('data', (data) => {
          const text = data.toString();
          buffer += text;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                this.addLog(id, 'jsonrpc', line, message);
                this.handleMessage(id, message);
              } catch (error) {
                // Not JSON, treat as regular stdout
                console.error(`[MCP ${id}] Failed to parse message:`, line, error);
                this.addLog(id, 'stdout', line);
              }
            }
          }
        });

        // Handle stderr (logs and errors)
        childProcess.stderr.on('data', (data) => {
          const text = data.toString();
          stderrBuffer += text;
          console.log(`[MCP ${id}] stderr:`, text);
          this.addLog(id, 'stderr', text.trim());
        });

        // Handle process exit
        childProcess.on('exit', (code) => {
          console.log(`[MCP ${id}] Process exited with code ${code}`);
          this.addLog(id, 'system', `Process exited with code ${code}`);
          this.processes.delete(id);

          // Notify renderer that process exited
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mcp:server-exited', { serverId: id, exitCode: code });
          }

          // If process exits early with error code and we haven't resolved yet
          if (!hasResolved && code !== 0) {
            hasResolved = true;
            const errorMsg = stderrBuffer.trim() || `Process exited with code ${code}`;
            this.addLog(id, 'error', errorMsg);
            resolve({ success: false, error: errorMsg });
          }
        });

        childProcess.on('error', (error: any) => {
          console.error(`[MCP ${id}] Process error:`, error);
          this.addLog(id, 'error', error.message, error);
          this.processes.delete(id);

          if (!hasResolved) {
            hasResolved = true;

            // Provide helpful error message for ENOENT (command not found)
            if (error.code === 'ENOENT') {
              const errorMsg = `Command not found: ${command}\n\nMake sure Node.js and npm are installed and in your PATH.\nYou can verify by running 'node --version' and 'npm --version' in a terminal.`;
              this.addLog(id, 'error', errorMsg);
              resolve({ success: false, error: errorMsg });
            } else {
              resolve({ success: false, error: error.message });
            }
          }
        });

        // Wait a bit to see if process starts successfully
        setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            if (this.processes.has(id)) {
              this.addLog(id, 'system', 'Server started successfully');
              resolve({ success: true });
            } else {
              const errorMsg = stderrBuffer.trim() || 'Process failed to start';
              this.addLog(id, 'error', errorMsg);
              resolve({ success: false, error: errorMsg });
            }
          }
        }, 1000);
      } catch (error: any) {
        resolve({ success: false, error: error.message });
      }
    });
  }

  stopServer(serverId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const serverProcess = this.processes.get(serverId);

      if (!serverProcess) {
        return resolve({ success: false, error: 'Server not running' });
      }

      try {
        this.addLog(serverId, 'system', 'Stopping server...');
        serverProcess.process.kill();
        this.processes.delete(serverId);
        this.addLog(serverId, 'system', 'Server stopped successfully');
        resolve({ success: true });
      } catch (error: any) {
        this.addLog(serverId, 'error', `Failed to stop server: ${error.message}`);
        resolve({ success: false, error: error.message });
      }
    });
  }

  async sendRequest(serverId: string, method: string, params?: any): Promise<any> {
    const serverProcess = this.processes.get(serverId);

    if (!serverProcess) {
      throw new Error('Server not running');
    }

    return new Promise((resolve, reject) => {
      const id = serverProcess.messageId++;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params: params || {},
      };

      serverProcess.pendingRequests.set(id, { resolve, reject });

      // Send the request
      const messageStr = JSON.stringify(message) + '\n';
      serverProcess.stdin.write(messageStr);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (serverProcess.pendingRequests.has(id)) {
          serverProcess.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private handleMessage(serverId: string, message: any): void {
    const serverProcess = this.processes.get(serverId);
    if (!serverProcess) return;

    // Handle response to a request
    if (message.id !== undefined) {
      const pending = serverProcess.pendingRequests.get(message.id);
      if (pending) {
        serverProcess.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          pending.resolve(message.result);
        }
      }
    }

    // Handle notification (no response expected)
    if (message.method) {
      console.log(`[MCP ${serverId}] Notification:`, message.method, message.params);
    }
  }

  stopAll(): void {
    for (const [id, serverProcess] of this.processes.entries()) {
      try {
        serverProcess.process.kill();
      } catch (error) {
        console.error(`Failed to kill process ${id}:`, error);
      }
    }
    this.processes.clear();
  }
}

const mcpProcessManager = new MCPProcessManager();

// ========================================
// Custom Protocol Handler (jarvis://)
// ========================================

// Register protocol as standard scheme
protocol.registerSchemesAsPrivileged([
  { scheme: 'jarvis', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Set as default protocol client (for OAuth redirects)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('jarvis', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('jarvis');
}

// Handle deep links
function handleDeepLink(url: string) {
  console.log('[Protocol] Deep link received:', url);

  // Send URL to renderer via IPC
  if (mainWindow) {
    mainWindow.webContents.send('oauth:callback', url);
  }
}

// Single instance lock (capture deep links in running instance)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Protocol] Another instance is running, quitting...');
  app.quit();
} else {
  // Someone tried to run a second instance
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Protocol] Second instance detected, focusing main window');

    // Focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Look for jarvis:// URL in command line args
      const url = commandLine.find(arg => arg.startsWith('jarvis://'));
      if (url) {
        handleDeepLink(url);
      }
    }
  });

  // macOS: protocol opened via open-url event
  app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('[Protocol] open-url event:', url);
    handleDeepLink(url);
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  console.log('[main.ts] Loading preload from:', preloadPath);
  console.log('[main.ts] __dirname:', __dirname);

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
      devTools: true, // Explicitly enable DevTools
      webSecurity: false // Disable web security to allow HTTPS API calls
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    backgroundColor: '#1e1e1e',
    show: false
  });

  // Remove application menu (no menu bar)
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Inject permissive CSP to allow external API calls
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {}

    // Remove any existing CSP headers
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']

    // Add permissive CSP that allows everything
    headers['Content-Security-Policy'] = ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *"]

    callback({ responseHeaders: headers })
  })

  // Development vs Production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools automatically in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // FORCE: Always open DevTools (for debugging)
  mainWindow.webContents.openDevTools();

  // Add keyboard shortcut to toggle DevTools (F12)
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
  });
}

// Thread management IPC handlers
ipcMain.handle('thread:list', async () => {
  try {
    const configDir = await ensureConfigDirectory();
    const conversationsDir = path.join(configDir, 'conversations');

    // Ensure conversations directory exists
    try {
      await fs.access(conversationsDir);
    } catch {
      await fs.mkdir(conversationsDir, { recursive: true });
      return []; // No conversations yet
    }

    // List all thread files
    const files = await fs.readdir(conversationsDir);
    const threadFiles = files.filter(f => f.startsWith('thread_') && f.endsWith('.json'));

    console.log(`[Threads] Found ${threadFiles.length} thread files`);
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
    console.log(`[Threads] Deleted thread file: ${filename}`);
    return { success: true };
  } catch (error: any) {
    console.error('[Threads] Failed to delete thread:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  // Register custom protocol handler
  protocol.handle('jarvis', (request) => {
    const url = request.url;
    console.log('[Protocol] Protocol handler called:', url);
    handleDeepLink(url);
    // Return a simple response
    return new Response('OAuth callback received', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    });
  });

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

// Open external URL (for OAuth flows)
ipcMain.handle('app:open-external', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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

  // Handle subdirectories (e.g., conversations/thread_xxx.json)
  const filePath = path.join(configDir, filename);
  const fileDir = path.dirname(filePath);

  // Ensure directory exists
  try {
    await fs.access(fileDir);
  } catch {
    await fs.mkdir(fileDir, { recursive: true });
  }

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
});

// Export configuration
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

  console.log('DEBUG: All process.env keys:', Object.keys(process.env));
  console.log('DEBUG: Looking for keys matching:', relevantPrefixes);

  for (const [key, value] of Object.entries(process.env)) {
    if (value && relevantPrefixes.some(prefix => key.toUpperCase().includes(prefix))) {
      console.log('DEBUG: Found matching env var:', key);
      envVars[key] = value;
    }
  }

  console.log('DEBUG: Returning env vars:', Object.keys(envVars));
  return envVars;
});

// Fetch models from API endpoint
ipcMain.handle('api:fetch-models', async (_event, baseURL: string, apiKey: string) => {
  try {
    // Resolve environment variable if needed
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

    // OpenAI format: { data: [{ id: "gpt-4", ... }] }
    if (data.data && Array.isArray(data.data)) {
      return { success: true, models: data.data.map((m: any) => m.id) };
    }

    return { success: false, error: 'Invalid response format' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Note: Chat completion is now handled directly via fetch() in the frontend
// No IPC handler needed thanks to permissive CSP

// MCP Server IPC handlers
ipcMain.handle('mcp:start-server', async (_event, server: any) => {
  return await mcpProcessManager.startServer(server);
});

ipcMain.handle('mcp:stop-server', async (_event, serverId: string) => {
  return await mcpProcessManager.stopServer(serverId);
});

ipcMain.handle('mcp:list-tools', async (_event, serverId: string) => {
  try {
    const result = await mcpProcessManager.sendRequest(serverId, 'tools/list');
    return { success: true, tools: result.tools || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp:get-capabilities', async (_event, serverId: string) => {
  try {
    // Get tools
    const toolsResult = await mcpProcessManager.sendRequest(serverId, 'tools/list');

    // Get resources (if supported)
    let resources = [];
    try {
      const resourcesResult = await mcpProcessManager.sendRequest(serverId, 'resources/list');
      resources = resourcesResult.resources || [];
    } catch (error) {
      // Resources not supported
    }

    // Get prompts (if supported)
    let prompts = [];
    try {
      const promptsResult = await mcpProcessManager.sendRequest(serverId, 'prompts/list');
      prompts = promptsResult.prompts || [];
    } catch (error) {
      // Prompts not supported
    }

    return {
      success: true,
      capabilities: {
        tools: toolsResult.tools || [],
        resources,
        prompts,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: any) => {
  try {
    const result = await mcpProcessManager.sendRequest(serverId, 'tools/call', {
      name: toolName,
      arguments: args,
    });
    return { success: true, result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// MCP Logs IPC handlers
ipcMain.handle('mcp:get-logs', async (_event, serverId: string) => {
  try {
    const logs = mcpProcessManager.getLogs(serverId);
    return { success: true, logs };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp:clear-logs', async (_event, serverId: string) => {
  try {
    mcpProcessManager.clearLogs(serverId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Read Claude Desktop config file
ipcMain.handle('mcp:import-claude-desktop', async () => {
  try {
    // Determine config path based on platform
    let configPath: string;
    if (process.platform === 'win32') {
      // Windows: %APPDATA%\Claude\claude_desktop_config.json
      const appData = process.env.APPDATA;
      if (!appData) {
        return { success: false, error: 'APPDATA environment variable not found' };
      }
      configPath = path.join(appData, 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      // macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
      const home = process.env.HOME || app.getPath('home');
      configPath = path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      // Linux: ~/.config/Claude/claude_desktop_config.json
      const home = process.env.HOME || app.getPath('home');
      configPath = path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    }

    console.log('[MCP] Attempting to read Claude Desktop config from:', configPath);

    // Check if file exists
    try {
      await fs.access(configPath);
    } catch {
      return { success: false, error: 'Claude Desktop config file not found', notFound: true };
    }

    // Read and parse config
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    return { success: true, config };
  } catch (error: any) {
    console.error('[MCP] Failed to import Claude Desktop config:', error);
    return { success: false, error: error.message };
  }
});

// Stop all MCP servers when app is quitting
app.on('before-quit', () => {
  console.log('[MCP] Stopping all servers...');
  mcpProcessManager.stopAll();
});