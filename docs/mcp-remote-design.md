# MCP Remote Environments Architecture Design

## Types et Interfaces

```typescript
// ============================================
// Core Types
// ============================================

/**
 * Remote context configuration
 * Describes where and how to execute operations
 */
interface RemoteContext {
  type: 'local' | 'wsl' | 'ssh';

  // Working directory (context-specific path)
  workingDirectory?: string;

  // WSL-specific configuration
  wsl?: {
    distribution: string; // e.g., "Ubuntu", "Ubuntu-22.04"
    userName?: string;    // Linux username (if different from Windows user)
  };

  // SSH-specific configuration
  ssh?: {
    host: string;
    port?: number;        // Default: 22
    user: string;

    // Authentication (mutually exclusive)
    auth: {
      type: 'key' | 'password' | 'agent';
      keyPath?: string;         // Path to private key file
      password?: string;        // Plain password (not recommended)
      passphrase?: string;      // Key passphrase if needed
    };

    // Connection options
    keepaliveInterval?: number; // Milliseconds, default: 10000
    keepaliveCountMax?: number; // Default: 3
    connectTimeout?: number;    // Milliseconds, default: 30000

    // Advanced options
    strictHostKeyChecking?: boolean; // Default: true
    knownHostsPath?: string;         // Path to known_hosts file

    // Connection pooling
    pooled?: boolean;     // Reuse connections, default: true
    maxPoolSize?: number; // Default: 5
  };
}

/**
 * Result of a command execution
 */
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number; // milliseconds
}

/**
 * Options for command execution
 */
interface ExecutionOptions {
  cwd?: string;                    // Working directory
  env?: Record<string, string>;    // Environment variables
  timeout?: number;                // Milliseconds
  encoding?: BufferEncoding;       // Default: 'utf8'
  maxBuffer?: number;              // Max stdout/stderr size
  pty?: boolean;                   // Allocate pseudo-terminal (for interactive commands)
  streamOutput?: boolean;          // Stream output in real-time
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

/**
 * File operation result
 */
interface FileOperationResult {
  success: boolean;
  bytesTransferred?: number;
  error?: string;
}

/**
 * File metadata
 */
interface FileStats {
  size: number;
  mode: number;
  uid: number;
  gid: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

// ============================================
// Remote Executor Interface
// ============================================

/**
 * Abstract interface for remote execution
 * All executors (Local, WSL, SSH) implement this
 */
interface IRemoteExecutor {
  /**
   * Initialize the executor and establish connections
   */
  initialize(): Promise<void>;

  /**
   * Clean up resources and close connections
   */
  dispose(): Promise<void>;

  /**
   * Test if the executor is ready to use
   */
  isReady(): Promise<boolean>;

  // ============================================
  // File Operations
  // ============================================

  /**
   * Read file contents
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;

  /**
   * Write file contents
   */
  writeFile(path: string, content: string | Buffer): Promise<FileOperationResult>;

  /**
   * Check if file/directory exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file metadata
   */
  stat(path: string): Promise<FileStats>;

  /**
   * List directory contents
   */
  readdir(path: string): Promise<string[]>;

  /**
   * Create directory (recursive)
   */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /**
   * Delete file or directory
   */
  remove(path: string, recursive?: boolean): Promise<void>;

  // ============================================
  // Command Execution
  // ============================================

  /**
   * Execute a command
   */
  exec(command: string, options?: ExecutionOptions): Promise<ExecutionResult>;

  /**
   * Execute a command with streaming output
   */
  execStreaming(
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult>;

  // ============================================
  // Path Operations
  // ============================================

  /**
   * Resolve path to absolute path in the remote context
   */
  resolvePath(path: string): Promise<string>;

  /**
   * Convert local path to remote path (if applicable)
   */
  toRemotePath(localPath: string): string;

  /**
   * Convert remote path to local path (if applicable)
   */
  toLocalPath(remotePath: string): string;

  // ============================================
  // Advanced Operations
  // ============================================

  /**
   * Find files matching glob pattern
   */
  glob(pattern: string, cwd?: string): Promise<string[]>;

  /**
   * Search file contents using grep
   */
  grep(
    pattern: string,
    options?: {
      path?: string;
      recursive?: boolean;
      ignoreCase?: boolean;
      filesOnly?: boolean;
    }
  ): Promise<Array<{ file: string; line: number; content: string }>>;
}
```

## 2. Local Executor (Baseline)

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { glob as globSync } from 'glob';
import { promisify as promisifyGlob } from 'util';

const execAsync = promisify(execCallback);
const globAsync = promisifyGlob(globSync);

/**
 * Local filesystem and command executor
 * Baseline implementation for Windows/macOS/Linux
 */
class LocalExecutor implements IRemoteExecutor {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  async initialize(): Promise<void> {
    // Nothing to initialize for local executor
  }

  async dispose(): Promise<void> {
    // Nothing to dispose for local executor
  }

  async isReady(): Promise<boolean> {
    return true;
  }

  // ============================================
  // File Operations
  // ============================================

  async readFile(
    filePath: string,
    encoding: BufferEncoding = 'utf8'
  ): Promise<string | Buffer> {
    const absolutePath = this.resolvePath(filePath);

    if (encoding) {
      return await fs.readFile(absolutePath, encoding);
    }
    return await fs.readFile(absolutePath);
  }

