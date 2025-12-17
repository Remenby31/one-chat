/**
 * Document Converter - Main Facade
 *
 * Unified API for converting various document formats to text
 * Uses same limits as Claude Code (2000 lines, 2000 chars/line)
 */

import { ConversionResult, ConversionOptions, DocumentFormat } from './types.js';
import { convertPDF } from './pdf.js';
import { convertDOCX } from './docx.js';
import { convertPPTX } from './pptx.js';
import { convertRTF } from './rtf.js';
import { convertEPUB } from './epub.js';

// MIME type to format mapping
const MIME_TO_FORMAT: Record<string, DocumentFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/rtf': 'rtf',
  'application/rtf': 'rtf',
  'application/epub+zip': 'epub',
};

// Extension to format mapping (fallback)
const EXT_TO_FORMAT: Record<string, DocumentFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  pptx: 'pptx',
  rtf: 'rtf',
  epub: 'epub',
};

/**
 * Check if file format is convertible
 */
export function isConvertibleDocument(mimeType?: string, extension?: string): boolean {
  if (mimeType && MIME_TO_FORMAT[mimeType]) return true;
  if (extension && EXT_TO_FORMAT[extension.toLowerCase().replace(/^\./, '')]) return true;
  return false;
}

/**
 * Get document format from MIME type or extension
 */
export function getDocumentFormat(mimeType?: string, extension?: string): DocumentFormat | null {
  if (mimeType && MIME_TO_FORMAT[mimeType]) {
    return MIME_TO_FORMAT[mimeType];
  }
  if (extension) {
    const ext = extension.toLowerCase().replace(/^\./, '');
    if (EXT_TO_FORMAT[ext]) {
      return EXT_TO_FORMAT[ext];
    }
  }
  return null;
}

/**
 * Convert document to text
 */
export async function convertDocument(
  buffer: Buffer,
  format: DocumentFormat,
  options: ConversionOptions = {}
): Promise<ConversionResult> {
  const defaultOptions: ConversionOptions = {
    outputFormat: 'text',
    includeMetadata: true,
    ...options,
  };

  try {
    switch (format) {
      case 'pdf':
        return await convertPDF(buffer, defaultOptions);
      case 'docx':
        return await convertDOCX(buffer, defaultOptions);
      case 'pptx':
        return await convertPPTX(buffer, defaultOptions);
      case 'rtf':
        return await convertRTF(buffer, defaultOptions);
      case 'epub':
        return await convertEPUB(buffer, defaultOptions);
      default:
        return {
          success: false,
          content: '',
          format: 'text',
          metadata: {},
          truncated: false,
          error: `Unsupported format: ${format}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      content: '',
      format: 'text',
      metadata: {},
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export * from './types.js';
