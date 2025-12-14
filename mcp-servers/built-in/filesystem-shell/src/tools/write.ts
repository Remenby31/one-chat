/**
 * Write Tool - Cross-platform file writing
 *
 * Features:
 * - Automatic directory creation (recursive)
 * - Encoding preservation or explicit setting
 * - Line ending handling (CRLF on Windows, LF on Unix)
 * - Atomic writes (write to temp, then rename)
 * - Permission preservation
 * - Locked file detection (Windows)
 */

import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { normalizePath, resolveHome, dirname } from '../utils/path.js';
import { writeFileWithEncoding, detectEncoding } from '../utils/encoding.js';
import {
  preserveLineEndings,
  toPlatformLineEndings,
  detectLineEnding,
  DEFAULT_LINE_ENDING,
} from '../utils/lineEndings.js';
import {
  checkPermissions,
  ensureDirectory,
  isFileLocked,
  getPermissionsOctal,
  setPermissions,
  exists,
} from '../utils/permissions.js';
import { IS_WINDOWS } from '../utils/path.js';

/**
 * Write tool input schema
 */
export const WriteToolInputSchema = z.object({
  path: z.string().describe('Path to file to write (absolute or relative)'),
  content: z.string().describe('Content to write to file'),
  encoding: z
    .enum(['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'latin1', 'windows-1252'])
    .optional()
    .describe('File encoding (default: utf-8 or preserve existing)'),
  createDirectories: z
    .boolean()
    .optional()
    .default(true)
    .describe('Create parent directories if they do not exist'),
  preserveLineEndings: z
    .boolean()
    .optional()
    .default(true)
    .describe('Preserve existing line endings or use platform default'),
  atomic: z
    .boolean()
    .optional()
    .default(true)
    .describe('Use atomic write (write to temp file then rename)'),
});

export type WriteToolInput = z.infer<typeof WriteToolInputSchema>;

/**
 * Write tool output
 */
export interface WriteToolOutput {
  path: string;
  bytesWritten: number;
  encoding: string;
  lineEnding: string;
  created: boolean;
}

/**
 * Write file with cross-platform handling
 */
export async function writeFile(input: WriteToolInput): Promise<WriteToolOutput> {
  // Normalize and resolve path
  const filePath = normalizePath(resolveHome(input.path));

  // Check if file exists
  const fileExists = await exists(filePath);

  // Determine encoding
  let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'ascii' | 'latin1' | 'windows-1252' = input.encoding || 'utf-8';
  if (fileExists && !input.encoding) {
    // Preserve existing encoding - map to supported encoding
    const detected = await detectEncoding(filePath);
    // Map detected encoding to supported values
    if (detected === 'utf-8' || detected === 'utf-16le' || detected === 'utf-16be' ||
        detected === 'ascii' || detected === 'latin1' || detected === 'windows-1252') {
      encoding = detected;
    } else if (detected === 'iso-8859-1') {
      encoding = 'latin1';
    }
    // Otherwise keep default utf-8
  }

  // Determine line endings
  let content = input.content;
  if (input.preserveLineEndings && fileExists) {
    // Read original file to detect line endings
    try {
      const originalContent = await fs.readFile(filePath, 'utf-8');
      content = preserveLineEndings(originalContent, content);
    } catch {
      // If we can't read original, use platform default
      content = toPlatformLineEndings(content);
    }
  } else {
    // Use platform default line endings
    content = toPlatformLineEndings(content);
  }

  // Get original permissions if file exists
  let originalPermissions: string | null = null;
  if (fileExists && !IS_WINDOWS) {
    try {
      originalPermissions = await getPermissionsOctal(filePath);
    } catch {
      // Ignore permission errors
    }
  }

  // Check if file is locked (Windows)
  if (fileExists && IS_WINDOWS) {
    const locked = await isFileLocked(filePath);
    if (locked) {
      throw new Error(`File is locked by another process: ${filePath}`);
    }
  }

  // Create parent directories if needed
  if (input.createDirectories) {
    const parentDir = dirname(filePath);
    await ensureDirectory(parentDir);
  }

  // Check parent directory permissions
  const parentDir = dirname(filePath);
  const parentPerms = await checkPermissions(parentDir);
  if (parentPerms.exists && !parentPerms.writable) {
    throw new Error(`Parent directory not writable: ${parentDir}`);
  }

  // Write file (atomic or direct)
  if (input.atomic) {
    // Atomic write: write to temp file, then rename
    const tempPath = `${filePath}.tmp.${Date.now()}`;

    try {
      await writeFileWithEncoding(tempPath, content, encoding);

      // Rename temp to final (atomic on Unix, near-atomic on Windows)
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  } else {
    // Direct write
    await writeFileWithEncoding(filePath, content, encoding);
  }

  // Restore permissions if needed
  if (originalPermissions && !IS_WINDOWS) {
    try {
      await setPermissions(filePath, originalPermissions);
    } catch {
      // Ignore permission restoration errors
    }
  }

  // Get file stats
  const stats = await fs.stat(filePath);

  // Detect line ending used
  const lineEnding = detectLineEnding(content);

  return {
    path: filePath,
    bytesWritten: stats.size,
    encoding,
    lineEnding: lineEnding === 'crlf' ? 'CRLF' : lineEnding === 'lf' ? 'LF' : 'CR',
    created: !fileExists,
  };
}

/**
 * Write tool handler for MCP
 */
export async function handleWriteTool(input: unknown): Promise<string> {
  const parsed = WriteToolInputSchema.parse(input);
  const result = await writeFile(parsed);

  return JSON.stringify(
    {
      message: result.created ? `Created file: ${result.path}` : `Updated file: ${result.path}`,
      bytesWritten: result.bytesWritten,
      encoding: result.encoding,
      lineEnding: result.lineEnding,
    },
    null,
    2
  );
}
