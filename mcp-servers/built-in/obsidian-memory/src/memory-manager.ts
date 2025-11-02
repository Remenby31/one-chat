import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import Fuse from 'fuse.js';
import {
  MemoryNote,
  NoteFrontmatter,
  SearchOptions,
  MemoryConfig,
  WikiLink
} from './types.js';
import {
  ensureDirectory,
  extractWikiLinks,
  extractHashtags,
  normalizeNotePath,
  generateNoteId,
  parseMarkdownFile,
  writeMarkdownFile,
  formatDate
} from './utils.js';

export class MemoryManager {
  private config: MemoryConfig;
  private notesIndex: Map<string, MemoryNote> = new Map();
  private searchIndex: Fuse<MemoryNote> | null = null;

  constructor(config: MemoryConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await ensureDirectory(this.config.vaultPath);
    await this.rebuildIndex();
  }

  async rebuildIndex(): Promise<void> {
    this.notesIndex.clear();
    
    const pattern = path.join(this.config.vaultPath, '**/*.md');
    const files = await glob(pattern, {
      ignore: this.config.ignorePatterns.map(p => 
        path.join(this.config.vaultPath, p)
      )
    });

    for (const file of files) {
      try {
        const note = await this.loadNoteFromFile(file);
        this.notesIndex.set(note.id, note);
      } catch (error) {
        console.error(`Failed to load note ${file}:`, error);
      }
    }

    await this.updateBacklinks();
    this.buildSearchIndex();
  }

  private async loadNoteFromFile(filePath: string): Promise<MemoryNote> {
    const { frontmatter, body } = await parseMarkdownFile(filePath);
    const stats = await fs.stat(filePath);
    
    const relativePath = path.relative(this.config.vaultPath, filePath);
    const title = path.basename(filePath, '.md');
    const links = extractWikiLinks(body);
    const tags = this.extractAllTags(body, frontmatter);

    const note: MemoryNote = {
      id: frontmatter.id || generateNoteId(),
      path: relativePath,
      title: frontmatter.title || title,
      content: body,
      frontmatter: {
        ...frontmatter,
        tags: tags
      },
      links: links.map(l => normalizeNotePath(l.target)),
      backlinks: [],
      created: frontmatter.created ? new Date(frontmatter.created) : stats.birthtime,
      modified: frontmatter.modified ? new Date(frontmatter.modified) : stats.mtime
    };

    return note;
  }

  private extractAllTags(content: string, frontmatter: NoteFrontmatter): string[] {
    const tags = new Set<string>();

    if (this.config.tagsFormat === 'hashtag' || this.config.tagsFormat === 'both') {
      extractHashtags(content).forEach(tag => tags.add(tag));
    }

    if (this.config.tagsFormat === 'frontmatter' || this.config.tagsFormat === 'both') {
      (frontmatter.tags || []).forEach(tag => tags.add(tag));
    }

    return Array.from(tags);
  }

  private async updateBacklinks(): Promise<void> {
    for (const note of this.notesIndex.values()) {
      note.backlinks = [];
    }

    for (const note of this.notesIndex.values()) {
      for (const link of note.links) {
        const targetNote = this.findNoteByPath(link);
        if (targetNote) {
          targetNote.backlinks.push(note.title);
        }
      }
    }
  }

  private findNoteByPath(notePath: string): MemoryNote | undefined {
    const normalized = normalizeNotePath(notePath);
    
    for (const note of this.notesIndex.values()) {
      const notePathNormalized = normalizeNotePath(note.path);
      const noteTitleNormalized = normalizeNotePath(note.title);
      
      if (notePathNormalized === normalized || 
          noteTitleNormalized === normalized ||
          note.frontmatter.aliases?.includes(normalized)) {
        return note;
      }
    }
    
    return undefined;
  }

