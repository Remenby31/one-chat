/**
 * Cross-platform process spawning utilities
 *
 * Handles shell differences:
 * - Windows: PowerShell
 * - Unix/Linux: bash, sh, zsh
 * - macOS: zsh (default on modern macOS), bash
 */

import { spawn, ChildProcess } from 'node:child_process';
import { IS_WINDOWS, IS_MACOS } from './path.js';
import treeKill from 'tree-kill';

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number; // milliseconds
  shell?: string | boolean;
  maxBuffer?: number; // Max stdout/stderr buffer size
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  timedOut: boolean;
}

/**
 * Get default shell for current platform
 */
export function getDefaultShell(): string {
  if (IS_WINDOWS) {
    return 'powershell.exe';
  }

  if (IS_MACOS) {
    // Modern macOS uses zsh by default
    return process.env.SHELL || '/bin/zsh';
  }

  // Linux and other Unix
  return process.env.SHELL || '/bin/bash';
}

/**
 * Get shell command arguments for executing a string command
 */
export function getShellCommandArgs(command: string): { shell: string; args: string[] } {
  if (IS_WINDOWS) {
    return {
      shell: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    };
  }

  // Unix shells (bash, zsh, sh)
  const shell = getDefaultShell();
  return {
    shell,
    args: ['-c', command],
  };
}

/**
 * Spawn a process and capture output
 * Returns promise that resolves with stdout/stderr
 */
export async function spawnProcess(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const {
      cwd = process.cwd(),
      env = process.env as Record<string, string>,
      timeout = 120000, // 2 minutes default
      shell = false,
      maxBuffer = 10 * 1024 * 1024, // 10MB default
    } = options;

    // Spawn process
    const childProcess = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell,
      windowsHide: true, // Hide console window on Windows
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    // Set up timeout
    const timeoutHandle = timeout > 0 ? setTimeout(() => {
      timedOut = true;
      killed = true;
      killProcess(childProcess);
    }, timeout) : null;

    // Capture stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;

      // Check buffer limit
      if (stdout.length > maxBuffer) {
        killed = true;
        killProcess(childProcess);
        reject(new Error(`stdout exceeded maxBuffer (${maxBuffer} bytes)`));
      }
    });

    // Capture stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Check buffer limit
      if (stderr.length > maxBuffer) {
        killed = true;
        killProcess(childProcess);
        reject(new Error(`stderr exceeded maxBuffer (${maxBuffer} bytes)`));
      }
    });

    // Handle process exit
    childProcess.on('close', (code, signal) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (killed && !timedOut) {
        // Already rejected due to buffer overflow
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        signal: signal ?? undefined,
        timedOut,
      });
    });

    // Handle errors
    childProcess.on('error', (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      reject(error);
    });
  });
}

/**
 * Execute shell command (cross-platform)
 * Automatically selects appropriate shell for platform
 */
export async function executeShellCommand(
  command: string,
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  const { shell: shellCmd, args } = getShellCommandArgs(command);

  return spawnProcess(shellCmd, args, {
    ...options,
    shell: false, // We're manually handling shell
  });
}

/**
 * Kill process tree (kills process and all children)
 * Cross-platform using tree-kill
 */
export function killProcess(childProcess: ChildProcess, signal: string | number = 'SIGTERM'): void {
  if (!childProcess.pid) {
    return;
  }

  treeKill(childProcess.pid, signal as any, (err) => {
    if (err && err.message !== 'No such process') {
      console.error('[Process] Failed to kill process tree:', err);
    }
  });
}

/**
 * Normalize environment variables for cross-platform use
 * Handles PATH differences and case sensitivity
 */
export function normalizeEnvironment(env: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = { ...env };

  // On Windows, environment variables are case-insensitive
  // Normalize PATH to uppercase
  if (IS_WINDOWS) {
    const pathKeys = Object.keys(normalized).filter(k => k.toLowerCase() === 'path');

    if (pathKeys.length > 1) {
      // Merge all PATH variants
      const allPaths = pathKeys.map(k => normalized[k]).filter(Boolean);
      const mergedPath = allPaths.join(';');

      // Remove all variants
      pathKeys.forEach(k => delete normalized[k]);

      // Set canonical PATH
      normalized['PATH'] = mergedPath;
    }
  }

  return normalized;
}

/**
 * Get PATH separator for current platform
 */
export function getPathSeparator(): string {
  return IS_WINDOWS ? ';' : ':';
}

/**
 * Add directory to PATH environment variable
 */
export function addToPath(env: Record<string, string>, directory: string): Record<string, string> {
  const pathKey = IS_WINDOWS ? 'PATH' : 'PATH';
  const separator = getPathSeparator();

  const currentPath = env[pathKey] || process.env.PATH || '';
  const newPath = directory + separator + currentPath;

  return {
    ...env,
    [pathKey]: newPath,
  };
}

/**
 * Check if command exists in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
  const whichCommand = IS_WINDOWS ? 'where' : 'which';

  try {
    const result = await spawnProcess(whichCommand, [command], {
      timeout: 5000,
      shell: true,
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get full path to command in PATH
 */
export async function resolveCommand(command: string): Promise<string | null> {
  const whichCommand = IS_WINDOWS ? 'where' : 'which';

  try {
    const result = await spawnProcess(whichCommand, [command], {
      timeout: 5000,
      shell: true,
    });

    if (result.exitCode === 0) {
      // On Windows, 'where' can return multiple paths, take first
      return result.stdout.trim().split(/\r?\n/)[0];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Escape shell argument for safe execution
 * Prevents command injection
 */
export function escapeShellArg(arg: string): string {
  if (IS_WINDOWS) {
    // Windows: escape double quotes and wrap in quotes
    return `"${arg.replace(/"/g, '""')}"`;
  }

  // Unix: escape single quotes and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Build safe shell command from command + args
 */
export function buildSafeShellCommand(command: string, args: string[]): string {
  const escapedCommand = IS_WINDOWS ? `"${command}"` : escapeShellArg(command);
  const escapedArgs = args.map(arg => escapeShellArg(arg));

  return [escapedCommand, ...escapedArgs].join(' ');
}
