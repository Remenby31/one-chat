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
    await this.ensureRootNote();
    await this.rebuildIndex();
  }

  /**
   * Ensure root memory note exists
   * This is the entry point of the knowledge graph
   */
  private async ensureRootNote(): Promise<void> {
    const rootPath = path.join(this.config.vaultPath, this.config.rootNoteName);

    // Handle migration from old index.md to root-memory.md
    if (this.config.rootNoteName === 'root-memory.md') {
      const oldIndexPath = path.join(this.config.vaultPath, 'index.md');
      try {
        await fs.access(oldIndexPath);
        // Old index.md exists, rename it
        await fs.rename(oldIndexPath, rootPath);
        // Update frontmatter ID if possible
        const { frontmatter, body } = await parseMarkdownFile(rootPath);
        const newFrontmatter = {
          ...frontmatter,
          id: 'root-memory'
        };
        await writeMarkdownFile(rootPath, body, newFrontmatter);
        return;
      } catch {
        // Old index.md doesn't exist, continue to create new root note
      }
    }

    try {
      await fs.access(rootPath);
    } catch {
      // Root note doesn't exist, create it
      const rootContent = `# Root Memory

Entry point to the knowledge graph.

All notes should be accessible from this root note or connected through other notes.`;

      const rootFrontmatter = {
        id: 'root-memory',
        created: formatDate(new Date()),
        modified: formatDate(new Date()),
        tags: ['root']
      };

      await writeMarkdownFile(rootPath, rootContent, rootFrontmatter);
    }
  }

  async rebuildIndex(): Promise<void> {
    this.notesIndex.clear();

    // Normalize vault path to forward slashes for glob compatibility
    // On Windows, path.join produces backslashes, but glob expects forward slashes
    const vaultPathNormalized = this.config.vaultPath
      .split(path.sep)
      .join('/');

    const pattern = `${vaultPathNormalized}/**/*.md`;
    console.error(`[rebuildIndex] Vault path: ${this.config.vaultPath}`);
    console.error(`[rebuildIndex] Normalized path: ${vaultPathNormalized}`);
    console.error(`[rebuildIndex] Glob pattern: ${pattern}`);

    // Normalize ignore patterns to use forward slashes
    const ignorePatterns = this.config.ignorePatterns.map(p =>
      `${vaultPathNormalized}/${p}`
    );
    console.error(`[rebuildIndex] Ignore patterns:`, ignorePatterns);

    const files = await glob(pattern, {
      ignore: ignorePatterns
    });

    console.error(`[rebuildIndex] Found ${files.length} files:`, files);

    for (const file of files) {
      try {
        const note = await this.loadNoteFromFile(file);
        console.error(`[rebuildIndex] Loaded note: ${note.id} (isRoot: ${note.isRoot}) from ${file}`);
        this.notesIndex.set(note.id, note);
      } catch (error) {
        console.error(`Failed to load note ${file}:`, error);
      }
    }

    console.error(`[rebuildIndex] Total notes in index: ${this.notesIndex.size}`);
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
      modified: frontmatter.modified ? new Date(frontmatter.modified) : stats.mtime,
      isRoot: frontmatter.id === 'root-memory' || frontmatter.id === 'root-index'
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
    // Create note without strict graph validation
    // LLM is responsible for managing links and graph connectivity
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

  /**
   * Upsert a note: Update if exists, create if doesn't exist
   * Combines the logic of both createNote and updateNote
   */
  async upsertNote(
    identifier: string,
    content: string,
    frontmatter?: Partial<NoteFrontmatter>,
    folder?: string
  ): Promise<MemoryNote> {
    // Try to find existing note
    const existingNote = await this.readNote(identifier);

    if (existingNote) {
      // Note exists: use update logic
      const updates = {
        content,
        frontmatter
      };

      const updatedNote = await this.updateNote(existingNote.id, updates);
      if (!updatedNote) {
        throw new Error(`Failed to update note: ${identifier}`);
      }
      return updatedNote;
    }

    // Note doesn't exist: use create logic
    // Use identifier as title if it looks like a title, otherwise generate new note
    const title = identifier.includes('/') || identifier.startsWith('root-')
      ? 'Untitled'
      : identifier;

    return await this.createNote(title, content, folder, frontmatter);
  }

  async deleteNote(identifier: string): Promise<boolean> {
    const note = await this.readNote(identifier);
    if (!note) return false;

    // Protect root note from deletion
    if (note.isRoot) {
      throw new Error(
        'CANNOT_DELETE_ROOT: Cannot delete the root index note. ' +
        'The root note is required to maintain graph connectivity.'
      );
    }

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

  /**
   * Validate that the entire graph is connected
   * Uses BFS to find all reachable notes from root
   */
  async validateGraphConnectivity(): Promise<import('./types.js').GraphValidation> {
    // Find root note
    const rootNote = Array.from(this.notesIndex.values()).find(n => n.isRoot);

    if (!rootNote) {
      return {
        isFullyConnected: false,
        totalNotes: this.notesIndex.size,
        reachableFromRoot: 0,
        orphanedNotes: Array.from(this.notesIndex.keys())
      };
    }

    // BFS from root
    const reachable = new Set<string>();
    const queue: string[] = [rootNote.id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (reachable.has(currentId)) continue;
      reachable.add(currentId);

      const currentNote = this.notesIndex.get(currentId);
      if (!currentNote) continue;

      // Add linked notes (outgoing links)
      for (const link of currentNote.links) {
        const linkedNote = this.findNoteByPath(link);
        if (linkedNote && !reachable.has(linkedNote.id)) {
          queue.push(linkedNote.id);
        }
      }

      // Add notes that link to this one (incoming links / backlinks)
      for (const backlink of currentNote.backlinks) {
        const backlinkNote = this.findNoteByPath(backlink);
        if (backlinkNote && !reachable.has(backlinkNote.id)) {
          queue.push(backlinkNote.id);
        }
      }
    }

    const allNoteIds = Array.from(this.notesIndex.keys());
    const orphanedIds = allNoteIds.filter(id => !reachable.has(id));

    return {
      isFullyConnected: orphanedIds.length === 0,
      totalNotes: this.notesIndex.size,
      reachableFromRoot: reachable.size,
      orphanedNotes: orphanedIds,
      unreachableNotes: orphanedIds.map(id => this.notesIndex.get(id)!).filter(Boolean)
    };
  }

  /**
   * Find orphaned notes (not reachable from root)
   */
  async findOrphanNotes(): Promise<import('./types.js').MemoryNote[]> {
    const validation = await this.validateGraphConnectivity();
    return validation.unreachableNotes || [];
  }

  /**
   * Get the root note
   */
  async getRootNote(): Promise<import('./types.js').MemoryNote | null> {
    console.error(`[getRootNote] Searching in ${this.notesIndex.size} notes`);
    const allNotes = Array.from(this.notesIndex.values());
    console.error(`[getRootNote] Notes:`, allNotes.map(n => ({ id: n.id, isRoot: n.isRoot, path: n.path })));
    const rootNote = allNotes.find(n => n.isRoot);
    console.error(`[getRootNote] Found root:`, rootNote ? rootNote.id : 'NOT FOUND');
    return rootNote || null;
  }
}