  private buildSearchIndex(): void {
    const notes = Array.from(this.notesIndex.values());
    
    this.searchIndex = new Fuse(notes, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'content', weight: 1 },
        { name: 'frontmatter.tags', weight: 1.5 },
        { name: 'frontmatter.aliases', weight: 1.5 }
      ],
      includeScore: true,
      threshold: 0.3
    });
  }

  async createNote(
    title: string,
    content: string,
    folder?: string,
    frontmatter?: Partial<NoteFrontmatter>
  ): Promise<MemoryNote> {
    const noteId = generateNoteId();
    const now = new Date();
    
    const notePath = folder 
      ? path.join(folder, `${title}.md`)
      : `${title}.md`;
    
    const fullPath = path.join(this.config.vaultPath, notePath);
    const dir = path.dirname(fullPath);
    await ensureDirectory(dir);

    const fullFrontmatter: NoteFrontmatter = {
      id: noteId,
      created: formatDate(now),
      modified: formatDate(now),
      ...frontmatter
    };

    await writeMarkdownFile(fullPath, content, fullFrontmatter);
    
    const note = await this.loadNoteFromFile(fullPath);
    this.notesIndex.set(note.id, note);
    
    await this.updateBacklinks();
    this.buildSearchIndex();
    
    return note;
  }

  async readNote(identifier: string): Promise<MemoryNote | null> {
    let note = this.notesIndex.get(identifier);
    
    if (!note) {
      note = this.findNoteByPath(identifier);
    }
    
    return note || null;
  }

  async updateNote(
    identifier: string,
    updates: {
      content?: string;
      frontmatter?: Partial<NoteFrontmatter>;
    }
  ): Promise<MemoryNote | null> {
    const note = await this.readNote(identifier);
    if (!note) return null;

    const fullPath = path.join(this.config.vaultPath, note.path);
    const { frontmatter: currentFrontmatter, body } = await parseMarkdownFile(fullPath);
    
    const newContent = updates.content ?? body;
    const newFrontmatter: NoteFrontmatter = {
      ...currentFrontmatter,
      ...updates.frontmatter,
      modified: formatDate(new Date())
    };

    await writeMarkdownFile(fullPath, newContent, newFrontmatter);
    
    const updatedNote = await this.loadNoteFromFile(fullPath);
    this.notesIndex.set(updatedNote.id, updatedNote);
    
    await this.updateBacklinks();
    this.buildSearchIndex();
    
    return updatedNote;
  }

  async deleteNote(identifier: string): Promise<boolean> {
    const note = await this.readNote(identifier);
    if (!note) return false;

    const fullPath = path.join(this.config.vaultPath, note.path);
    await fs.unlink(fullPath);
    
    this.notesIndex.delete(note.id);
    await this.updateBacklinks();
    this.buildSearchIndex();
    
    return true;
  }

  async searchNotes(options: SearchOptions): Promise<MemoryNote[]> {
    if (!this.searchIndex) return [];

    let results = this.searchIndex.search(options.query);
    
    if (options.tags && options.tags.length > 0) {
      results = results.filter(result => {
        const noteTags = result.item.frontmatter.tags || [];
        return options.tags!.some(tag => noteTags.includes(tag));
      });
    }

    if (options.folder) {
      results = results.filter(result => 
        result.item.path.startsWith(options.folder!)
      );
    }

    const limit = options.limit || 20;
    return results.slice(0, limit).map(r => r.item);
  }

  async listNotes(folder?: string): Promise<MemoryNote[]> {
    let notes = Array.from(this.notesIndex.values());
    
    if (folder) {
      notes = notes.filter(note => note.path.startsWith(folder));
    }
    
    return notes.sort((a, b) => 
      b.modified.getTime() - a.modified.getTime()
    );
  }

  async createLink(fromId: string, toId: string): Promise<boolean> {
    const fromNote = await this.readNote(fromId);
    const toNote = await this.readNote(toId);
    
    if (!fromNote || !toNote) return false;

    const linkText = `[[${toNote.title}]]`;
    if (!fromNote.content.includes(linkText)) {
      const newContent = fromNote.content + `\n\n${linkText}`;
      await this.updateNote(fromId, { content: newContent });
    }
    
    return true;
  }

  async getBacklinks(identifier: string): Promise<MemoryNote[]> {
    const note = await this.readNote(identifier);
    if (!note) return [];

    return note.backlinks
      .map(title => this.findNoteByPath(title))
      .filter(n => n !== undefined) as MemoryNote[];
  }

  async getGraph(): Promise<{
    nodes: Array<{ id: string; title: string; group: string }>;
    links: Array<{ source: string; target: string }>;
  }> {
    const nodes = Array.from(this.notesIndex.values()).map(note => ({
      id: note.id,
      title: note.title,
      group: path.dirname(note.path)
    }));

    const links: Array<{ source: string; target: string }> = [];
    
    for (const note of this.notesIndex.values()) {
      for (const link of note.links) {
        const targetNote = this.findNoteByPath(link);
        if (targetNote) {
          links.push({
            source: note.id,
            target: targetNote.id
          });
        }
      }
    }

    return { nodes, links };
  }
}