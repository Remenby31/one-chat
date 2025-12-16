import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
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