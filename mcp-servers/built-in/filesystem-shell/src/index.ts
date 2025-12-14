#!/usr/bin/env node

/**
 * Filesystem-Shell MCP Server
 *
 * Provides cross-platform filesystem and shell tools for MCP
 *
 * Tools:
 * - read: Read files with encoding detection
 * - write: Write files with encoding/line ending preservation
 * - edit: Find/replace in files
 * - bash: Execute shell commands
 * - glob: File pattern matching
 * - grep: Content search (regex/literal)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool handlers
import { ReadToolInputSchema, handleReadTool } from './tools/read.js';
import { WriteToolInputSchema, handleWriteTool } from './tools/write.js';
import { EditToolInputSchema, handleEditTool } from './tools/edit.js';
import { BashToolInputSchema, handleBashTool } from './tools/bash.js';
import { GlobToolInputSchema, handleGlobTool } from './tools/glob.js';
import { GrepToolInputSchema, handleGrepTool } from './tools/grep.js';
import { IS_WINDOWS } from './utils/path.js';

/**
 * Get platform-specific bash description
 */
function getBashDescription(): string {
  if (IS_WINDOWS) {
    return 'Execute shell commands directly on this Windows machine using PowerShell. Stateless execution - no context preserved between calls.';
  } else {
    return 'Execute shell commands directly on this Unix/Linux/macOS machine using bash or zsh. Stateless execution - no context preserved between calls.';
  }
}

/**
 * Create and configure MCP server
 */
