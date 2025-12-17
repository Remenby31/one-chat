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
  vaultPath: process.env.MEMORY_VAULT_PATH ||
             path.resolve(__dirname, '../../../../vault'),
  markdownCompatible: true,
  ignorePatterns: ['.trash', '.git'],
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

class MemoryServer {
  private server: Server;
  private memoryManager: MemoryManager;
  private readonly initPromise: Promise<void>;

  constructor() {
    this.server = new Server(
      {
        name: 'memory-mcp',
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
        console.error('[MemoryServer] Initialization failed:', err);
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
          name: 'create',
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
          name: 'read',
          description: 'Read a note from the memory vault. Use the path (e.g., "folder/note") for unique identification.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Note path (recommended, e.g., "folder/note"), title, or UUID. Use forward slashes for paths.'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'edit',
          description: 'Edit a portion of a note by finding and replacing text. Use wikilink references [[Note Title]] to maintain knowledge graph connections.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Note ID, title, or path' },
              old_content: { type: 'string', description: 'The text section to find and replace' },
              new_content: { type: 'string', description: 'New content in markdown. Use [[Note Title]] syntax to reference other notes and create bidirectional links.' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags to add/update' },
              aliases: { type: 'array', items: { type: 'string' }, description: 'Optional aliases to add/update' }
            },
            required: ['id', 'old_content', 'new_content']
          }
        },
        {
          name: 'delete',
          description: 'Delete a note from the vault',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Note ID, title, or path' }
            },
            required: ['id']
          }
        },
        {
          name: 'list',
          description: 'List all notes in the vault or a specific folder',
          inputSchema: {
            type: 'object',
            properties: {
              folder: { type: 'string', description: 'Optional folder to list' }
            }
          }
        },
        {
          name: 'search',
          description: 'Search notes by content, title, path, or tags. Returns results with path for unique identification.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                oneOf: [
                  { type: 'string', description: 'Single search query' },
                  { type: 'array', items: { type: 'string' }, description: 'Multiple search keywords' }
                ],
                description: 'Search query (string) or multiple keywords (array of strings). Searches in title, content, tags, and aliases.'
              },
              folder: { type: 'string', description: 'Optional folder to limit search to' },
              limit: { type: 'number', description: 'Maximum number of results (default: 20)' }
            },
            required: ['query']
          }
        },
        {
          name: 'get_root',
          description: 'Get the root index note (entry point of the knowledge graph)',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
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
          case 'create': {
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

          case 'read': {
            const note = await this.memoryManager.readNote(args.id as string);
            if (!note) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Note not found: ${args.id}`
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

          case 'edit': {
            const note = await this.memoryManager.editNote(
              args.id as string,
              args.old_content as string,
              args.new_content as string
            );

            if (!note) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Note not found: ${args.id}`
              );
            }

            // Apply tags/aliases updates if provided
            if (args.tags || args.aliases) {
              const updates: any = {
                frontmatter: {}
              };
              if (args.tags) updates.frontmatter.tags = args.tags;
              if (args.aliases) updates.frontmatter.aliases = args.aliases;

              const updatedNote = await this.memoryManager.updateNote(note.id, updates);
              if (updatedNote) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        success: true,
                        note: {
                          id: updatedNote.id,
                          title: updatedNote.title,
                          path: updatedNote.path
                        }
                      }, null, 2)
                    }
                  ]
                };
              }
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

          case 'delete': {
            const success = await this.memoryManager.deleteNote(args.id as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success }, null, 2)
                }
              ]
            };
          }

          case 'list': {
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

          case 'search': {
            const query = args.query as string | string[];
            const queries = Array.isArray(query) ? query : [query];

            // Search for each keyword and combine results
            const allResultsMap = new Map<string, any>();

            for (const q of queries) {
              const results = await this.memoryManager.searchNotes({
                query: q,
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

          case 'get_root': {
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
            name: 'tool_call:get_root',
            description: 'Simulated tool call to retrieve the memory vault root note',
          },
          {
            name: 'tool_result:get_root',
            description: 'Result of the get_root tool call - shows vault structure and entry points',
          }
        ]
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      await this.ensureInitialized();

      const { name } = request.params;

      if (name === 'tool_call:get_root') {
        // Return structured tool call format for parsing by injection system
        const toolCallData = {
          type: 'tool_call',
          tool_name: 'get_root',
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

      if (name === 'tool_result:get_root') {
        try {
          // At this point, ensureInitialized() has guaranteed that MemoryManager is ready
          const rootNote = await this.memoryManager.getRootNote();

          if (!rootNote) {
            throw new McpError(
              ErrorCode.InternalError,
              'Root note not found. This should not happen after initialization.'
            );
          }

          // Return content with metadata so the AI knows the root note's ID
          const rootNoteInfo = `[Root Note Metadata]
ID: ${rootNote.id}
Title: ${rootNote.title}
Path: ${rootNote.path}
Links: ${rootNote.links.length > 0 ? rootNote.links.join(', ') : 'none'}

[Content]
${rootNote.content}`;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: rootNoteInfo
                }
              }
            ]
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to get root note: ${error}`
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
  }
}

const server = new MemoryServer();
server.start().catch(console.error);