  async writeFile(
    filePath: string,
    content: string | Buffer
  ): Promise<FileOperationResult> {
    try {
      const absolutePath = this.resolvePath(filePath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });

      await fs.writeFile(absolutePath, content);

      const stats = await fs.stat(absolutePath);
      return {
        success: true,
        bytesTransferred: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<FileStats> {
    const stats = await fs.stat(this.resolvePath(filePath));
    return {
      size: stats.size,
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid,
      atime: stats.atime,
      mtime: stats.mtime,
      ctime: stats.ctime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink()
    };
  }

  async readdir(dirPath: string): Promise<string[]> {
    return await fs.readdir(this.resolvePath(dirPath));
  }

  async mkdir(dirPath: string, recursive: boolean = true): Promise<void> {
    await fs.mkdir(this.resolvePath(dirPath), { recursive });
  }

  async remove(targetPath: string, recursive: boolean = false): Promise<void> {
    const absolutePath = this.resolvePath(targetPath);
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      await fs.rm(absolutePath, { recursive, force: true });
    } else {
      await fs.unlink(absolutePath);
    }
  }

  // ============================================
  // Command Execution
  // ============================================

  async exec(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.cwd || this.workingDirectory,
        env: { ...process.env, ...options.env },
        timeout: options.timeout,
        encoding: options.encoding || 'utf8',
        maxBuffer: options.maxBuffer || 1024 * 1024 * 10 // 10MB default
      });

