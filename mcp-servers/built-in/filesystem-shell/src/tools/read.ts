/**
 * Read Tool - Cross-platform file reading
 *
 * Features:
 * - Automatic encoding detection (UTF-8, UTF-16, etc.)
 * - Binary file detection and handling
 * - Image file support (returns base64)
 * - Document conversion (PDF, DOCX, PPTX, RTF, EPUB)
 * - Symlink resolution
 * - Permission checking
 *
 * Limits (same as Claude Code):
 * - 2000 lines max by default
 * - 2000 characters per line max (truncated)
 * - offset/limit for pagination
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { normalizePath, resolveHome } from '../utils/path.js';
import { readFileWithEncoding, detectEncoding, isBinaryFile } from '../utils/encoding.js';
import { detectFileType, isImageFile } from '../utils/fileType.js';
import { checkPermissions, resolveSymlink } from '../utils/permissions.js';
import {
  isConvertibleDocument,
  getDocumentFormat,
  convertDocument,
  DocumentMetadata,
} from '../utils/documentConverter/index.js';

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
  offset: z
    .number()
    .optional()
    .describe('Number of lines to skip from the beginning (default: 0)'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of lines to return (default: 2000)'),
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
  documentMetadata?: DocumentMetadata;
  truncated?: boolean;
  totalLines?: number;
  returnedLines?: number;
  offset?: number;
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
  const extension = path.extname(filePath);

  // Check if this is a convertible document (PDF, DOCX, PPTX, RTF, EPUB)
  const docFormat = getDocumentFormat(fileType.mimeType, extension);
  if (docFormat && isConvertibleDocument(fileType.mimeType, extension)) {
    const buffer = await fs.readFile(filePath);
    const result = await convertDocument(buffer, docFormat, {
      maxLines: input.limit,
      offset: input.offset,
    });

    if (!result.success) {
      throw new Error(result.error || 'Document conversion failed');
    }

    return {
      content: result.content,
      encoding: 'utf-8',
      fileType: `document/${docFormat}`,
      mimeType: fileType.mimeType,
      isBase64: false,
      size: stats.size,
      path: filePath,
      documentMetadata: result.metadata,
      truncated: result.truncated,
      totalLines: result.totalLines,
      returnedLines: result.returnedLines,
      offset: result.offset,
    };
  }

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
  const encoding = input.encoding || (await detectEncoding(filePath));
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

  // Format output for LLM - Document conversion
  if (result.documentMetadata) {
    const output: Record<string, unknown> = {
      message: `Read document: ${result.path}`,
      size: `${(result.size / 1024).toFixed(2)} KB`,
      fileType: result.fileType,
      metadata: result.documentMetadata,
      lines: result.returnedLines,
      content: result.content,
    };

    if (result.truncated) {
      output.pagination = {
        truncated: true,
        totalLines: result.totalLines,
        returnedLines: result.returnedLines,
        offset: result.offset,
      };
      output.note = `Document has ${result.totalLines} lines. Use offset parameter to read more (current offset: ${result.offset}).`;
    }

    return JSON.stringify(output, null, 2);
  }

  // Format output for LLM - Base64
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

  // Format output for LLM - Text
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
