/**
 * PPTX Document Converter
 *
 * Uses node-pptx-parser for text extraction
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PptxParserModule = require('node-pptx-parser');
const PptxParser = PptxParserModule.default || PptxParserModule;
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConversionResult, ConversionOptions } from './types.js';
import { processContent } from './chunker.js';

export async function convertPPTX(
  buffer: Buffer,
  options: ConversionOptions
): Promise<ConversionResult> {
  // node-pptx-parser requires a file path, so write to temp file
  const tempPath = join(tmpdir(), `pptx-${randomUUID()}.pptx`);

  try {
    await fs.writeFile(tempPath, buffer);

    const parser = new PptxParser(tempPath);
    const textContent = await parser.extractText();

    if (!textContent || textContent.length === 0) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: { slideCount: 0 },
        truncated: false,
        error: 'PPTX contains no slides or extractable text',
      };
    }

    // Format text from slides
    const textParts: string[] = [];
    for (let i = 0; i < textContent.length; i++) {
      const slideText = textContent[i];
      if (slideText && slideText.text && slideText.text.length > 0) {
        const slideContent = slideText.text.join('\n');
        if (slideContent.trim()) {
          textParts.push(`--- Slide ${i + 1} ---\n${slideContent}`);
        }
      }
    }

    const text = textParts.join('\n\n');

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: { slideCount: textContent.length },
        truncated: false,
        error: 'PPTX contains no extractable text',
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
        slideCount: textContent.length,
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
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error);

    if (errorMsg.includes('encrypt') || errorMsg.includes('password')) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: {},
        truncated: false,
        error: 'PPTX file is encrypted. Cannot extract text without password.',
      };
    }

    return {
      success: false,
      content: '',
      format: 'text',
      metadata: {},
      truncated: false,
      error: `PPTX conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