      return {
        stdout: stdout as string,
        stderr: stderr as string,
        exitCode: 0,
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        executionTime: Date.now() - startTime
      };
    }
  }

  async execStreaming(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const startTime = Date.now();

      const proc = spawn(command, {
        cwd: options.cwd || this.workingDirectory,
        env: { ...process.env, ...options.env },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString(options.encoding || 'utf8');
        stdout += text;
        options.onStdout?.(text);
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString(options.encoding || 'utf8');
        stderr += text;
        options.onStderr?.(text);
      });

      proc.on('close', (exitCode: number) => {
        resolve({
          stdout,
          stderr,
          exitCode: exitCode || 0,
          executionTime: Date.now() - startTime
        });
      });

      proc.on('error', (error: Error) => {
        reject(error);
      });

      if (options.timeout) {
        setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout);
      }
    });
  }

  // ============================================
  // Path Operations
  // ============================================

  resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workingDirectory, filePath);
  }

  toRemotePath(localPath: string): string {
    return localPath; // No conversion needed for local
  }

  toLocalPath(remotePath: string): string {
    return remotePath; // No conversion needed for local
  }

  // ============================================
  // Advanced Operations
  // ============================================

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    return await globAsync(pattern, {
      cwd: cwd || this.workingDirectory,
      absolute: true,
      nodir: false
    }) as string[];
  }

  async grep(
    pattern: string,
    options: {
      path?: string;
      recursive?: boolean;
      ignoreCase?: boolean;
      filesOnly?: boolean;
    } = {}
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const { default: ripgrep } = await import('@vscode/ripgrep');
    const { spawn } = require('child_process');

    const args = [
      '--json',
      pattern
    ];

    if (options.ignoreCase) args.push('-i');
    if (!options.recursive) args.push('--max-depth', '1');
    if (options.filesOnly) args.push('-l');

    return new Promise((resolve, reject) => {
      const proc = spawn(ripgrep, args, {
        cwd: options.path || this.workingDirectory
      });

      const results: Array<{ file: string; line: number; content: string }> = [];
      let buffer = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            if (data.type === 'match') {
              results.push({
                file: data.data.path.text,
                line: data.data.line_number,
                content: data.data.lines.text
              });
            }
          } catch {
            // Ignore parse errors
          }
        }
      });

      proc.on('close', (code: number) => {
        // ripgrep returns 1 when no matches found
        if (code === 0 || code === 1) {
          resolve(results);
        } else {
          reject(new Error(`ripgrep exited with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }
}
```

## 3. WSL Executor

```typescript
import * as path from 'path';
import { exec as execCallback, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(execCallback);

/**
 * WSL-specific utilities
 */
class WSLUtils {
  /**
   * Check if WSL is available
   */
  static async isAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') return false;

    try {
      await execAsync('wsl --status');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available WSL distributions
   */
  static async listDistributions(): Promise<Array<{
    name: string;
    state: 'Running' | 'Stopped';
    version: number;
    default: boolean;
  }>> {
    const { stdout } = await execAsync('wsl --list --verbose');

    // Parse wsl -l -v output
    const lines = stdout.split('\n').slice(1); // Skip header
    const distributions = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Format: "  * Ubuntu            Running         2"
      const match = line.match(/^\s*(\*)?\s*(\S+)\s+(Running|Stopped)\s+(\d+)/);
      if (match) {
        distributions.push({
          name: match[2],
          state: match[3] as 'Running' | 'Stopped',
          version: parseInt(match[4]),
          default: !!match[1]
        });
      }
    }

    return distributions;
  }

  /**
   * Convert Windows path to WSL path
   * C:\Users\john\file.txt -> /mnt/c/Users/john/file.txt
   */
  static toWSLPath(windowsPath: string): string {
    // Handle UNC paths (\\wsl$\Ubuntu\...)
    if (windowsPath.startsWith('\\\\wsl$\\')) {
      const parts = windowsPath.split('\\').filter(Boolean);
      parts.shift(); // Remove 'wsl$'
      parts.shift(); // Remove distribution name
      return '/' + parts.join('/');
    }

    // Handle regular Windows paths
    const normalized = path.normalize(windowsPath);

    // Extract drive letter and path
    const match = normalized.match(/^([A-Z]):[\\\/](.*)$/i);
    if (match) {
      const drive = match[1].toLowerCase();
      const pathPart = match[2].replace(/\\/g, '/');
      return `/mnt/${drive}/${pathPart}`;
    }

    // Already a Unix-style path
    return normalized.replace(/\\/g, '/');
  }

  /**
   * Convert WSL path to Windows path
   * /mnt/c/Users/john/file.txt -> C:\Users\john\file.txt
   */
  static toWindowsPath(wslPath: string, distribution: string): string {
    // Handle /mnt/c/... paths
    const mountMatch = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
    if (mountMatch) {
      const drive = mountMatch[1].toUpperCase();
      const pathPart = mountMatch[2].replace(/\//g, '\\');
      return `${drive}:\\${pathPart}`;
    }

    // Use \\wsl$\distribution\path format
    return `\\\\wsl$\\${distribution}${wslPath.replace(/\//g, '\\')}`;
  }

  /**
   * Escape argument for bash command
   */
  static escapeArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}

/**
 * WSL Executor
 * Executes operations in Windows Subsystem for Linux
 */
class WSLExecutor implements IRemoteExecutor {
  private distribution: string;
  private workingDirectory: string;
  private userName?: string;

  constructor(config: RemoteContext['wsl'], workingDirectory?: string) {
    if (!config) {
      throw new Error('WSL configuration required');
    }

    this.distribution = config.distribution;
    this.userName = config.userName;
    this.workingDirectory = workingDirectory || '/home/' + (this.userName || process.env.USER || 'user');
  }

  async initialize(): Promise<void> {
    // Check if WSL is available
    if (!await WSLUtils.isAvailable()) {
      throw new Error('WSL is not available on this system');
    }

    // Check if distribution exists
    const distros = await WSLUtils.listDistributions();
    const exists = distros.some(d => d.name === this.distribution);

    if (!exists) {
      throw new Error(`WSL distribution '${this.distribution}' not found. Available: ${distros.map(d => d.name).join(', ')}`);
    }
  }

  async dispose(): Promise<void> {
    // Nothing to dispose for WSL
  }

  async isReady(): Promise<boolean> {
    try {
      const result = await this.exec('echo "ready"');
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Build WSL command with distribution and user
   */
  private buildWSLCommand(command: string, cwd?: string): string {
    const parts = ['wsl', '-d', this.distribution];

    if (this.userName) {
      parts.push('-u', this.userName);
    }

    // Set working directory using cd
    if (cwd) {
      const wslCwd = this.toRemotePath(cwd);
      command = `cd ${WSLUtils.escapeArg(wslCwd)} && ${command}`;
    } else if (this.workingDirectory) {
      command = `cd ${WSLUtils.escapeArg(this.workingDirectory)} && ${command}`;
    }

    parts.push('bash', '-c', WSLUtils.escapeArg(command));

    return parts.join(' ');
  }

  // ============================================
  // File Operations
  // ============================================

  async readFile(
    filePath: string,
    encoding: BufferEncoding = 'utf8'
  ): Promise<string | Buffer> {
    const wslPath = this.toRemotePath(filePath);

    // Use cat to read file
    const command = this.buildWSLCommand(`cat ${WSLUtils.escapeArg(wslPath)}`);

    const result = await execAsync(command, {
      encoding: encoding,
      maxBuffer: 1024 * 1024 * 50 // 50MB
    });

    if (result.stderr) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return result.stdout;
  }

  async writeFile(
    filePath: string,
    content: string | Buffer
  ): Promise<FileOperationResult> {
    try {
      const wslPath = this.toRemotePath(filePath);

      // Create directory if needed
      const dirPath = path.posix.dirname(wslPath);
      await this.exec(`mkdir -p ${WSLUtils.escapeArg(dirPath)}`);

      // Use cat to write file via stdin
      const command = this.buildWSLCommand(`cat > ${WSLUtils.escapeArg(wslPath)}`);

      return new Promise((resolve, reject) => {
        const proc = spawn('cmd', ['/c', command], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';

        proc.stderr?.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              bytesTransferred: Buffer.byteLength(content)
            });
          } else {
            resolve({
              success: false,
              error: stderr || `Exit code ${code}`
            });
          }
        });

        proc.on('error', (error) => {
          reject(error);
        });

        // Write content to stdin
        proc.stdin?.write(content);
        proc.stdin?.end();
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const wslPath = this.toRemotePath(filePath);
    const result = await this.exec(`test -e ${WSLUtils.escapeArg(wslPath)}`);
    return result.exitCode === 0;
  }

  async stat(filePath: string): Promise<FileStats> {
    const wslPath = this.toRemotePath(filePath);

    // Use stat command with format string
    const command = `stat -c '%s %f %u %g %X %Y %Z %F' ${WSLUtils.escapeArg(wslPath)}`;
    const result = await this.exec(command);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to stat file: ${result.stderr}`);
    }

    const parts = result.stdout.trim().split(' ');
    const fileType = parts.slice(7).join(' ');

    return {
      size: parseInt(parts[0]),
      mode: parseInt(parts[1], 16),
      uid: parseInt(parts[2]),
      gid: parseInt(parts[3]),
      atime: new Date(parseInt(parts[4]) * 1000),
      mtime: new Date(parseInt(parts[5]) * 1000),
      ctime: new Date(parseInt(parts[6]) * 1000),
      isFile: fileType === 'regular file',
      isDirectory: fileType === 'directory',
      isSymbolicLink: fileType === 'symbolic link'
    };
  }

  async readdir(dirPath: string): Promise<string[]> {
    const wslPath = this.toRemotePath(dirPath);
    const result = await this.exec(`ls -1 ${WSLUtils.escapeArg(wslPath)}`);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read directory: ${result.stderr}`);
    }

    return result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  async mkdir(dirPath: string, recursive: boolean = true): Promise<void> {
    const wslPath = this.toRemotePath(dirPath);
    const flag = recursive ? '-p' : '';
    const result = await this.exec(`mkdir ${flag} ${WSLUtils.escapeArg(wslPath)}`);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${result.stderr}`);
    }
  }

  async remove(targetPath: string, recursive: boolean = false): Promise<void> {
    const wslPath = this.toRemotePath(targetPath);
    const flag = recursive ? '-rf' : '-f';
    const result = await this.exec(`rm ${flag} ${WSLUtils.escapeArg(wslPath)}`);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove: ${result.stderr}`);
    }
  }

  // ============================================
  // Command Execution
  // ============================================

  async exec(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const wslCommand = this.buildWSLCommand(command, options.cwd);

    try {
      // Set up environment variables
      let finalCommand = wslCommand;
      if (options.env) {
        const envVars = Object.entries(options.env)
          .map(([key, value]) => `${key}=${WSLUtils.escapeArg(value)}`)
          .join(' ');

        finalCommand = this.buildWSLCommand(
          `${envVars} ${command}`,
          options.cwd
        );
      }

      const result = await execAsync(finalCommand, {
        encoding: options.encoding || 'utf8',
        timeout: options.timeout,
        maxBuffer: options.maxBuffer || 1024 * 1024 * 10
      });

      return {
        stdout: result.stdout as string,
        stderr: result.stderr as string,
        exitCode: 0,
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        executionTime: Date.now() - startTime
      };
    }
  }

  async execStreaming(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const wslCommand = this.buildWSLCommand(command, options.cwd);

      const proc = spawn('cmd', ['/c', wslCommand], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options.env ? { ...process.env, ...options.env } : process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString(options.encoding || 'utf8');
        stdout += text;
        options.onStdout?.(text);
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString(options.encoding || 'utf8');
        stderr += text;
        options.onStderr?.(text);
      });

      proc.on('close', (exitCode: number) => {
        resolve({
          stdout,
          stderr,
          exitCode: exitCode || 0,
          executionTime: Date.now() - startTime
        });
      });

      proc.on('error', reject);

      if (options.timeout) {
        setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout);
      }
    });
  }

  // ============================================
  // Path Operations
  // ============================================

  resolvePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath;
    }
    return path.posix.join(this.workingDirectory, filePath);
  }

  toRemotePath(localPath: string): string {
    // If already a Unix path, return as-is
    if (localPath.startsWith('/')) {
      return localPath;
    }

    // Convert Windows path to WSL path
    return WSLUtils.toWSLPath(localPath);
  }

  toLocalPath(remotePath: string): string {
    return WSLUtils.toWindowsPath(remotePath, this.distribution);
  }

  // ============================================
  // Advanced Operations
  // ============================================

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    const wslCwd = cwd ? this.toRemotePath(cwd) : this.workingDirectory;

    // Use find command with pattern matching
    const command = `cd ${WSLUtils.escapeArg(wslCwd)} && find . -path ${WSLUtils.escapeArg(pattern)} -type f`;
    const result = await this.exec(command);

    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => path.posix.join(wslCwd, line.replace(/^\.\//, '')));
  }

  async grep(
    pattern: string,
    options: {
      path?: string;
      recursive?: boolean;
      ignoreCase?: boolean;
      filesOnly?: boolean;
    } = {}
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const searchPath = options.path
      ? this.toRemotePath(options.path)
      : this.workingDirectory;

    // Build grep command
    const flags = [
      '-n', // Line numbers
      options.ignoreCase ? '-i' : '',
      options.recursive ? '-r' : '',
      options.filesOnly ? '-l' : ''
    ].filter(Boolean).join(' ');

    const command = `grep ${flags} ${WSLUtils.escapeArg(pattern)} ${WSLUtils.escapeArg(searchPath)} 2>/dev/null || true`;
    const result = await this.exec(command);

    const results: Array<{ file: string; line: number; content: string }> = [];

    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;

      // Format: "file:line:content" or "file:line" for -l
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        results.push({
          file: match[1],
          line: parseInt(match[2]),
          content: match[3]
        });
      }
    }

    return results;
  }
}
```

## 4. SSH Executor

```typescript
import { Client as SSHClient, ConnectConfig, SFTPWrapper } from 'ssh2';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * SSH Connection Pool
 * Manages reusable SSH connections for performance
 */
