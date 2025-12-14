/**
 * Read Tool - Cross-platform file reading
 *
 * Features:
 * - Automatic encoding detection (UTF-8, UTF-16, etc.)
 * - Binary file detection and handling
 * - Image file support (returns base64)
 * - Symlink resolution
 * - Permission checking
 */

import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { normalizePath, resolveHome } from '../utils/path.js';
import { readFileWithEncoding, detectEncoding, isBinaryFile } from '../utils/encoding.js';
import { detectFileType, isImageFile } from '../utils/fileType.js';
import { checkPermissions, resolveSymlink } from '../utils/permissions.js';

/**
 * Read tool input schema
 */
export const ReadToolInputSchema = z.object({
  path: z.string().describe('Path to file to read (absolute or relative)'),
  encoding: z
    .enum(['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'latin1', 'windows-1252'])
    .optional()
    .describe('Force specific encoding (auto-detected if not provided)'),
  asBase64: z
    .boolean()
    .optional()
    .describe('Return binary/image files as base64 (default: true for images)'),
});

export type ReadToolInput = z.infer<typeof ReadToolInputSchema>;

/**
 * Read tool output
 */
export interface ReadToolOutput {
  content: string;
  encoding: string;
  fileType: string;
  mimeType?: string;
  isBase64: boolean;
  size: number;
  path: string;
}

/**
 * Read file with cross-platform handling
 */
export async function readFile(input: ReadToolInput): Promise<ReadToolOutput> {
  // Normalize and resolve path
  let filePath = normalizePath(resolveHome(input.path));

  // Check permissions
  const permissions = await checkPermissions(filePath);

  if (!permissions.exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (!permissions.readable) {
    throw new Error(`File not readable (permission denied): ${filePath}`);
  }

  // Resolve symlinks
  filePath = await resolveSymlink(filePath);

  // Get file stats
  const stats = await fs.stat(filePath);

  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }

  // Detect file type
  const fileType = await detectFileType(filePath);

  // Handle binary files
  const isBinary = await isBinaryFile(filePath);
  const isImage = await isImageFile(filePath);

  // Determine if we should return base64
  const shouldReturnBase64 = input.asBase64 ?? isImage;

  if (isBinary || shouldReturnBase64) {
    // Read as base64
    const buffer = await fs.readFile(filePath);
    const base64Content = buffer.toString('base64');

    return {
      content: base64Content,
      encoding: 'base64',
      fileType: fileType.type,
      mimeType: fileType.mimeType,
      isBase64: true,
      size: stats.size,
      path: filePath,
    };
  }

  // Read as text
  const encoding = input.encoding || await detectEncoding(filePath);
  const content = await readFileWithEncoding(filePath, encoding);

  return {
    content,
    encoding,
    fileType: fileType.type,
    mimeType: fileType.mimeType,
    isBase64: false,
    size: stats.size,
    path: filePath,
  };
}

/**
 * Read tool handler for MCP
 */
export async function handleReadTool(input: unknown): Promise<string> {
  const parsed = ReadToolInputSchema.parse(input);
  const result = await readFile(parsed);

  // Format output for LLM
  if (result.isBase64) {
    return JSON.stringify(
      {
        message: `Read ${result.fileType} file: ${result.path}`,
        size: `${(result.size / 1024).toFixed(2)} KB`,
        encoding: result.encoding,
        mimeType: result.mimeType,
        content: result.content,
        note: 'Content is base64-encoded. Decode to access raw bytes.',
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      message: `Read file: ${result.path}`,
      size: `${(result.size / 1024).toFixed(2)} KB`,
      encoding: result.encoding,
      fileType: result.fileType,
      lines: result.content.split('\n').length,
      content: result.content,
    },
    null,
    2
  );
}
