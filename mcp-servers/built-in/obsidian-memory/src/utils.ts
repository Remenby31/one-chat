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

export function normalizeNotePath(notePath: string): string {
  if (notePath.endsWith('.md')) {
    return notePath.slice(0, -3);
  }
  return notePath;
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
  
  const matterContent = matter.stringify(content, cleanFrontmatter);
  await fs.writeFile(filePath, matterContent, 'utf-8');
}

export function createCrossReference(fromNote: string, toNote: string): string {
  return `[[${toNote}]]`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}