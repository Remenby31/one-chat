/**
 * EPUB Document Converter
 *
 * Uses epub2 for text extraction
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const EPubModule = require('epub2');
const EPub = EPubModule.EPub || EPubModule.default || EPubModule;
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConversionResult, ConversionOptions } from './types.js';
import { processContent } from './chunker.js';

interface EpubChapter {
  id?: string;
  title?: string;
}

interface EpubMetadata {
  title?: string;
  creator?: string;
}

interface EpubInstance {
  metadata?: EpubMetadata;
  flow?: EpubChapter[];
  parse: () => void;
  on: (event: string, callback: (error?: Error) => void) => void;
  getChapter: (id: string, callback: (error: Error | null, text: string) => void) => void;
}

export async function convertEPUB(
  buffer: Buffer,
  options: ConversionOptions
): Promise<ConversionResult> {
  // epub2 requires a file path
  const tempPath = join(tmpdir(), `epub-${randomUUID()}.epub`);

  try {
    await fs.writeFile(tempPath, buffer);

    const epub = await openEpub(tempPath);

    // Get metadata
    const title = epub.metadata?.title;
    const author = epub.metadata?.creator;

    // Get chapters/content
    const chapters = epub.flow || [];
    const textParts: string[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (chapter.id) {
        try {
          const chapterText = await getChapterText(epub, chapter.id);
          if (chapterText && chapterText.trim()) {
            const chapterTitle = chapter.title || `Chapter ${i + 1}`;
            textParts.push(`--- ${chapterTitle} ---\n${chapterText}`);
          }
        } catch {
          // Skip unreadable chapters
        }
      }
    }

    const text = textParts.join('\n\n');

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        content: '',
        format: 'text',
        metadata: { chapterCount: chapters.length, title, author },
        truncated: false,
        error: 'EPUB contains no extractable text',
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
        chapterCount: chapters.length,
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
    return {
      success: false,
      content: '',
      format: 'text',
      metadata: {},
      truncated: false,
      error: `EPUB conversion failed: ${error instanceof Error ? error.message : String(error)}`,
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

/**
 * Open and parse EPUB file
 */
function openEpub(filePath: string): Promise<EpubInstance> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath) as EpubInstance;

    epub.on('end', () => {
      resolve(epub);
    });

    epub.on('error', (error?: Error) => {
      reject(error || new Error('Failed to parse EPUB'));
    });

    epub.parse();
  });
}

/**
 * Get chapter text content
 */
function getChapterText(epub: EpubInstance, chapterId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapter(chapterId, (err: Error | null, text: string) => {
      if (err) {
        reject(err);
        return;
      }
      // Strip HTML tags and decode entities
      const plainText = stripHtml(text);
      resolve(plainText);
    });
  });
}

/**
 * Strip HTML tags and decode common entities
 */
function stripHtml(html: string): string {
  return html
    // Remove script and style content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Convert block elements to newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|br)[^>]*>/gi, '\n')
    .replace(/<br[^>]*\/?>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
