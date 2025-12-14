# Filesystem-Shell MCP Server

Cross-platform filesystem and shell tools for Model Context Protocol (MCP).

Supports Windows, macOS, and Linux with automatic handling of platform differences:
- Path separators (\ vs /)
- File encodings (UTF-8, UTF-16, etc.)
- Line endings (CRLF vs LF)
- Shell environments (cmd/PowerShell vs bash/zsh)
- File permissions and symlinks

## Installation

```bash
cd mcp-servers/built-in/filesystem-shell
npm install
npm run build
```

### Optional: Install ripgrep for faster search

```bash
# macOS
brew install ripgrep

# Windows
choco install ripgrep
# or
scoop install ripgrep

# Linux (Ubuntu/Debian)
sudo apt install ripgrep
```

## Available Tools

### 1. read - Read file contents

Read files with automatic encoding detection and binary file support.

**Parameters:**
- `path` (required): Path to file (absolute or relative)
- `encoding` (optional): Force specific encoding (utf-8, utf-16le, utf-16be, etc.)
- `asBase64` (optional): Return binary/image files as base64

**Example:**

```json
{
  "name": "read",
  "arguments": {
    "path": "./src/index.ts"
  }
}
```

**Features:**
- Auto-detects encoding (UTF-8, UTF-16 LE/BE, Windows-1252, etc.)
- Returns images as base64
- Handles symlinks
- Checks permissions

### 2. write - Write file contents

Write files with directory creation, encoding preservation, and atomic writes.

**Parameters:**
- `path` (required): Path to file
- `content` (required): Content to write
- `encoding` (optional): File encoding (default: utf-8)
- `createDirectories` (optional): Create parent directories (default: true)
- `preserveLineEndings` (optional): Preserve line endings (default: true)
- `atomic` (optional): Use atomic write (default: true)

**Example:**

```json
{
  "name": "write",
  "arguments": {
    "path": "./config.json",
    "content": "{\"version\": \"1.0.0\"}",
    "createDirectories": true
  }
}
```

**Features:**
- Auto-creates parent directories
- Preserves line endings (CRLF on Windows, LF on Unix)
- Atomic writes prevent corruption
- Detects locked files (Windows)

### 3. edit - Find and replace in files

Edit files with regex support and encoding preservation.

**Parameters:**
- `path` (required): Path to file
- `find` (required): Text to find (literal or regex)
- `replace` (required): Replacement text
- `regex` (optional): Treat find as regex (default: false)
- `caseInsensitive` (optional): Case-insensitive matching (default: false)
- `replaceAll` (optional): Replace all occurrences (default: true)
- `multiline` (optional): Multiline regex mode (default: false)
- `dryRun` (optional): Preview changes without writing (default: false)

**Example:**

```json
{
  "name": "edit",
  "arguments": {
    "path": "./package.json",
    "find": "\"version\": \"1.0.0\"",
    "replace": "\"version\": \"2.0.0\"",
    "dryRun": true
  }
}
```

**Features:**
- Regex and literal string search
- Preview mode (dry-run)
- Preserves encoding and line endings
- Atomic writes

### 4. bash - Execute shell commands

Execute shell commands with automatic shell detection.

**Parameters:**
- `command` (required): Shell command to execute
- `cwd` (optional): Working directory
- `env` (optional): Environment variables
- `timeout` (optional): Timeout in ms (default: 120000)
- `shell` (optional): Specific shell to use
- `captureStderr` (optional): Capture stderr (default: true)

**Example:**

```json
{
  "name": "bash",
  "arguments": {
    "command": "npm test",
    "cwd": "./project",
    "timeout": 60000
  }
}
```

**Features:**
- Auto-detects shell (cmd/PowerShell on Windows, bash/zsh on Unix)
- Timeout with process tree killing
- Captures stdout and stderr
- Environment variable support

**Security:**
- Validates commands for dangerous patterns
- Escapes arguments to prevent injection
- Sandboxed to working directory

### 5. glob - Find files by pattern

