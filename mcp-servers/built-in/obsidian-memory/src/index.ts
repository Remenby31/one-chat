#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryManager } from './memory-manager.js';
import { MemoryConfig } from './types.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Calculate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_CONFIG: MemoryConfig = {
  vaultPath: process.env.OBSIDIAN_VAULT_PATH ||
             path.resolve(__dirname, '../../../../vault'),
  obsidianCompatible: true,
  ignorePatterns: ['.obsidian', '.trash', '.git'],
  wikilinks: true,
  tagsFormat: 'both',
  enforceStrictGraph: false,
  rootNoteName: 'root-memory.md'
};

/**
 * Extract a contextual snippet around the first match of any query in the content
 * @param content - The full note content
 * @param queries - The search query or array of queries
 * @param contextLength - Characters to show before and after the match
 * @returns A snippet with the query highlighted in context
 */
function extractSearchSnippet(content: string, queries: string | string[], contextLength = 100): string {
  // Normalize content to a single line for searching
  const normalizedContent = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
  const lowerContent = normalizedContent.toLowerCase();

  // Convert single query to array for uniform handling
  const queryArray = Array.isArray(queries) ? queries : [queries];

  // Find the first occurrence of any query
  let matchIndex = -1;
  let matchedQueryLength = 0;

  for (const query of queryArray) {
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
      matchedQueryLength = query.length;
    }
  }

  if (matchIndex === -1) {
    // No query found, return the beginning of the content
    return normalizedContent.substring(0, contextLength * 2) + '...';
  }

  // Extract context around the match
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(normalizedContent.length, matchIndex + matchedQueryLength + contextLength);

  let snippet = normalizedContent.substring(start, end);

  // Add ellipsis if we're not at the start/end
  if (start > 0) snippet = '...' + snippet;
  if (end < normalizedContent.length) snippet = snippet + '...';

  return snippet;
}

class ObsidianMemoryServer {
  private server: Server;
  private memoryManager: MemoryManager;
  private readonly initPromise: Promise<void>;