class SSHConnectionPool {
  private pools = new Map<string, SSHClient[]>();
  private maxPoolSize: number;

  constructor(maxPoolSize: number = 5) {
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Get connection key for pooling
   */
  private getKey(config: ConnectConfig): string {
    return `${config.username}@${config.host}:${config.port || 22}`;
  }

  /**
   * Acquire connection from pool or create new
   */
  async acquire(config: ConnectConfig): Promise<SSHClient> {
    const key = this.getKey(config);
    const pool = this.pools.get(key) || [];

    // Try to reuse existing connection
    const client = pool.pop();
    if (client) {
      return client;
    }

    // Create new connection
    return await this.createConnection(config);
  }

  /**
   * Release connection back to pool
   */
  release(config: ConnectConfig, client: SSHClient): void {
    const key = this.getKey(config);
    const pool = this.pools.get(key) || [];

    if (pool.length < this.maxPoolSize) {
      pool.push(client);
      this.pools.set(key, pool);
    } else {
      client.end();
    }
  }

  /**
   * Create new SSH connection
   */
  private createConnection(config: ConnectConfig): Promise<SSHClient> {
    return new Promise((resolve, reject) => {
      const client = new SSHClient();

      client.on('ready', () => {
        resolve(client);
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.connect(config);
    });
  }

  /**
   * Close all connections in pool
   */
  dispose(): void {
    for (const pool of this.pools.values()) {
      for (const client of pool) {
        client.end();
      }
    }
    this.pools.clear();
  }
}

/**
 * SSH Executor
 * Executes operations on remote SSH server
 */
class SSHExecutor implements IRemoteExecutor {
  private config: ConnectConfig;
  private pool: SSHConnectionPool;
  private workingDirectory: string;
  private usePool: boolean;

  constructor(sshConfig: RemoteContext['ssh'], workingDirectory?: string) {
    if (!sshConfig) {
      throw new Error('SSH configuration required');
    }

    this.workingDirectory = workingDirectory || '/tmp';
    this.usePool = sshConfig.pooled !== false;

    // Build ssh2 config
    this.config = {
      host: sshConfig.host,
      port: sshConfig.port || 22,
      username: sshConfig.user,
      keepaliveInterval: sshConfig.keepaliveInterval || 10000,
      keepaliveCountMax: sshConfig.keepaliveCountMax || 3,
      readyTimeout: sshConfig.connectTimeout || 30000
    };

    // Configure authentication
    switch (sshConfig.auth.type) {
      case 'key':
        if (!sshConfig.auth.keyPath) {
          throw new Error('SSH key path required for key authentication');
        }
        this.config.privateKey = require('fs').readFileSync(sshConfig.auth.keyPath);
        if (sshConfig.auth.passphrase) {
          this.config.passphrase = sshConfig.auth.passphrase;
        }
        break;

      case 'password':
        if (!sshConfig.auth.password) {
          throw new Error('Password required for password authentication');
        }
        this.config.password = sshConfig.auth.password;
        break;

      case 'agent':
        this.config.agent = process.env.SSH_AUTH_SOCK;
        break;
    }

    this.pool = new SSHConnectionPool(sshConfig.maxPoolSize || 5);
  }

  async initialize(): Promise<void> {
    // Test connection
    const client = await this.pool.acquire(this.config);
    this.pool.release(this.config, client);
  }

  async dispose(): Promise<void> {
    this.pool.dispose();
  }

  async isReady(): Promise<boolean> {
    try {
      await this.exec('echo "ready"');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute operation with connection from pool
   */
  private async withConnection<T>(
    operation: (client: SSHClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.acquire(this.config);

    try {
      return await operation(client);
    } finally {
      if (this.usePool) {
        this.pool.release(this.config, client);
      } else {
        client.end();
      }
    }
  }

  /**
   * Get SFTP session
   */
  private getSFTP(client: SSHClient): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }

  // ============================================
  // File Operations
  // ============================================

  async readFile(
    filePath: string,
    encoding: BufferEncoding = 'utf8'
  ): Promise<string | Buffer> {
    return await this.withConnection(async (client) => {
      const sftp = await this.getSFTP(client);
      const remotePath = this.resolvePath(filePath);

      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        const stream = sftp.createReadStream(remotePath);

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (encoding) {
            resolve(buffer.toString(encoding));
          } else {
            resolve(buffer);
          }
        });

        stream.on('error', reject);
      });
    });
  }

  async writeFile(
    filePath: string,
    content: string | Buffer
  ): Promise<FileOperationResult> {
    try {
      return await this.withConnection(async (client) => {
        const sftp = await this.getSFTP(client);
        const remotePath = this.resolvePath(filePath);

        // Ensure directory exists
        const dirPath = path.posix.dirname(remotePath);
        await this.mkdir(dirPath, true);

        return new Promise((resolve, reject) => {
          const buffer = Buffer.isBuffer(content)
            ? content
            : Buffer.from(content);

          const stream = sftp.createWriteStream(remotePath);

          stream.on('close', () => {
            resolve({
              success: true,
              bytesTransferred: buffer.length
            });
          });

          stream.on('error', (error) => {
            resolve({
              success: false,
              error: error.message
            });
          });

          stream.write(buffer);
          stream.end();
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<FileStats> {
    return await this.withConnection(async (client) => {
      const sftp = await this.getSFTP(client);
      const remotePath = this.resolvePath(filePath);

      return new Promise((resolve, reject) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              size: stats.size,
              mode: stats.mode,
              uid: stats.uid,
              gid: stats.gid,
              atime: new Date(stats.atime * 1000),
              mtime: new Date(stats.mtime * 1000),
              ctime: new Date(stats.mtime * 1000), // SFTP doesn't provide ctime
              isFile: stats.isFile(),
              isDirectory: stats.isDirectory(),
              isSymbolicLink: stats.isSymbolicLink()
            });
          }
        });
      });
    });
  }

  async readdir(dirPath: string): Promise<string[]> {
    return await this.withConnection(async (client) => {
      const sftp = await this.getSFTP(client);
      const remotePath = this.resolvePath(dirPath);

      return new Promise((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
          if (err) {
            reject(err);
          } else {
            resolve(list.map(item => item.filename));
          }
        });
      });
    });
  }

  async mkdir(dirPath: string, recursive: boolean = true): Promise<void> {
    const remotePath = this.resolvePath(dirPath);

    if (recursive) {
      // Use mkdir -p for recursive creation
      const result = await this.exec(`mkdir -p '${remotePath.replace(/'/g, "'\\''")}'`);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to create directory: ${result.stderr}`);
      }
    } else {
      await this.withConnection(async (client) => {
        const sftp = await this.getSFTP(client);

        return new Promise<void>((resolve, reject) => {
          sftp.mkdir(remotePath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    }
  }

  async remove(targetPath: string, recursive: boolean = false): Promise<void> {
    const remotePath = this.resolvePath(targetPath);
    const flag = recursive ? '-rf' : '-f';

    const result = await this.exec(`rm ${flag} '${remotePath.replace(/'/g, "'\\''")}'`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove: ${result.stderr}`);
    }
  }

  // ============================================
  // Command Execution
  // ============================================

  async exec(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return await this.withConnection(async (client) => {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();

        // Build command with cwd and env
        let finalCommand = command;

        if (options.cwd) {
          finalCommand = `cd '${options.cwd.replace(/'/g, "'\\''")}' && ${command}`;
        } else if (this.workingDirectory) {
          finalCommand = `cd '${this.workingDirectory.replace(/'/g, "'\\''")}' && ${command}`;
        }

        if (options.env) {
          const envVars = Object.entries(options.env)
            .map(([key, value]) => `${key}='${value.replace(/'/g, "'\\''")}'`)
            .join(' ');
          finalCommand = `${envVars} ${finalCommand}`;
        }

        client.exec(finalCommand, { pty: options.pty }, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (chunk: Buffer) => {
            stdout += chunk.toString(options.encoding || 'utf8');
          });

          stream.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString(options.encoding || 'utf8');
          });

          stream.on('close', (exitCode: number) => {
            resolve({
              stdout,
              stderr,
              exitCode: exitCode || 0,
              executionTime: Date.now() - startTime
            });
          });

          if (options.timeout) {
            setTimeout(() => {
              stream.close();
              reject(new Error(`Command timed out after ${options.timeout}ms`));
            }, options.timeout);
          }
        });
      });
    });
  }

  async execStreaming(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return await this.withConnection(async (client) => {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();

        // Build command with cwd
        let finalCommand = command;
        if (options.cwd || this.workingDirectory) {
          const cwd = options.cwd || this.workingDirectory;
          finalCommand = `cd '${cwd.replace(/'/g, "'\\''")}' && ${command}`;
        }

        client.exec(finalCommand, { pty: options.pty }, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (chunk: Buffer) => {
            const text = chunk.toString(options.encoding || 'utf8');
            stdout += text;
            options.onStdout?.(text);
          });

          stream.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString(options.encoding || 'utf8');
            stderr += text;
            options.onStderr?.(text);
          });

          stream.on('close', (exitCode: number) => {
            resolve({
              stdout,
              stderr,
              exitCode: exitCode || 0,
              executionTime: Date.now() - startTime
            });
          });

          if (options.timeout) {
            setTimeout(() => {
              stream.close();
              reject(new Error(`Command timed out after ${options.timeout}ms`));
            }, options.timeout);
          }
        });
      });
    });
  }

  // ============================================
  // Path Operations
  // ============================================

  resolvePath(filePath: string): string {
    if (path.posix.isAbsolute(filePath)) {
      return filePath;
    }
    return path.posix.join(this.workingDirectory, filePath);
  }

  toRemotePath(localPath: string): string {
    return localPath; // No conversion for SSH
  }

  toLocalPath(remotePath: string): string {
    return remotePath; // No conversion for SSH
  }

  // ============================================
  // Advanced Operations
  // ============================================

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    const searchPath = cwd || this.workingDirectory;

    // Use find with -path pattern
    const command = `cd '${searchPath.replace(/'/g, "'\\''")}' && find . -path '${pattern.replace(/'/g, "'\\''")}'`;
    const result = await this.exec(command);

    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => path.posix.join(searchPath, line.replace(/^\.\//, '')));
  }

  async grep(
    pattern: string,
    options: {
      path?: string;
      recursive?: boolean;
      ignoreCase?: boolean;
      filesOnly?: boolean;
    } = {}
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const searchPath = options.path || this.workingDirectory;

    // Build grep command
    const flags = [
      '-n',
      options.ignoreCase ? '-i' : '',
      options.recursive ? '-r' : '',
      options.filesOnly ? '-l' : ''
    ].filter(Boolean).join(' ');

    const command = `grep ${flags} '${pattern.replace(/'/g, "'\\''")}' '${searchPath.replace(/'/g, "'\\''")}' 2>/dev/null || true`;
    const result = await this.exec(command);

    const results: Array<{ file: string; line: number; content: string }> = [];

    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;

      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        results.push({
          file: match[1],
          line: parseInt(match[2]),
          content: match[3]
        });
      }
    }

    return results;
  }
}
```

## 5. Remote Context Router

```typescript
/**
 * Remote Context Router
 * Routes operations to appropriate executor based on context
 */
