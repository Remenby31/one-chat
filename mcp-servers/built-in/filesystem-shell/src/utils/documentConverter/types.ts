/**
 * Document Converter Types
 *
 * Uses same limits as Claude Code:
 * - 2000 lines max by default
 * - 2000 characters per line max (truncated)
 * - offset/limit for pagination
 */

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_LINE_LENGTH = 2000;

export interface DocumentMetadata {
  pageCount?: number;
  wordCount?: number;
  charCount?: number;
  lineCount?: number;
  title?: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
  slideCount?: number;
  chapterCount?: number;
}

export interface ConversionResult {
  success: boolean;
  content: string;
  format: 'text' | 'markdown';
  metadata: DocumentMetadata;
  truncated: boolean;
  totalLines?: number;
  returnedLines?: number;
  offset?: number;
  error?: string;
  warnings?: string[];
}

export interface ConversionOptions {
  maxLines?: number;           // Max lines to return (default: 2000)
  maxLineLength?: number;      // Max chars per line (default: 2000)
  offset?: number;             // Skip first N lines (default: 0)
  outputFormat?: 'text' | 'markdown';
  includeMetadata?: boolean;
}

export type DocumentFormat = 'pdf' | 'docx' | 'pptx' | 'rtf' | 'epub';

export interface ConverterModule {
  canConvert: (mimeType: string, extension: string) => boolean;
  convert: (buffer: Buffer, options?: ConversionOptions) => Promise<ConversionResult>;
}
