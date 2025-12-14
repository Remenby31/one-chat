/**
 * Bash/Shell Tool - Cross-platform command execution
 *
 * Features:
 * - Automatic shell detection (cmd/PowerShell on Windows, bash/zsh on Unix)
 * - Environment variable handling
 * - PATH management
 * - Timeout support
 * - Working directory support
 * - stdout/stderr capture
 * - Exit code reporting
 * - Process killing on timeout
 */

import { z } from 'zod';
import {
  executeShellCommand,
  getDefaultShell,
  normalizeEnvironment,
  addToPath,
  buildSafeShellCommand,
  escapeShellArg,
} from '../utils/process.js';
import { normalizePath, resolveHome, IS_WINDOWS } from '../utils/path.js';
import { checkPermissions } from '../utils/permissions.js';

/**
 * Bash tool input schema
 */
export const BashToolInputSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory (defaults to current directory)'),
  env: z
    .record(z.string())
    .optional()
    .describe('Environment variables to set'),
  timeout: z
    .number()
    .optional()
    .default(120000)
    .describe('Timeout in milliseconds (default: 120000 = 2 minutes)'),
  shell: z
    .string()
    .optional()
    .describe('Specific shell to use (default: auto-detect)'),
  captureStderr: z
    .boolean()
    .optional()
    .default(true)
    .describe('Capture stderr separately (default: true)'),
});

export type BashToolInput = z.infer<typeof BashToolInputSchema>;

/**
 * Bash tool output
 */
export interface BashToolOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
  timedOut: boolean;
  command: string;
  shell: string;
  cwd: string;
  durationMs: number;
}

/**
 * Execute shell command with cross-platform handling
 */
export async function executeBash(input: BashToolInput): Promise<BashToolOutput> {
  // Determine working directory
  let cwd = process.cwd();
  if (input.cwd) {
    cwd = normalizePath(resolveHome(input.cwd));

    // Check if directory exists and is accessible
    const permissions = await checkPermissions(cwd);
    if (!permissions.exists) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }
  }

  // Normalize environment variables
  const env = input.env ? normalizeEnvironment(input.env) : {};

  // Get shell
  const shell = input.shell || getDefaultShell();

  // Execute command
  const startTime = Date.now();

  const result = await executeShellCommand(input.command, {
    cwd,
    env,
    timeout: input.timeout,
  });

  const durationMs = Date.now() - startTime;

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    command: input.command,
    shell,
    cwd,
    durationMs,
  };
}

/**
 * Bash tool handler for MCP
 */
export async function handleBashTool(input: unknown): Promise<string> {
  const parsed = BashToolInputSchema.parse(input);
  const result = await executeBash(parsed);

  // Format output
  const output: any = {
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  };

  if (result.timedOut) {
    output.message = `Command timed out after ${parsed.timeout}ms`;
    output.timedOut = true;
  }

  if (result.signal) {
    output.signal = result.signal;
  }

  if (result.stdout) {
    output.stdout = result.stdout;
  }

  if (result.stderr) {
    output.stderr = result.stderr;
  }

  // Add context for errors
  if (result.exitCode !== 0) {
    output.message = `Command failed with exit code ${result.exitCode}`;
  } else if (!result.timedOut) {
    output.message = 'Command executed successfully';
  }

  output.shell = result.shell;
  output.cwd = result.cwd;

  return JSON.stringify(output, null, 2);
}

/**
 * Validate command safety (optional security layer)
 * Prevents obviously dangerous commands
 */
export function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  // Dangerous patterns (can be expanded)
  const dangerousPatterns = [
    /rm\s+-rf\s+\/($|\s)/,  // rm -rf /
    /:\(\)\{.*:\|:.*\}/,     // Fork bomb
    /mkfs/,                  // Format filesystem
    /dd\s+if=/,              // Direct disk write
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        safe: false,
        reason: `Command contains potentially dangerous pattern: ${pattern}`,
      };
    }
  }

  return { safe: true };
}

/**
 * Execute command with safety check
 */
export async function executeBashSafe(input: BashToolInput): Promise<BashToolOutput> {
  const safety = isCommandSafe(input.command);

  if (!safety.safe) {
    throw new Error(`Unsafe command blocked: ${safety.reason}`);
  }

  return executeBash(input);
}