class RemoteContextRouter implements IRemoteExecutor {
  private executor: IRemoteExecutor;
  private context: RemoteContext;

  constructor(context: RemoteContext) {
    this.context = context;
    this.executor = this.createExecutor(context);
  }

  /**
   * Create appropriate executor based on context type
   */
  private createExecutor(context: RemoteContext): IRemoteExecutor {
    switch (context.type) {
      case 'local':
        return new LocalExecutor(context.workingDirectory);

      case 'wsl':
        return new WSLExecutor(context.wsl, context.workingDirectory);

      case 'ssh':
        return new SSHExecutor(context.ssh, context.workingDirectory);

      default:
        throw new Error(`Unknown context type: ${(context as any).type}`);
    }
  }

  /**
   * Get the underlying executor
   */
  getExecutor(): IRemoteExecutor {
    return this.executor;
  }

  /**
   * Get the context configuration
   */
  getContext(): RemoteContext {
    return this.context;
  }

  // Delegate all methods to executor

  async initialize(): Promise<void> {
    return this.executor.initialize();
  }

  async dispose(): Promise<void> {
    return this.executor.dispose();
  }

  async isReady(): Promise<boolean> {
    return this.executor.isReady();
  }

  async readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    return this.executor.readFile(path, encoding);
  }

  async writeFile(path: string, content: string | Buffer): Promise<FileOperationResult> {
    return this.executor.writeFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.executor.exists(path);
  }

  async stat(path: string): Promise<FileStats> {
    return this.executor.stat(path);
  }

  async readdir(path: string): Promise<string[]> {
    return this.executor.readdir(path);
  }

  async mkdir(path: string, recursive?: boolean): Promise<void> {
    return this.executor.mkdir(path, recursive);
  }

  async remove(path: string, recursive?: boolean): Promise<void> {
    return this.executor.remove(path, recursive);
  }

  async exec(command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    return this.executor.exec(command, options);
  }

  async execStreaming(command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    return this.executor.execStreaming(command, options);
  }

  resolvePath(path: string): string {
    return this.executor.resolvePath(path);
  }

  toRemotePath(localPath: string): string {
    return this.executor.toRemotePath(localPath);
  }

  toLocalPath(remotePath: string): string {
    return this.executor.toLocalPath(remotePath);
  }

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    return this.executor.glob(pattern, cwd);
  }

  async grep(
    pattern: string,
    options?: {
      path?: string;
      recursive?: boolean;
      ignoreCase?: boolean;
      filesOnly?: boolean;
    }
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    return this.executor.grep(pattern, options);
  }
}
```

## 6. MCP Tool Integration

```typescript
/**
 * Example: MCP read_file tool with remote context support
 */
