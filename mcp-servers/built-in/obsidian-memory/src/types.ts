export interface MemoryNote {
  id: string;
  path: string;
  title: string;
  content: string;
  frontmatter: NoteFrontmatter;
  links: string[];
  backlinks: string[];
  created: Date;
  modified: Date;
  isRoot?: boolean; // true if this is the root index note
}

export interface NoteFrontmatter {
  id?: string;
  aliases?: string[];
  tags?: string[];
  created?: string;
  modified?: string;
  references?: string[];
  [key: string]: any;
}

export interface WikiLink {
  original: string;
  target: string;
  alias?: string;
}

export interface SearchOptions {
  query: string;
  tags?: string[];
  folder?: string;
  limit?: number;
}

export interface MemoryConfig {
  vaultPath: string;
  obsidianCompatible: boolean;
  ignorePatterns: string[];
  wikilinks: boolean;
  tagsFormat: 'hashtag' | 'frontmatter' | 'both';
  enforceStrictGraph: boolean; // Enforce that all notes must be connected to root
  rootNoteName: string; // Name of the root index file
}

export interface GraphValidation {
  isFullyConnected: boolean;
  totalNotes: number;
  reachableFromRoot: number;
  orphanedNotes: string[]; // IDs of orphaned notes
  unreachableNotes?: MemoryNote[]; // Full details of unreachable notes
}

export interface CreateNoteOptions {
  title: string;
  content: string;
  folder?: string;
  linkedFrom?: string | string[]; // Note IDs/titles that should link to this new note
  frontmatter?: Partial<NoteFrontmatter>;
}