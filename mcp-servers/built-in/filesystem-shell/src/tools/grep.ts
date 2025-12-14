/**
 * Grep Tool - Cross-platform content search
 *
 * Features:
 * - Uses ripgrep (rg) if available, fallback to Node.js implementation
 * - Regex and literal string search
 * - Multi-line pattern support
 * - Case-sensitive and insensitive search
 * - Context lines (before/after)
 * - File type filtering
 * - Performance optimization for large codebases
 */

import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { normalizePath, resolveHome } from '../utils/path.js';
import { readFileWithEncoding } from '../utils/encoding.js';
import { splitLines } from '../utils/lineEndings.js';
import { commandExists, executeShellCommand } from '../utils/process.js';
import { globFiles } from './glob.js';

/**
 * Grep tool input schema
 */
export const GrepToolInputSchema = z.object({
  pattern: z.string().describe('Pattern to search for (regex or literal string)'),
  path: z
    .string()
    .optional()
    .describe('Path to search in (file or directory, default: current directory)'),
  regex: z
    .boolean()
    .optional()
    .default(true)
    .describe('Treat pattern as regex (default: true)'),
  caseInsensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe('Case-insensitive search'),
  multiline: z
    .boolean()
    .optional()
    .default(false)
    .describe('Multiline mode (pattern can match across lines)'),
  contextBefore: z
    .number()
    .optional()
    .default(0)
    .describe('Number of lines to show before match'),
  contextAfter: z
    .number()
    .optional()
    .default(0)
    .describe('Number of lines to show after match'),
  filePattern: z
    .string()
    .optional()
    .describe('Glob pattern to filter files (e.g., "*.ts")'),
  maxResults: z
    .number()
    .optional()
    .default(1000)
    .describe('Maximum number of results to return'),
  useRipgrep: z
    .boolean()
    .optional()
    .default(true)
    .describe('Use ripgrep if available (faster)'),
});

export type GrepToolInput = z.infer<typeof GrepToolInputSchema>;

/**
 * Grep result match
 */
