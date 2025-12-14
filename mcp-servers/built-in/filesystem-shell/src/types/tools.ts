/**
 * Tool type definitions
 *
 * Centralized types for all MCP tools
 */

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

export interface FileOperationResult extends ToolResult {
  path: string;
  size?: number;
  encoding?: string;
}

export interface ShellCommandResult extends ToolResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  durationMs?: number;
}

export interface SearchResult extends ToolResult {
  matches: Array<{
    file: string;
    line?: number;
    column?: number;
    match?: string;
  }>;
  totalMatches: number;
}
