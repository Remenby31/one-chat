/**
 * RTF Document Converter
 *
 * Uses rtf-parser for text extraction
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const rtfParser = require('rtf-parser');
import { ConversionResult, ConversionOptions } from './types.js';
import { processContent } from './chunker.js';

export async function convertRTF(
  buffer: Buffer,
  options: ConversionOptions
): Promise<ConversionResult> {
  try {
    const rtfContent = buffer.toString('utf-8');

    // Parse RTF and extract text
    const text = await parseRTF(rtfContent);

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: {},
        truncated: false,
        error: 'RTF contains no extractable text',
      };
    }

    // Process content like Claude Code
    const { content, truncated, totalLines, returnedLines, offset } = processContent(text, {
      maxLines: options.maxLines,
      maxLineLength: options.maxLineLength,
      offset: options.offset,
    });

    return {
      success: true,
      content,
      format: 'text',
      metadata: {
        wordCount: text.split(/\s+/).filter(Boolean).length,
        charCount: text.length,
        lineCount: totalLines,
      },
      truncated,
      totalLines,
      returnedLines,
      offset,
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      format: 'text',
      metadata: {},
      truncated: false,
      error: `RTF conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Parse RTF content and extract plain text
 */
function parseRTF(rtfContent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rtfParser.string(rtfContent, (err: Error | null, doc: unknown) => {
      if (err) {
        reject(err);
        return;
      }

      const text = extractTextFromRTFDoc(doc);
      resolve(text);
    });
  });
}

/**
 * Recursively extract text from RTF document structure
 */
function extractTextFromRTFDoc(doc: unknown): string {
  const texts: string[] = [];

  function traverse(node: unknown): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item);
      }
      return;
    }

    const record = node as Record<string, unknown>;

    // Extract text value
    if (typeof record.value === 'string' && record.value.trim()) {
      texts.push(record.value);
    }

    // Handle paragraph breaks
    if (record.type === 'paragraph' || record.style === 'paragraph') {
      texts.push('\n');
    }

    // Recurse into content/children
    if (record.content) {
      traverse(record.content);
    }
    if (record.children) {
      traverse(record.children);
    }
  }

  traverse(doc);

  // Clean up multiple newlines
  return texts.join('').replace(/\n{3,}/g, '\n\n').trim();
}