async function main() {
  // Create server instance
  const server = new Server(
    {
      name: 'filesystem-shell',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'read',
          description:
            'Read file contents with automatic encoding detection. Supports text and binary files (images returned as base64).',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to file to read (absolute or relative)',
              },
              encoding: {
                type: 'string',
                enum: ['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'latin1', 'windows-1252'],
                description: 'Force specific encoding (auto-detected if not provided)',
              },
              asBase64: {
                type: 'boolean',
                description: 'Return binary/image files as base64 (default: true for images)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'write',
          description:
            'Write content to file with automatic directory creation, encoding preservation, and line ending handling.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to file to write (absolute or relative)',
              },
              content: {
                type: 'string',
                description: 'Content to write to file',
              },
              encoding: {
                type: 'string',
                enum: ['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'latin1', 'windows-1252'],
                description: 'File encoding (default: utf-8 or preserve existing)',
              },
              createDirectories: {
                type: 'boolean',
                description: 'Create parent directories if they do not exist (default: true)',
                default: true,
              },
              preserveLineEndings: {
                type: 'boolean',
                description: 'Preserve existing line endings or use platform default (default: true)',
                default: true,
              },
              atomic: {
                type: 'boolean',
                description: 'Use atomic write (write to temp file then rename) (default: true)',
                default: true,
              },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'edit',
          description:
            'Find and replace text in file with regex support, encoding preservation, and atomic writes.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to file to edit',
              },
              find: {
                type: 'string',
                description: 'Text to find (literal string or regex pattern)',
              },
              replace: {
                type: 'string',
                description: 'Replacement text',
              },
              regex: {
                type: 'boolean',
                description: 'Treat find as regex pattern (default: false)',
                default: false,
              },
              caseInsensitive: {
                type: 'boolean',
                description: 'Case-insensitive matching (default: false)',
                default: false,
              },
              replaceAll: {
                type: 'boolean',
                description: 'Replace all occurrences (false = replace first only) (default: true)',
                default: true,
              },
              multiline: {
                type: 'boolean',
                description: 'Multiline regex mode (default: false)',
                default: false,
              },
              dryRun: {
                type: 'boolean',
                description: 'Preview changes without writing to file (default: false)',
                default: false,
              },
            },
            required: ['path', 'find', 'replace'],
          },
        },
        {
          name: 'bash',
          description: getBashDescription(),
          inputSchema: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'Shell command to execute',
              },
              cwd: {
                type: 'string',
                description: 'Working directory (defaults to current directory)',
              },
              env: {
                type: 'object',
                description: 'Environment variables to set',
                additionalProperties: {
                  type: 'string',
                },
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 120000 = 2 minutes)',
                default: 120000,
              },
              shell: {
                type: 'string',
                description: 'Specific shell to use (default: auto-detect)',
              },
              captureStderr: {
                type: 'boolean',
                description: 'Capture stderr separately (default: true)',
                default: true,
              },
            },
            required: ['command'],
          },
        },
        {
          name: 'glob',
          description:
            'Find files using glob patterns with cross-platform path handling and gitignore support.',
          inputSchema: {
            type: 'object',
            properties: {
              patterns: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } },
                ],
                description: 'Glob pattern(s) to match (e.g., "**/*.ts", "src/**/*.{js,ts}")',
              },
              cwd: {
                type: 'string',
                description: 'Working directory to search from (default: current directory)',
              },
              ignore: {
                type: 'array',
                items: { type: 'string' },
                description: 'Patterns to ignore (e.g., ["node_modules/**", "dist/**"])',
              },
              caseSensitive: {
                type: 'boolean',
                description: 'Force case-sensitive matching (default: platform-dependent)',
              },
              includeHidden: {
                type: 'boolean',
                description: 'Include hidden files (starting with .) (default: false)',
                default: false,
              },
              onlyFiles: {
                type: 'boolean',
                description: 'Only return files (not directories) (default: true)',
                default: true,
              },
              onlyDirectories: {
                type: 'boolean',
                description: 'Only return directories (not files) (default: false)',
                default: false,
              },
              followSymlinks: {
                type: 'boolean',
                description: 'Follow symbolic links (default: false)',
                default: false,
              },
              maxDepth: {
                type: 'number',
                description: 'Maximum directory depth to search',
              },
              absolutePath: {
                type: 'boolean',
                description: 'Return absolute paths (default: true)',
                default: true,
              },
            },
            required: ['patterns'],
          },
        },
        {
          name: 'grep',
          description:
            'Search file contents using regex patterns with ripgrep support for performance.',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Pattern to search for (regex or literal string)',
              },
              path: {
                type: 'string',
                description: 'Path to search in (file or directory, default: current directory)',
              },
              regex: {
                type: 'boolean',
                description: 'Treat pattern as regex (default: true)',
                default: true,
              },
              caseInsensitive: {
                type: 'boolean',
                description: 'Case-insensitive search (default: false)',
                default: false,
              },
              multiline: {
                type: 'boolean',
                description: 'Multiline mode (pattern can match across lines) (default: false)',
                default: false,
              },
              contextBefore: {
                type: 'number',
                description: 'Number of lines to show before match (default: 0)',
                default: 0,
              },
              contextAfter: {
                type: 'number',
                description: 'Number of lines to show after match (default: 0)',
                default: 0,
              },
              filePattern: {
                type: 'string',
                description: 'Glob pattern to filter files (e.g., "*.ts")',
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results to return (default: 1000)',
                default: 1000,
              },
              useRipgrep: {
                type: 'boolean',
                description: 'Use ripgrep if available (faster) (default: true)',
                default: true,
              },
            },
            required: ['pattern'],
          },
        },
      ],
    };
  });

  /**
   * Handle tool calls
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case 'read':
          ReadToolInputSchema.parse(args);
          result = await handleReadTool(args);
          break;

        case 'write':
          WriteToolInputSchema.parse(args);
          result = await handleWriteTool(args);
          break;

        case 'edit':
          EditToolInputSchema.parse(args);
          result = await handleEditTool(args);
          break;

        case 'bash':
          BashToolInputSchema.parse(args);
          result = await handleBashTool(args);
          break;

        case 'glob':
          GlobToolInputSchema.parse(args);
          result = await handleGlobTool(args);
          break;

        case 'grep':
          GrepToolInputSchema.parse(args);
          result = await handleGrepTool(args);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: errorMessage,
                tool: name,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Filesystem-Shell MCP Server running on stdio');
}

// Run server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
