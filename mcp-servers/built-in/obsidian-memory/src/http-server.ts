#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  StreamableHTTPServerTransport,
  StreamableHTTPServerTransportOptions
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryManager } from './memory-manager.js';
import { MemoryConfig } from './types.js';
import * as path from 'path';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const PORT = process.env.PORT || 4003;
const HOST = process.env.HOST || 'localhost';

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_CONFIG: MemoryConfig = {
  vaultPath: process.env.OBSIDIAN_VAULT_PATH || './vault',
  obsidianCompatible: true,
  ignorePatterns: ['.obsidian', '.trash', '.git'],
  wikilinks: true,
  tagsFormat: 'both'
};

class ObsidianMemoryHTTPServer {
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
          description: 'Create a new note in the memory vault. IMPORTANT: Always use wikilink references [[Note Title]] when referencing other notes to maintain knowledge graph connections.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Note title' },
              content: { type: 'string', description: 'Note content in markdown. Use [[Note Title]] syntax to reference other notes and create automatic bidirectional links.' },
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
              identifier: { 
                type: 'string', 
                description: 'Note ID, title, or path'
              }
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
              folder: { 
                type: 'string', 
                description: 'Optional folder to list'
              }
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
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'memory_create': {
            const note = await this.memoryManager.createNote(
              args.title,
              args.content,
              args.folder,
              args.tags,
              args.aliases
            );
            return {
              content: [{
                type: 'text',
                text: `Created note: ${note.title} (ID: ${note.id})`
              }]
            };
          }

          case 'memory_read': {
            const note = await this.memoryManager.readNote(args.identifier);
            return {
              content: [{
                type: 'text',
                text: `# ${note.title}\n\n${note.content}\n\n---\nID: ${note.id}\nPath: ${note.path}\nTags: ${note.tags?.join(', ') || 'none'}`
              }]
            };
          }

          case 'memory_update': {
            const note = await this.memoryManager.updateNote(
              args.identifier,
              args.content,
              args.tags,
              args.aliases
            );
            return {
              content: [{
                type: 'text',
                text: `Updated note: ${note.title}`
              }]
            };
          }

          case 'memory_delete': {
            await this.memoryManager.deleteNote(args.identifier);
            return {
              content: [{
                type: 'text',
                text: `Deleted note: ${args.identifier}`
              }]
            };
          }

          case 'memory_list': {
            const notes = await this.memoryManager.listNotes(args.folder);
            const noteList = notes.map(n => `- ${n.title} (${n.path})`).join('\n');
            return {
              content: [{
                type: 'text',
                text: `Notes (${notes.length}):\n${noteList}`
              }]
            };
          }

          case 'memory_search': {
            const results = await this.memoryManager.searchNotes(
              args.query,
              args.tags,
              args.folder,
              args.limit
            );
            const resultList = results.map(r => 
              `- ${r.title} (Score: ${r.score})\n  ${r.excerpt}`
            ).join('\n\n');
            return {
              content: [{
                type: 'text',
                text: `Search results (${results.length}):\n\n${resultList}`
              }]
            };
          }

          case 'memory_link': {
            await this.memoryManager.createLink(args.from, args.to);
            return {
              content: [{
                type: 'text',
                text: `Created link from "${args.from}" to "${args.to}"`
              }]
            };
          }

          case 'memory_backlinks': {
            const backlinks = await this.memoryManager.getBacklinks(args.identifier);
            const linkList = backlinks.map(l => `- [[${l.title}]]`).join('\n');
            return {
              content: [{
                type: 'text',
                text: `Backlinks (${backlinks.length}):\n${linkList}`
              }]
            };
          }

          case 'memory_graph': {
            const graph = await this.memoryManager.getKnowledgeGraph();
            return {
              content: [{
                type: 'text',
                text: `Knowledge Graph:\nNodes: ${graph.nodes.length}\nEdges: ${graph.edges.length}\n\n${JSON.stringify(graph, null, 2)}`
              }]
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
          `Error executing ${name}: ${error}`
        );
      }
    });
  }

  getServer() {
    return this.server;
  }
}

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();
const obsidianServer = new ObsidianMemoryHTTPServer();

// Handle POST requests (client->server messages and initialization)
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  
  // If no session ID, this is an initialization request
  if (!sessionId) {
    const newSessionId = crypto.randomUUID();
    const transport = new StreamableHTTPServerTransport({
      endpoint: `http://${HOST}:${PORT}/mcp`,
      sessionId: newSessionId,
    } as StreamableHTTPServerTransportOptions);
    
    transports.set(newSessionId, transport);
    
    // Connect the transport to the server
    await obsidianServer.getServer().connect(transport);
    
    // Set the session ID header
    res.setHeader('mcp-session-id', newSessionId);
    
    // Handle the initialization request
    await transport.handleRequest(req, res, req.body);
  } else if (transports.has(sessionId)) {
    // Existing session - handle the request
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else {
    // Invalid session ID
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Session not found',
      },
      id: null,
    });
  }
});

// Handle GET requests (SSE for server->client messages)
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  if (!sessionId || !transports.has(sessionId)) {
    res.status(404).send('Session not found');
    return;
  }
  
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// Handle DELETE requests (session cleanup)
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  if (!sessionId || !transports.has(sessionId)) {
    res.status(404).send('Session not found');
    return;
  }
  
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
  
  // Clean up the transport after handling the delete
  transports.delete(sessionId);
});

async function main() {
  app.listen(PORT, () => {
    console.error(`Obsidian Memory MCP server running on http://${HOST}:${PORT}/mcp`);
    console.error('Ready to accept HTTP/SSE connections');
    console.error(`Vault path: ${DEFAULT_CONFIG.vaultPath}`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});