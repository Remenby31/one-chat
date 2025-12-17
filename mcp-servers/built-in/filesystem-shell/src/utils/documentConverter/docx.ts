/**
 * DOCX Document Converter
 *
 * Uses mammoth for text extraction
 */

import mammoth from 'mammoth';
import { ConversionResult, ConversionOptions } from './types.js';
import { processContent } from './chunker.js';

export async function convertDOCX(
  buffer: Buffer,
  options: ConversionOptions
): Promise<ConversionResult> {
  try {
    // Extract raw text
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // Collect warnings
    const warnings = result.messages
      .filter((m) => m.type === 'warning')
      .map((m) => m.message);

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: {},
        truncated: false,
        error: 'DOCX contains no extractable text',
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
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error);

    if (errorMsg.includes('encrypt') || errorMsg.includes('password')) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: {},
        truncated: false,
        error: 'DOCX file is encrypted. Cannot extract text without password.',
      };
    }

    return {
      success: false,
      content: '',
      format: 'text',
      metadata: {},
      truncated: false,
      error: `DOCX conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