async function mcpReadFileTool(args: {
  path: string;
  context?: RemoteContext;
}): Promise<{ content: string }> {
  // Default to local context
  const context = args.context || { type: 'local' };

  // Create router
  const router = new RemoteContextRouter(context);

  try {
    // Initialize connection
    await router.initialize();

    // Read file
    const content = await router.readFile(args.path, 'utf8');

    return {
      content: typeof content === 'string' ? content : content.toString('utf8')
    };
  } finally {
    // Cleanup
    await router.dispose();
  }
}

/**
 * Example: MCP execute_command tool with remote context support
 */
async function mcpExecuteCommandTool(args: {
  command: string;
  context?: RemoteContext;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}): Promise<ExecutionResult> {
  const context = args.context || { type: 'local' };
  const router = new RemoteContextRouter(context);

  try {
    await router.initialize();

    return await router.execStreaming(args.command, {
      cwd: args.cwd,
      env: args.env,
      timeout: args.timeout,
      onStdout: (chunk) => {
        // Could send progress updates to MCP client
        console.log('[STDOUT]', chunk);
      },
      onStderr: (chunk) => {
        console.error('[STDERR]', chunk);
      }
    });
  } finally {
    await router.dispose();
  }
}

/**
 * Example: MCP glob tool with remote context support
 */