Fast file pattern matching with gitignore support.

**Parameters:**
- `patterns` (required): Glob pattern(s) (string or array)
- `cwd` (optional): Working directory
- `ignore` (optional): Patterns to ignore
- `caseSensitive` (optional): Force case-sensitive (default: platform-dependent)
- `includeHidden` (optional): Include hidden files (default: false)
- `onlyFiles` (optional): Only files (default: true)
- `onlyDirectories` (optional): Only directories (default: false)
- `followSymlinks` (optional): Follow symlinks (default: false)
- `maxDepth` (optional): Max directory depth
- `absolutePath` (optional): Return absolute paths (default: true)

**Example:**

```json
{
  "name": "glob",
  "arguments": {
    "patterns": ["**/*.ts", "**/*.tsx"],
    "ignore": ["**/node_modules/**", "**/dist/**"]
  }
}
```

**Features:**
- Fast pattern matching (fast-glob)
- Auto-ignores node_modules, .git, dist
- Handles case sensitivity per platform
- Supports brace expansion {a,b}

### 6. grep - Search file contents

Search file contents with regex support and ripgrep integration.

**Parameters:**
- `pattern` (required): Pattern to search for
- `path` (optional): Path to search in (default: current directory)
- `regex` (optional): Treat pattern as regex (default: true)
- `caseInsensitive` (optional): Case-insensitive (default: false)
- `multiline` (optional): Multiline mode (default: false)
- `contextBefore` (optional): Lines before match (default: 0)
- `contextAfter` (optional): Lines after match (default: 0)
- `filePattern` (optional): Glob to filter files
- `maxResults` (optional): Max results (default: 1000)
- `useRipgrep` (optional): Use ripgrep if available (default: true)

**Example:**

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "TODO|FIXME",
    "regex": true,
    "contextAfter": 2,
    "filePattern": "**/*.{ts,tsx,js,jsx}"
  }
}
```

**Features:**
- Uses ripgrep if available (100x faster)
- Automatic fallback to Node.js implementation
- Context lines support
- Multiline pattern matching

## Usage with Jarvis

Add to your MCP servers configuration:

```json
{
  "id": "filesystem-shell",
  "name": "Filesystem & Shell",
  "command": "node",
  "args": [
    "/absolute/path/to/mcp-servers/built-in/filesystem-shell/dist/index.js"
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## Platform-Specific Behavior

### Windows

- Uses `\` path separators (normalized internally to `/`)
- Default line ending: CRLF (`\r\n`)
- Default encoding: UTF-16 LE (for some system files)
- Shell: cmd.exe or PowerShell
- File locking: Mandatory (files can be locked)

### macOS

- Uses `/` path separators
- Default line ending: LF (`\n`)
- Default encoding: UTF-8
- Shell: /bin/zsh (modern macOS) or /bin/bash
- Filesystem: Usually case-insensitive (APFS/HFS+)

### Linux

- Uses `/` path separators
- Default line ending: LF (`\n`)
- Default encoding: UTF-8
- Shell: /bin/bash or /bin/sh
- Filesystem: Case-sensitive (ext4/btrfs)

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

### Project Structure

```
src/
├── index.ts                 # MCP server entry point
├── tools/
│   ├── read.ts             # Read tool implementation
│   ├── write.ts            # Write tool implementation
│   ├── edit.ts             # Edit tool implementation
│   ├── bash.ts             # Bash tool implementation
│   ├── glob.ts             # Glob tool implementation
│   └── grep.ts             # Grep tool implementation
└── utils/
    ├── path.ts             # Path normalization
    ├── encoding.ts         # Encoding detection/conversion
    ├── fileType.ts         # File type detection
    ├── lineEndings.ts      # Line ending handling
    ├── permissions.ts      # Permission checking
    └── process.ts          # Process spawning
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation on:
- Cross-platform compatibility strategies
- Encoding and line ending handling
- Shell detection and process management
- Security considerations
- Performance optimizations

## License

MIT
