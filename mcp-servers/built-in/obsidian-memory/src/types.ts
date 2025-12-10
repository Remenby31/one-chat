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
  folder?: string;
  limit?: number;
}

export interface MemoryConfig {
  vaultPath: string;
  obsidianCompatible: boolean;
  ignorePatterns: string[];
  wikilinks: boolean;
  tagsFormat: 'hashtag' | 'frontmatter' | 'both';
  enforceStrictGraph: boolean;
  rootNoteName: string;
}