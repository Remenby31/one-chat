import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import Fuse from 'fuse.js';
import { MemoryNote, NoteFrontmatter, WikiLink } from './types.js';

export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Failed to create directory ${dirPath}:`, error);
  }
}

export function extractWikiLinks(content: string): WikiLink[] {
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: WikiLink[] = [];
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.push({
      original: match[0],
      target: match[1].trim(),
      alias: match[2]?.trim()
    });
  }

  return links;
}

export function extractHashtags(content: string): string[] {
  const hashtagRegex = /#[\w\-\/]+/g;
  const matches = content.match(hashtagRegex) || [];
  return [...new Set(matches.map(tag => tag.substring(1)))];
}

/**
 * Normalize path separators to forward slashes
 * This ensures consistent path handling across Windows/Linux/macOS
 * and allows LLMs to always use forward slashes
 */
export function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

export function normalizeNotePath(notePath: string): string {
  // First normalize slashes to forward slashes
  let normalized = normalizeSlashes(notePath);
  // Remove .md extension if present
  if (normalized.endsWith('.md')) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
}

/**
 * Sanitize filename for filesystem compatibility
 * Removes or replaces invalid characters for Windows/Linux/macOS
 * Invalid chars: < > : " / \ | ? *
 */
export function sanitizeFilename(filename: string): string {
  // Replace invalid characters with a dash
  return filename.replace(/[<>:"|?*\/\\]/g, '-');
}

export function generateNoteId(): string {
  return uuidv4();
}

export async function parseMarkdownFile(filePath: string): Promise<{
  content: string;
  frontmatter: NoteFrontmatter;
  body: string;
}> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  
  return {
    content: fileContent,
    frontmatter: data as NoteFrontmatter,
    body: content
  };
}

/**
 * Normalize escaped newlines in content
 * LLMs sometimes send literal \n instead of actual newline characters
 */
export function normalizeNewlines(content: string): string {
  // Replace literal \n (backslash followed by n) with actual newline
  // But preserve already correct newlines and escaped backslashes
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

export async function writeMarkdownFile(
  filePath: string,
  content: string,
  frontmatter: NoteFrontmatter
): Promise<void> {
  // Clean undefined values from frontmatter to avoid YAML errors
  const cleanFrontmatter = Object.entries(frontmatter).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {} as NoteFrontmatter);

  // Normalize escaped newlines from LLM output
  const normalizedContent = normalizeNewlines(content);

  const matterContent = matter.stringify(normalizedContent, cleanFrontmatter);
  await fs.writeFile(filePath, matterContent, 'utf-8');
}

export function createCrossReference(fromNote: string, toNote: string): string {
  return `[[${toNote}]]`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Find similar text chunks in content when exact match fails
 * Used to provide "did you mean..." suggestions
 */
export function findSimilarChunks(
  content: string,
  searchText: string,
  maxSuggestions: number = 3,
  maxChunkLength: number = 150
): string[] {
  // Split content into meaningful chunks (paragraphs, sections, or significant lines)
  const chunks: string[] = [];

  // Split by double newlines (paragraphs) or markdown headers
  const rawChunks = content.split(/\n\n+|\n(?=#{1,6}\s)/);

  for (const chunk of rawChunks) {
    const trimmed = chunk.trim();
    // Only include chunks with meaningful content (>10 chars, not just whitespace/symbols)
    if (trimmed.length > 10 && /\w{3,}/.test(trimmed)) {
      chunks.push(trimmed);
    }
  }

  // If no good chunks, fall back to lines
  if (chunks.length === 0) {
    const lines = content.split('\n').filter(l => l.trim().length > 10);
    chunks.push(...lines);
  }

  if (chunks.length === 0) {
    return [];
  }

  // Use Fuse.js for fuzzy matching
  const fuse = new Fuse(chunks, {
    includeScore: true,
    threshold: 0.6, // More lenient for suggestions
    ignoreLocation: true,
    minMatchCharLength: 3
  });

  const results = fuse.search(searchText);

  // Get top matches and truncate if needed
  return results
    .slice(0, maxSuggestions)
    .map(result => {
      const chunk = result.item;
      if (chunk.length > maxChunkLength) {
        return chunk.substring(0, maxChunkLength) + '...';
      }
      return chunk;
    });
}