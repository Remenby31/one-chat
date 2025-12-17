/**
 * Content Chunking Utility
 *
 * Mimics Claude Code's Read tool behavior:
 * - 2000 lines max by default
 * - 2000 characters per line max (truncated)
 * - offset/limit pagination
 */

import { DEFAULT_MAX_LINES, DEFAULT_MAX_LINE_LENGTH } from './types.js';

export interface ChunkResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  returnedLines: number;
  offset: number;
}

export interface ChunkOptions {
  maxLines?: number;
  maxLineLength?: number;
  offset?: number;
}

/**
 * Process content like Claude Code's Read tool
 * - Split into lines
 * - Apply offset (skip N lines)
 * - Limit to maxLines
 * - Truncate lines > maxLineLength
 */
export function processContent(content: string, options: ChunkOptions = {}): ChunkResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const offset = options.offset ?? 0;

  // Split into lines
  const allLines = content.split('\n');
  const totalLines = allLines.length;

  // Apply offset
  const startIndex = Math.min(offset, totalLines);
  const linesAfterOffset = allLines.slice(startIndex);

  // Limit to maxLines
  const limitedLines = linesAfterOffset.slice(0, maxLines);

  // Truncate long lines
  const processedLines = limitedLines.map((line) => {
    if (line.length > maxLineLength) {
      return line.substring(0, maxLineLength) + '...';
    }
    return line;
  });

  const truncated = startIndex + limitedLines.length < totalLines;

  return {
    content: processedLines.join('\n'),
    truncated,
    totalLines,
    returnedLines: processedLines.length,
    offset: startIndex,
  };
}

/**
 * Format content with line numbers like cat -n
 */
export function formatWithLineNumbers(content: string, startLineNumber: number = 1): string {
  const lines = content.split('\n');
  const maxLineNumWidth = String(startLineNumber + lines.length - 1).length;

  return lines
    .map((line, index) => {
      const lineNum = String(startLineNumber + index).padStart(maxLineNumWidth, ' ');
      return `${lineNum}\t${line}`;
    })
    .join('\n');
}
