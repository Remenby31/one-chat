/**
 * Line ending handling utilities
 *
 * Platform differences:
 * - Windows: CRLF (\r\n)
 * - Unix/Linux: LF (\n)
 * - Old Mac: CR (\r) - rare nowadays
 */

import { IS_WINDOWS } from './path.js';

export type LineEnding = 'crlf' | 'lf' | 'cr' | 'mixed';

/**
 * Platform-specific default line ending
 */
export const DEFAULT_LINE_ENDING: LineEnding = IS_WINDOWS ? 'crlf' : 'lf';

/**
 * Detect line ending style in text
 */
export function detectLineEnding(text: string): LineEnding {
  const crlfCount = (text.match(/\r\n/g) || []).length;
  const lfCount = (text.match(/(?<!\r)\n/g) || []).length; // LF not preceded by CR
  const crCount = (text.match(/\r(?!\n)/g) || []).length; // CR not followed by LF

  // If no line endings found, use platform default
  if (crlfCount === 0 && lfCount === 0 && crCount === 0) {
    return DEFAULT_LINE_ENDING;
  }

  // Check for mixed line endings
  const totalLineEndings = crlfCount + lfCount + crCount;
  const dominantCount = Math.max(crlfCount, lfCount, crCount);

  // If more than 10% different line endings, it's mixed
  if ((totalLineEndings - dominantCount) / totalLineEndings > 0.1) {
    return 'mixed';
  }

  // Return dominant line ending
  if (crlfCount >= lfCount && crlfCount >= crCount) {
    return 'crlf';
  }
  if (lfCount >= crCount) {
    return 'lf';
  }
  return 'cr';
}

/**
 * Convert line endings to specified type
 */
export function convertLineEndings(text: string, to: LineEnding): string {
  // First normalize all to LF
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Then convert to target format
  switch (to) {
    case 'crlf':
      return normalized.replace(/\n/g, '\r\n');
    case 'lf':
      return normalized; // Already normalized to LF
    case 'cr':
      return normalized.replace(/\n/g, '\r');
    default:
      return normalized;
  }
}

/**
 * Preserve original line endings
 * Detects the line ending used in original content and applies it to new content
 */
export function preserveLineEndings(originalContent: string, newContent: string): string {
  const detectedEnding = detectLineEnding(originalContent);

  // If mixed or unknown, use platform default
  if (detectedEnding === 'mixed') {
    return convertLineEndings(newContent, DEFAULT_LINE_ENDING);
  }

  return convertLineEndings(newContent, detectedEnding);
}

/**
 * Normalize line endings to LF (for internal processing)
 */
export function normalizeLineEndings(text: string): string {
  return convertLineEndings(text, 'lf');
}

/**
 * Convert to platform-specific line endings
 */
export function toPlatformLineEndings(text: string): string {
  return convertLineEndings(text, DEFAULT_LINE_ENDING);
}

/**
 * Get line ending string for type
 */
export function getLineEndingString(type: LineEnding): string {
  switch (type) {
    case 'crlf':
      return '\r\n';
    case 'lf':
      return '\n';
    case 'cr':
      return '\r';
    default:
      return DEFAULT_LINE_ENDING === 'crlf' ? '\r\n' : '\n';
  }
}

/**
 * Split text into lines (handles all line ending types)
 */
export function splitLines(text: string): string[] {
  // Normalize to LF first for consistent splitting
  const normalized = normalizeLineEndings(text);
  return normalized.split('\n');
}

/**
 * Join lines with specified line ending
 */
export function joinLines(lines: string[], lineEnding: LineEnding = DEFAULT_LINE_ENDING): string {
  const separator = getLineEndingString(lineEnding);
  return lines.join(separator);
}
