/**
 * Glob Tool - Cross-platform file pattern matching
 *
 * Features:
 * - Fast glob pattern matching using fast-glob
 * - Cross-platform path normalization
 * - Case sensitivity handling (Windows/macOS: insensitive, Linux: sensitive)
 * - Gitignore support
 * - Hidden file handling
 * - Multiple pattern support
 */

import { z } from 'zod';
import fg from 'fast-glob';
import { normalizePath, resolveHome, IS_WINDOWS, IS_MACOS } from '../utils/path.js';
import { checkPermissions } from '../utils/permissions.js';

/**
 * Glob tool input schema
 */
export const GlobToolInputSchema = z.object({
  patterns: z
    .union([z.string(), z.array(z.string())])
    .describe('Glob pattern(s) to match (e.g., "**/*.ts", "src/**/*.{js,ts}")'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory to search from (default: current directory)'),
  ignore: z
    .array(z.string())
    .optional()
    .describe('Patterns to ignore (e.g., ["node_modules/**", "dist/**"])'),
  caseSensitive: z
    .boolean()
    .optional()
    .describe('Force case-sensitive matching (default: platform-dependent)'),
  includeHidden: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include hidden files (starting with .)'),
  onlyFiles: z
    .boolean()
    .optional()
    .default(true)
    .describe('Only return files (not directories)'),
  onlyDirectories: z
    .boolean()
    .optional()
    .default(false)
    .describe('Only return directories (not files)'),
  followSymlinks: z
    .boolean()
    .optional()
    .default(false)
    .describe('Follow symbolic links'),
  maxDepth: z
    .number()
    .optional()
    .describe('Maximum directory depth to search'),
  absolutePath: z
    .boolean()
    .optional()
    .default(true)
    .describe('Return absolute paths (default: true)'),
});

export type GlobToolInput = z.infer<typeof GlobToolInputSchema>;

/**
 * Glob tool output
 */
export interface GlobToolOutput {
  matches: string[];
  count: number;
  patterns: string[];
  cwd: string;
}

/**
 * Execute glob pattern matching
 */
export async function globFiles(input: GlobToolInput): Promise<GlobToolOutput> {
  // Normalize working directory
  let cwd = process.cwd();
  if (input.cwd) {
    cwd = normalizePath(resolveHome(input.cwd));

    // Check if directory exists
    const permissions = await checkPermissions(cwd);
    if (!permissions.exists) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }
  }

  // Normalize patterns
  const patterns = Array.isArray(input.patterns) ? input.patterns : [input.patterns];

  // Determine case sensitivity
  // Linux: case-sensitive by default
  // Windows/macOS: case-insensitive by default
  const caseSensitiveGlob = input.caseSensitive ?? !(IS_WINDOWS || IS_MACOS);

  // Default ignore patterns
  const defaultIgnore = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/out/**',
  ];

  const ignorePatterns = input.ignore
    ? [...defaultIgnore, ...input.ignore]
    : defaultIgnore;

  // Execute glob search
  const matches = await fg(patterns, {
    cwd,
    ignore: ignorePatterns,
    dot: input.includeHidden,
    onlyFiles: input.onlyFiles && !input.onlyDirectories,
    onlyDirectories: input.onlyDirectories,
    followSymbolicLinks: input.followSymlinks,
    deep: input.maxDepth,
    caseSensitiveMatch: caseSensitiveGlob,
    absolute: input.absolutePath,
    markDirectories: false,
    objectMode: false,
    stats: false,
    unique: true,
    braceExpansion: true,
    extglob: true,
    globstar: true,
  });

  // Normalize paths to use forward slashes
  const normalizedMatches = matches.map(match => normalizePath(match));

  return {
    matches: normalizedMatches,
    count: normalizedMatches.length,
    patterns,
    cwd,
  };
}

/**
 * Glob tool handler for MCP
 */
export async function handleGlobTool(input: unknown): Promise<string> {
  const parsed = GlobToolInputSchema.parse(input);
  const result = await globFiles(parsed);

  // Format output
  const output: any = {
    message: `Found ${result.count} match(es)`,
    count: result.count,
    patterns: result.patterns,
    cwd: result.cwd,
  };

  if (result.count > 0) {
    // Limit output for very large results
    const maxFilesToShow = 1000;

    if (result.count <= maxFilesToShow) {
      output.matches = result.matches;
    } else {
      output.matches = result.matches.slice(0, maxFilesToShow);
      output.message = `Found ${result.count} matches (showing first ${maxFilesToShow})`;
      output.truncated = true;
    }
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Common glob patterns for different file types
 */
export const COMMON_PATTERNS = {
  typescript: '**/*.{ts,tsx}',
  javascript: '**/*.{js,jsx,mjs,cjs}',
  allCode: '**/*.{ts,tsx,js,jsx,py,rb,go,rs,java,c,cpp,h,hpp}',
  config: '**/*.{json,yaml,yml,toml,ini,conf,config}',
  markdown: '**/*.{md,mdx,markdown}',
  tests: '**/*.{test,spec}.{ts,tsx,js,jsx}',
  images: '**/*.{jpg,jpeg,png,gif,svg,webp,ico}',
  videos: '**/*.{mp4,avi,mkv,mov,wmv,webm}',
};