async function mcpGlobTool(args: {
  pattern: string;
  cwd?: string;
  context?: RemoteContext;
}): Promise<{ files: string[] }> {
  const context = args.context || { type: 'local' };
  const router = new RemoteContextRouter(context);

  try {
    await router.initialize();

    const files = await router.glob(args.pattern, args.cwd);

    return { files };
  } finally {
    await router.dispose();
  }
}
```

## 7. Usage Examples

```typescript
// ============================================
// Example 1: Local execution
// ============================================

const localContext: RemoteContext = {
  type: 'local',
  workingDirectory: 'C:\\Users\\john\\project'
};

const router = new RemoteContextRouter(localContext);
await router.initialize();

const content = await router.readFile('README.md');
const result = await router.exec('npm test');

await router.dispose();

// ============================================
// Example 2: WSL execution
// ============================================

const wslContext: RemoteContext = {
  type: 'wsl',
  workingDirectory: '/home/john/project',
  wsl: {
    distribution: 'Ubuntu-22.04',
    userName: 'john'
  }
};

const wslRouter = new RemoteContextRouter(wslContext);
await wslRouter.initialize();

// Read file from WSL
const wslContent = await wslRouter.readFile('/etc/hostname');

// Execute command in WSL
const wslResult = await wslRouter.exec('npm run build');

