/**
 * Edit Tool - Cross-platform find/replace
 *
 * Features:
 * - String find/replace (literal or regex)
 * - Encoding preservation
 * - Line ending preservation
 * - Atomic writes (prevents corruption)
 * - Multi-line support
 * - Case-sensitive or insensitive matching
 */

import { z } from 'zod';
import { readFile } from './read.js';
import { writeFile } from './write.js';
import { normalizePath, resolveHome } from '../utils/path.js';
import { splitLines, joinLines, detectLineEnding } from '../utils/lineEndings.js';

/**
 * Edit tool input schema
 */
export const EditToolInputSchema = z.object({
  path: z.string().describe('Path to file to edit'),
  find: z.string().describe('Text to find (literal string or regex pattern)'),
  replace: z.string().describe('Replacement text'),
  regex: z
    .boolean()
    .optional()
    .default(false)
    .describe('Treat find as regex pattern'),
  caseInsensitive: z
    .boolean()
    .optional()
    .default(false)
    .describe('Case-insensitive matching'),
  replaceAll: z
    .boolean()
    .optional()
    .default(true)
    .describe('Replace all occurrences (false = replace first only)'),
  multiline: z
    .boolean()
    .optional()
    .default(false)
    .describe('Multiline regex mode (^ and $ match line boundaries)'),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe('Preview changes without writing to file'),
});

export type EditToolInput = z.infer<typeof EditToolInputSchema>;

/**
 * Edit tool output
 */
export interface EditToolOutput {
  path: string;
  originalSize: number;
  newSize: number;
  replacements: number;
  preview?: string;
  dryRun: boolean;
}

/**
 * Edit file with find/replace
 */
export async function editFile(input: EditToolInput): Promise<EditToolOutput> {
  // Normalize path
  const filePath = normalizePath(resolveHome(input.path));

  // Read file with encoding detection
  const fileContent = await readFile({ path: filePath });

  if (fileContent.isBase64) {
    throw new Error('Cannot edit binary files');
  }

  const originalContent = fileContent.content;
  const originalSize = originalContent.length;

  // Detect line ending
  const lineEnding = detectLineEnding(originalContent);

  // Perform find/replace
  let newContent: string;
  let replacements = 0;

  if (input.regex) {
    // Regex mode
    const flags =
      (input.replaceAll ? 'g' : '') +
      (input.caseInsensitive ? 'i' : '') +
      (input.multiline ? 'm' : '');

    const regex = new RegExp(input.find, flags);

    // Count replacements
    const matches = originalContent.match(regex);
    replacements = matches ? matches.length : 0;

    newContent = originalContent.replace(regex, input.replace);
  } else {
    // Literal string mode
    const findStr = input.find;
    const replaceStr = input.replace;

    if (input.replaceAll) {
      // Replace all occurrences
      if (input.caseInsensitive) {
        // Case-insensitive replacement (preserve original case in surrounding text)
        const regex = new RegExp(escapeRegex(findStr), 'gi');
        const matches = originalContent.match(regex);
        replacements = matches ? matches.length : 0;
        newContent = originalContent.replace(regex, replaceStr);
      } else {
        // Case-sensitive replacement
        let tempContent = originalContent;
        while (tempContent.includes(findStr)) {
          tempContent = tempContent.replace(findStr, replaceStr);
          replacements++;
        }
        newContent = tempContent;
      }
    } else {
      // Replace first occurrence only
      const index = input.caseInsensitive
        ? originalContent.toLowerCase().indexOf(findStr.toLowerCase())
        : originalContent.indexOf(findStr);

      if (index !== -1) {
        newContent =
          originalContent.slice(0, index) +
          replaceStr +
          originalContent.slice(index + findStr.length);
        replacements = 1;
      } else {
        newContent = originalContent;
        replacements = 0;
      }
    }
  }

  // Preview mode
  if (input.dryRun) {
    const preview = generatePreview(originalContent, newContent, input.find, replacements);

    return {
      path: filePath,
      originalSize,
      newSize: newContent.length,
      replacements,
      preview,
      dryRun: true,
    };
  }

  // Write file (if changes were made)
  if (replacements > 0) {
    await writeFile({
      path: filePath,
      content: newContent,
      encoding: fileContent.encoding as 'utf-8' | 'utf-16le' | 'utf-16be' | 'ascii' | 'latin1' | 'windows-1252' | undefined,
      createDirectories: false,
      preserveLineEndings: true,
      atomic: true,
    });
  }

  return {
    path: filePath,
    originalSize,
    newSize: newContent.length,
    replacements,
    dryRun: false,
  };
}

/**
 * Escape special regex characters for literal matching
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate preview of changes
 * Shows context around replacements
 */
function generatePreview(original: string, modified: string, find: string, replacements: number): string {
  if (replacements === 0) {
    return 'No matches found. File would remain unchanged.';
  }

  const originalLines = splitLines(original);
  const modifiedLines = splitLines(modified);

  const preview: string[] = [];
  preview.push(`Found ${replacements} replacement(s):\n`);

  // Simple line-by-line diff
  let changesShown = 0;
  const maxChangesToShow = 5;

  for (let i = 0; i < Math.min(originalLines.length, modifiedLines.length); i++) {
    if (originalLines[i] !== modifiedLines[i]) {
      changesShown++;

      if (changesShown <= maxChangesToShow) {
        preview.push(`Line ${i + 1}:`);
        preview.push(`  - ${originalLines[i]}`);
        preview.push(`  + ${modifiedLines[i]}`);
        preview.push('');
      }
    }
  }

  if (changesShown > maxChangesToShow) {
    preview.push(`... and ${changesShown - maxChangesToShow} more change(s)`);
  }

  return preview.join('\n');
}

/**
 * Edit tool handler for MCP
 */
export async function handleEditTool(input: unknown): Promise<string> {
  const parsed = EditToolInputSchema.parse(input);
  const result = await editFile(parsed);

  if (result.dryRun) {
    return JSON.stringify(
      {
        message: 'Dry run - no changes made',
        replacements: result.replacements,
        originalSize: result.originalSize,
        newSize: result.newSize,
        sizeDelta: result.newSize - result.originalSize,
        preview: result.preview,
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      message: result.replacements > 0 ? `Made ${result.replacements} replacement(s)` : 'No matches found',
      path: result.path,
      replacements: result.replacements,
      originalSize: result.originalSize,
      newSize: result.newSize,
      sizeDelta: result.newSize - result.originalSize,
    },
    null,
    2
  );
}
