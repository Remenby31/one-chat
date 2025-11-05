#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryManager } from './memory-manager.js';
import { MemoryConfig } from './types.js';
import * as path from 'path';

const DEFAULT_CONFIG: MemoryConfig = {
  vaultPath: process.env.OBSIDIAN_VAULT_PATH || './vault',
  obsidianCompatible: true,
  ignorePatterns: ['.obsidian', '.trash', '.git'],
  wikilinks: true,
  tagsFormat: 'both',
  enforceStrictGraph: true,
  rootNoteName: '_index.md'
};

class ObsidianMemoryServer {
  private server: Server;
  private memoryManager: MemoryManager;

  constructor() {
    this.server = new Server(
      {
        name: 'obsidian-memory-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.memoryManager = new MemoryManager(DEFAULT_CONFIG);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'memory_create',
          description: 'Create a new note in the memory vault. IMPORTANT: Must specify linkedFrom OR include [[wiki-links]] in content to maintain graph connectivity. Notes without connections will be rejected.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Note title' },
              content: { type: 'string', description: 'Note content in markdown. Use [[Note Title]] syntax to reference other notes and create automatic bidirectional links.' },
              folder: { type: 'string', description: 'Optional folder path' },
              linkedFrom: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional: IDs or titles of existing notes that should link to this new note. If not specified, content must contain [[wiki-links]].'
              },
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
          description: 'Update an existing note. IMPORTANT: Always use wikilink references [[Note Title]] when referencing other notes to maintain knowledge graph connections.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Note ID, title, or path' },
              content: { type: 'string', description: 'New content in markdown. Use [[Note Title]] syntax to reference other notes and create automatic bidirectional links.' },
              tags: { type: 'array', items: { type: 'string' } },
              aliases: { type: 'array', items: { type: 'string' } }
            },
            required: ['identifier']
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
          description: 'Search notes by content, tags, or title',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              tags: { type: 'array', items: { type: 'string' } },
              folder: { type: 'string' },
              limit: { type: 'number', default: 20 }
            },
            required: ['query']
          }
        },
        {
          name: 'memory_link',
          description: 'Create a link between two notes',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source note identifier' },
              to: { type: 'string', description: 'Target note identifier' }
            },
            required: ['from', 'to']
          }
        },
        {
          name: 'memory_backlinks',
          description: 'Get all notes that link to a specific note',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: { type: 'string', description: 'Note identifier' }
            },
            required: ['identifier']
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
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
              },
              args.linkedFrom as string[] | string | undefined
            );
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
                  text: JSON.stringify({
                    id: note.id,
                    title: note.title,
                    path: note.path,
                    content: note.content,
                    frontmatter: note.frontmatter,
                    links: note.links,
                    backlinks: note.backlinks
                  }, null, 2)
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
            const results = await this.memoryManager.searchNotes({
              query: args.query as string,
              tags: args.tags as string[] | undefined,
              folder: args.folder as string | undefined,
              limit: args.limit as number | undefined
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    results.map(n => ({
                      id: n.id,
                      title: n.title,
                      path: n.path,
                      excerpt: n.content.substring(0, 200) + '...'
                    })),
                    null,
                    2
                  )
                }
              ]
            };
          }

          case 'memory_link': {
            const success = await this.memoryManager.createLink(
              args.from as string,
              args.to as string
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success }, null, 2)
                }
              ]
            };
          }

          case 'memory_backlinks': {
            const backlinks = await this.memoryManager.getBacklinks(args.identifier as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    backlinks.map(n => ({
                      id: n.id,
                      title: n.title,
                      path: n.path
                    })),
                    null,
                    2
                  )
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
                  text: JSON.stringify({
                    id: rootNote.id,
                    title: rootNote.title,
                    path: rootNote.path,
                    content: rootNote.content,
                    links: rootNote.links,
                    backlinks: rootNote.backlinks
                  }, null, 2)
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
  }

  async start() {
    await this.memoryManager.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('Obsidian Memory MCP Server started');
  }
}

const server = new ObsidianMemoryServer();
server.start().catch(console.error);