  constructor() {
    this.server = new Server(
      {
        name: 'obsidian-memory-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.memoryManager = new MemoryManager(DEFAULT_CONFIG);

    // Initialize immediately - all handlers will await this Promise
    this.initPromise = this.memoryManager
      .initialize()
      .catch(err => {
        console.error('[ObsidianMemoryServer] Initialization failed:', err);
        throw err;
      });

    this.setupHandlers();
  }

  /**
   * Ensure memory manager is fully initialized before processing requests
   * This is called by all handlers to guarantee consistent state
   */
  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      await this.ensureInitialized();
      return {
        tools: [
        {
          name: 'memory_create',
          description: 'Create a new note in the memory vault. The note is created freely; consider adding [[wiki-links]] to reference other notes and build the knowledge graph.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Note title' },
              content: { type: 'string', description: 'Note content in markdown. Use [[Note Title]] syntax to reference other notes and create bidirectional links.' },
              folder: { type: 'string', description: 'Optional folder path' },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional tags'
              },
              aliases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional aliases for the note'
              }
            },
            required: ['title', 'content']
          }
        },
        {
          name: 'memory_read',
          description: 'Read a note from the memory vault',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { 
                type: 'string', 
                description: 'Note ID, title, or path'
              }
            },
            required: ['identifier']
          }
        },
        {
          name: 'memory_update',
          description: 'Update an existing note. Use wikilink references [[Note Title]] to maintain knowledge graph connections.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Note ID, title, or path' },
              content: { type: 'string', description: 'New content in markdown. Use [[Note Title]] syntax to reference other notes and create bidirectional links.' },
              tags: { type: 'array', items: { type: 'string' } },
              aliases: { type: 'array', items: { type: 'string' } }
            },
            required: ['identifier']
          }
        },
        {
          name: 'memory_upsert',
          description: 'Update a note if it exists, or create it if it doesn\'t. Combines create and update logic into one operation. Consider adding [[wiki-links]] to build the knowledge graph.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Note ID, title, or path. Used as title when creating new notes.' },
              content: { type: 'string', description: 'Note content in markdown. Use [[Note Title]] syntax to reference other notes and create bidirectional links.' },
              folder: { type: 'string', description: 'Optional folder path (used when creating new notes)' },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional tags'
              },
              aliases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional aliases for the note'
              }
            },
            required: ['identifier', 'content']
          }
        },
        {
          name: 'memory_delete',
          description: 'Delete a note from the vault',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Note ID, title, or path' }
            },
            required: ['identifier']
          }
        },
        {
          name: 'memory_list',
          description: 'List all notes in the vault or a specific folder',
          inputSchema: {
            type: 'object',
            properties: {
              folder: { type: 'string', description: 'Optional folder to list' }
            }
          }
        },
        {
          name: 'memory_search',
          description: 'Search notes by content, tags, or title. Supports multiple keywords for broader search.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                oneOf: [
                  { type: 'string', description: 'Single search query' },
                  { type: 'array', items: { type: 'string' }, description: 'Multiple search keywords' }
                ],
                description: 'Search query (string) or multiple keywords (array of strings)'
              },
              tags: { type: 'array', items: { type: 'string' } },
              folder: { type: 'string' },
              limit: { type: 'number', default: 20 }
            },
            required: ['query']
          }
        },
        {
          name: 'memory_graph',
          description: 'Get the knowledge graph of all notes and their connections',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'memory_get_root',
          description: 'Get the root index note (entry point of the knowledge graph)',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'memory_validate_graph',
          description: 'Validate that all notes are connected to the root (no orphaned notes)',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await this.ensureInitialized();

      const { name, arguments: args } = request.params;

      if (!args) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'No arguments provided'
        );
      }

      try {
        switch (name) {
          case 'memory_create': {
            const note = await this.memoryManager.createNote(
              args.title as string,
              args.content as string,
              args.folder as string | undefined,
              {
                tags: args.tags as string[] | undefined,
                aliases: args.aliases as string[] | undefined
              }
            );

            // Check if note has wikilinks for suggestion
            const hasWikilinks = note.content.includes('[[') && note.content.includes(']]');
            const suggestion = hasWikilinks
              ? `Note created successfully with links to: ${note.links.join(', ')}`
              : `Note created successfully. Consider adding [[root-memory]] or linking this note from another page to maintain graph connectivity.`;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    note: {
                      id: note.id,
                      title: note.title,
                      path: note.path
                    },
                    reminder: suggestion
                  }, null, 2)
                }
              ]
            };
          }

          case 'memory_read': {
            const note = await this.memoryManager.readNote(args.identifier as string);
            if (!note) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Note not found: ${args.identifier}`
              );
            }
            return {
              content: [
                {
                  type: 'text',
                  text: note.content
                }
              ]
            };
          }

          case 'memory_update': {
            const updates: any = {};
            if (args.content) updates.content = args.content;
            if (args.tags || args.aliases) {
              updates.frontmatter = {};
              if (args.tags) updates.frontmatter.tags = args.tags;
              if (args.aliases) updates.frontmatter.aliases = args.aliases;
            }

            const note = await this.memoryManager.updateNote(
              args.identifier as string,
              updates
            );

            if (!note) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Note not found: ${args.identifier}`
              );
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    note: {
                      id: note.id,
                      title: note.title,
                      path: note.path
                    }
                  }, null, 2)
                }
              ]
            };
          }

          case 'memory_upsert': {
            const frontmatter: any = {};
            if (args.tags) frontmatter.tags = args.tags;
            if (args.aliases) frontmatter.aliases = args.aliases;

            const note = await this.memoryManager.upsertNote(
              args.identifier as string,
              args.content as string,
              Object.keys(frontmatter).length > 0 ? frontmatter : undefined,
              args.folder as string | undefined
            );

            // Check if note has wikilinks for suggestion
            const hasWikilinks = note.content.includes('[[') && note.content.includes(']]');
            const suggestion = hasWikilinks
              ? `Note upserted successfully with links to: ${note.links.join(', ')}`
              : `Note upserted successfully. Consider adding [[root-memory]] or linking this note from another page to maintain graph connectivity.`;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    note: {
                      id: note.id,
                      title: note.title,
                      path: note.path
                    },
                    reminder: suggestion
                  }, null, 2)
                }
              ]
            };
          }

          case 'memory_delete': {
            const success = await this.memoryManager.deleteNote(args.identifier as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success }, null, 2)
                }
              ]
            };
          }

          case 'memory_list': {
            const notes = await this.memoryManager.listNotes(args.folder as string | undefined);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    notes.map(n => ({
                      id: n.id,
                      title: n.title,
                      path: n.path,
                      tags: n.frontmatter.tags,
                      modified: n.modified
                    })),
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'memory_search': {
            const query = args.query as string | string[];
            const queries = Array.isArray(query) ? query : [query];

            // Search for each keyword and combine results
            const allResultsMap = new Map<string, any>();

            for (const q of queries) {
              const results = await this.memoryManager.searchNotes({
                query: q,
                tags: args.tags as string[] | undefined,
                folder: args.folder as string | undefined,
                limit: args.limit as number | undefined
              });

              // Add results to map (deduplicates by note ID)
              for (const note of results) {
                if (!allResultsMap.has(note.id)) {
                  allResultsMap.set(note.id, note);
                }
              }
            }

            // Convert map to array
            const combinedResults = Array.from(allResultsMap.values());

            // Format: Title + contextual snippet for each result
            const formattedResults = combinedResults.map(n => {
              const snippet = extractSearchSnippet(n.content, query);
              return `## ${n.title}\n${snippet}`;
            }).join('\n\n');

            return {
              content: [
                {
                  type: 'text',
                  text: formattedResults || 'No results found.'
                }
              ]
            };
          }

          case 'memory_graph': {
            const graph = await this.memoryManager.getGraph();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(graph, null, 2)
                }
              ]
            };
          }

          case 'memory_get_root': {
            const rootNote = await this.memoryManager.getRootNote();
            if (!rootNote) {
              throw new McpError(
                ErrorCode.InternalError,
                'Root note not found. This should not happen.'
              );
            }
            return {
              content: [
                {
                  type: 'text',
                  text: rootNote.content
                }
              ]
            };
          }

          case 'memory_validate_graph': {
            const validation = await this.memoryManager.validateGraphConnectivity();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    isFullyConnected: validation.isFullyConnected,
                    totalNotes: validation.totalNotes,
                    reachableFromRoot: validation.reachableFromRoot,
                    orphanedCount: validation.orphanedNotes.length,
                    orphanedNotes: validation.orphanedNotes,
                    message: validation.isFullyConnected
                      ? 'All notes are connected to the root. Graph is healthy.'
                      : `Warning: ${validation.orphanedNotes.length} orphaned note(s) detected.`
                  }, null, 2)
                }
              ]
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error}`
        );
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      await this.ensureInitialized();
      return {
        prompts: [
          {
            name: 'tool_call:memory_index',
            description: 'Simulated tool call to retrieve the memory vault root index',
          },
          {
            name: 'tool_result:memory_index',
            description: 'Result of the memory_get_root tool call - shows vault structure',
          }
        ]
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      await this.ensureInitialized();

      const { name } = request.params;

      if (name === 'tool_call:memory_index') {
        // Return structured tool call format for parsing by injection system
        const toolCallData = {
          type: 'tool_call',
          tool_name: 'memory_get_root',
          arguments: {}
        };

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: JSON.stringify(toolCallData)
              }
            }
          ]
        };
      }

      if (name === 'tool_result:memory_index') {
        try {
          // At this point, ensureInitialized() has guaranteed that MemoryManager is ready
          const rootNote = await this.memoryManager.getRootNote();

          if (!rootNote) {
            throw new McpError(
              ErrorCode.InternalError,
              'Root note not found. This should not happen after initialization.'
            );
          }

          // Return only the content - no metadata pollution
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: rootNote.content
                }
              }
            ]
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to get memory index: ${error}`
          );
        }
      }

      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown prompt: ${name}`
      );
    });
  }

  async start() {
    // Wait for initialization to complete before connecting
    await this.initPromise;

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('Obsidian Memory MCP Server started');
  }
}

const server = new ObsidianMemoryServer();
server.start().catch(console.error);