// Glob files in WSL
const wslFiles = await wslRouter.glob('**/*.ts', '/home/john/project/src');

await wslRouter.dispose();

// ============================================
// Example 3: SSH execution
// ============================================

const sshContext: RemoteContext = {
  type: 'ssh',
  workingDirectory: '/var/www/app',
  ssh: {
    host: 'example.com',
    port: 22,
    user: 'deploy',
    auth: {
      type: 'key',
      keyPath: '~/.ssh/id_rsa'
    },
    pooled: true,
    maxPoolSize: 5,
    keepaliveInterval: 10000,
    connectTimeout: 30000
  }
};

const sshRouter = new RemoteContextRouter(sshContext);
await sshRouter.initialize();

// Read file via SSH
const remoteContent = await sshRouter.readFile('config/app.json');

// Execute command via SSH
const remoteResult = await sshRouter.execStreaming('docker ps', {
  onStdout: (chunk) => console.log(chunk)
});

// Grep files via SSH
const matches = await sshRouter.grep('TODO', {
  path: '/var/www/app/src',
  recursive: true,
  ignoreCase: true
});

await sshRouter.dispose();

// ============================================
// Example 4: MCP Server configuration
// ============================================

// MCP Server with multiple contexts
const mcpServerConfig = {
  contexts: [
    {
      name: 'local',
      context: {
        type: 'local',
        workingDirectory: process.cwd()
      } as RemoteContext
    },
    {
      name: 'wsl-ubuntu',
      context: {
        type: 'wsl',
        wsl: {
          distribution: 'Ubuntu'
        }
      } as RemoteContext
    },
    {
      name: 'production',
      context: {
        type: 'ssh',
        ssh: {
          host: 'prod.example.com',
          user: 'deploy',
          auth: {
            type: 'key',
            keyPath: process.env.SSH_KEY_PATH
          }
        }
      } as RemoteContext
    }
  ]
};

// Tool handler receives context name and resolves it
async function handleReadFile(args: {
  path: string;
  contextName?: string;
}) {
  const contextName = args.contextName || 'local';
  const contextConfig = mcpServerConfig.contexts.find(c => c.name === contextName);

  if (!contextConfig) {
    throw new Error(`Unknown context: ${contextName}`);
  }

  const router = new RemoteContextRouter(contextConfig.context);
  await router.initialize();

  try {
    return await router.readFile(args.path);
  } finally {
    await router.dispose();
  }
}
```

## 8. Bibliothèques NPM Recommandées

```json
{
  "dependencies": {
    // SSH Support
    "ssh2": "^1.15.0",              // Low-level SSH2 client (le plus flexible)
    "node-ssh": "^13.1.0",          // Alternative high-level (moins de contrôle)

    // File operations
    "glob": "^10.3.10",             // Glob pattern matching
    "@vscode/ripgrep": "^1.15.9",   // Fast grep via ripgrep binary

    // Utilities
    "p-queue": "^8.0.1",            // Connection queue management
    "promise-retry": "^2.0.1"       // Retry failed SSH connections
  },
  "devDependencies": {
    "@types/ssh2": "^1.15.0",
    "@types/glob": "^8.1.0",
    "@types/node": "^20.10.0"
  }
}
```

## 9. Considérations de Performance

### WSL
- **Accès aux fichiers**: Privilégier `wsl cat` pour petits fichiers, `\\wsl$\` pour gros fichiers
- **Commandes fréquentes**: Batch multiple commands avec `&&` pour réduire overhead
- **Path conversion**: Cache des conversions de chemins pour éviter overhead

### SSH
- **Connection pooling**: CRITIQUE pour performance - réutiliser les connexions
- **SFTP vs cat**: SFTP pour binaires/gros fichiers, `cat` via SSH pour petits fichiers texte
- **Keepalive**: Maintenir connexions actives pour éviter reconnexions
- **Parallel operations**: Utiliser pool pour opérations parallèles

### Général
- **Lazy initialization**: Ne pas initialiser tous les contexts au démarrage
- **Caching**: Cache des résultats de `stat`, `exists` pour réduire round-trips
- **Streaming**: Toujours streamer gros fichiers/outputs pour éviter memory overflow

## 10. Gestion des Erreurs

```typescript
/**
 * Error types for remote operations
 */
enum RemoteErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  TIMEOUT = 'TIMEOUT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  COMMAND_FAILED = 'COMMAND_FAILED',
  UNKNOWN = 'UNKNOWN'
}

class RemoteError extends Error {
  constructor(
    public type: RemoteErrorType,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

// Example error handling
try {
  await router.exec('invalid-command');
} catch (error) {
  if (error instanceof RemoteError) {
    switch (error.type) {
      case RemoteErrorType.CONNECTION_FAILED:
        console.error('Failed to connect to remote server');
        break;
      case RemoteErrorType.TIMEOUT:
        console.error('Operation timed out');
        break;
      case RemoteErrorType.PERMISSION_DENIED:
        console.error('Permission denied');
        break;
    }
  }
}
```

---

Cette architecture fournit une base solide et extensible pour supporter WSL et SSH dans les serveurs MCP filesystem/shell, avec:
- Interface unifiée pour tous les types d'environnements
- Performance optimisée via pooling et streaming
- Gestion robuste des erreurs et timeouts
- Support complet des opérations fichiers et commandes
- Exemples pratiques d'intégration MCP
