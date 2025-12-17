/**
 * PDF Document Converter
 *
 * Uses unpdf for text extraction
 */

import { extractText, getDocumentProxy } from 'unpdf';
import { ConversionResult, ConversionOptions } from './types.js';
import { processContent } from './chunker.js';

export async function convertPDF(
  buffer: Buffer,
  options: ConversionOptions
): Promise<ConversionResult> {
  try {
    const uint8Array = new Uint8Array(buffer);

    // Get document metadata
    let pageCount = 0;
    let title: string | undefined;
    let author: string | undefined;

    try {
      const pdf = await getDocumentProxy(uint8Array);
      pageCount = pdf.numPages;
      const metadata = await pdf.getMetadata().catch(() => null);
      if (metadata?.info) {
        title = (metadata.info as Record<string, unknown>).Title as string | undefined;
        author = (metadata.info as Record<string, unknown>).Author as string | undefined;
      }
    } catch {
      // Continue without metadata
    }

    // Extract text
    const { text, totalPages } = await extractText(uint8Array, {
      mergePages: true,
    });

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: { pageCount: totalPages || pageCount },
        truncated: false,
        error: 'PDF contains no extractable text (may be scanned/image-based)',
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
        pageCount: totalPages || pageCount,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        charCount: text.length,
        lineCount: totalLines,
        title,
        author,
      },
      truncated,
      totalLines,
      returnedLines,
      offset,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error);

    if (errorMsg.includes('password') || errorMsg.includes('encrypt')) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: {},
        truncated: false,
        error: 'PDF is password-protected. Cannot extract text without password.',
      };
    }

    if (errorMsg.includes('corrupt') || errorMsg.includes('invalid')) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: {},
        truncated: false,
        error: 'PDF file appears to be corrupted or invalid.',
      };
    }

    return {
      success: false,
      content: '',
      format: 'text',
      metadata: {},
      truncated: false,
      error: `PDF conversion failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