export interface GrepMatch {
  file: string;
  line: number;
  column: number;
  match: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

/**
 * Grep tool output
 */
export interface GrepToolOutput {
  matches: GrepMatch[];
  totalMatches: number;
  filesSearched: number;
  usedRipgrep: boolean;
  truncated: boolean;
}

/**
 * Check if ripgrep is available
 */
let ripgrepAvailable: boolean | null = null;

async function isRipgrepAvailable(): Promise<boolean> {
  if (ripgrepAvailable !== null) {
    return ripgrepAvailable;
  }

  ripgrepAvailable = await commandExists('rg');
  return ripgrepAvailable;
}

/**
 * Execute grep search using ripgrep
 */
async function grepWithRipgrep(input: GrepToolInput): Promise<GrepToolOutput> {
  const searchPath = input.path ? normalizePath(resolveHome(input.path)) : process.cwd();

  // Build ripgrep command
  const args: string[] = ['rg'];

  // Pattern
  if (!input.regex) {
    args.push('--fixed-strings'); // Literal string search
  }

  if (input.caseInsensitive) {
    args.push('--ignore-case');
  }

  if (input.multiline) {
    args.push('--multiline');
  }

  // Context
  if (input.contextBefore && input.contextBefore > 0) {
    args.push(`--before-context=${input.contextBefore}`);
  }

  if (input.contextAfter && input.contextAfter > 0) {
    args.push(`--after-context=${input.contextAfter}`);
  }

  // Output format
  args.push('--json'); // JSON output for easier parsing
  args.push('--max-count=1000'); // Limit matches per file

  // File pattern
  if (input.filePattern) {
    args.push(`--glob=${input.filePattern}`);
  }

  // Pattern and path
  args.push(input.pattern);
  args.push(searchPath);

  // Execute ripgrep
  const command = args.join(' ');
  const result = await executeShellCommand(command, {
    timeout: 60000, // 1 minute timeout
  });

  // Parse JSON output
  const matches: GrepMatch[] = [];
  const lines = result.stdout.split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const json = JSON.parse(line);

      if (json.type === 'match') {
        const match: GrepMatch = {
          file: normalizePath(json.data.path.text),
          line: json.data.line_number,
          column: json.data.submatches[0]?.start || 0,
          match: json.data.lines.text.trim(),
        };

        matches.push(match);

        if (matches.length >= input.maxResults) {
          break;
        }
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return {
    matches: matches.slice(0, input.maxResults),
    totalMatches: matches.length,
    filesSearched: 0, // ripgrep doesn't report this easily
    usedRipgrep: true,
    truncated: matches.length >= input.maxResults,
  };
}

/**
 * Execute grep search using Node.js (fallback)
 */
async function grepWithNodeJS(input: GrepToolInput): Promise<GrepToolOutput> {
  const searchPath = input.path ? normalizePath(resolveHome(input.path)) : process.cwd();

  // Get files to search
  const filePattern = input.filePattern || '**/*';
  const globResult = await globFiles({
    patterns: filePattern,
    cwd: searchPath,
    onlyFiles: true,
    onlyDirectories: false,
    followSymlinks: false,
    absolutePath: true,
    includeHidden: false,
  });

  // Build regex
  const flags = (input.caseInsensitive ? 'i' : '') + (input.multiline ? 'm' : '');
  const regex = input.regex
    ? new RegExp(input.pattern, flags)
    : new RegExp(escapeRegex(input.pattern), flags);

  const matches: GrepMatch[] = [];
  let filesSearched = 0;

  for (const file of globResult.matches) {
    if (matches.length >= input.maxResults) {
      break;
    }

    filesSearched++;

    try {
      // Read file
      const content = await readFileWithEncoding(file);
      const lines = splitLines(content);

      // Search for matches
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= input.maxResults) {
          break;
        }

        const line = lines[i];
        const match = line.match(regex);

        if (match) {
          const contextBefore: string[] = [];
          const contextAfter: string[] = [];

          // Get context before
          if (input.contextBefore > 0) {
            const start = Math.max(0, i - input.contextBefore);
            contextBefore.push(...lines.slice(start, i));
          }

          // Get context after
          if (input.contextAfter > 0) {
            const end = Math.min(lines.length, i + input.contextAfter + 1);
            contextAfter.push(...lines.slice(i + 1, end));
          }

          matches.push({
            file: normalizePath(file),
            line: i + 1,
            column: match.index || 0,
            match: line.trim(),
            contextBefore: contextBefore.length > 0 ? contextBefore : undefined,
            contextAfter: contextAfter.length > 0 ? contextAfter : undefined,
          });
        }
      }
    } catch (error) {
      // Skip files that can't be read (binary, permission denied, etc.)
      continue;
    }
  }

  return {
    matches: matches.slice(0, input.maxResults),
    totalMatches: matches.length,
    filesSearched,
    usedRipgrep: false,
    truncated: matches.length >= input.maxResults,
  };
}

/**
 * Execute grep search
 */
export async function grepSearch(input: GrepToolInput): Promise<GrepToolOutput> {
  // Try ripgrep first if requested and available
  if (input.useRipgrep && (await isRipgrepAvailable())) {
    try {
      return await grepWithRipgrep(input);
    } catch (error) {
      console.error('[Grep] Ripgrep failed, falling back to Node.js:', error);
      // Fall through to Node.js implementation
    }
  }

  // Fallback to Node.js implementation
  return await grepWithNodeJS(input);
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Grep tool handler for MCP
 */
export async function handleGrepTool(input: unknown): Promise<string> {
  const parsed = GrepToolInputSchema.parse(input);
  const result = await grepSearch(parsed);

  // Format output
  const output: any = {
    message: `Found ${result.totalMatches} match(es) in ${result.filesSearched} file(s)`,
    totalMatches: result.totalMatches,
    filesSearched: result.filesSearched,
    usedRipgrep: result.usedRipgrep,
  };

  if (result.truncated) {
    output.message += ` (truncated to ${parsed.maxResults})`;
    output.truncated = true;
  }

  if (result.matches.length > 0) {
    output.matches = result.matches.map((match) => {
      const formatted: any = {
        file: match.file,
        line: match.line,
        column: match.column,
        match: match.match,
      };

      if (match.contextBefore && match.contextBefore.length > 0) {
        formatted.contextBefore = match.contextBefore;
      }

      if (match.contextAfter && match.contextAfter.length > 0) {
        formatted.contextAfter = match.contextAfter;
      }

      return formatted;
    });
  }

  return JSON.stringify(output, null, 2);
}
