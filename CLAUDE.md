# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jarvis is an Electron-based desktop chat application that integrates AI models via OpenAI-compatible APIs. It uses React with TypeScript for the UI, Zustand for state management, and supports MCP (Model Context Protocol) servers for tool integration.

## Key Commands

### Development
- `npm run electron:dev` - Start development server with hot reload and Electron (uses Vite on port 5173, waits for server, then launches Electron)
- `npm run dev` - Start Vite dev server only (port 5173)
- `npm run start` - Start Electron directly (expects built frontend)

### Building
- `npm run build` - Full production build: TypeScript compilation, Vite build, and Electron packaging
- `npm run electron:build` - Build and package with electron-builder
- `npm run dist` - Run electron-builder directly (expects pre-built artifacts)

### Code Quality
- `npm run lint` - Run ESLint on the codebase
- `tsc -b` - TypeScript compilation check (included in build)

## Architecture

### Electron Structure
- **Main Process** (`electron/main.ts`): Creates BrowserWindow, handles IPC, loads frontend from http://localhost:5173 in dev or from `dist/index.html` in production
  - Custom menu with DevTools shortcuts (F12, Cmd+Alt+I on macOS, Ctrl+Shift+I on Windows)
  - Hidden title bar with traffic lights on macOS
  - Window state management and persistence
- **Preload Script** (`electron/preload.ts`): Bridges main and renderer processes with context isolation
  - Exposes `electronAPI` to renderer with security via `contextBridge`
  - Provides IPC handlers for config, environment variables, and API calls
- **Build Config**: Uses custom Vite config (`electron.vite.config.ts`) and electron-builder config (`electron-builder.json`)

### Frontend Architecture

**State Management & Runtime**:
- `src/App.tsx` - Main app component with global state management:
  - Loads configuration from JSON files (Electron) or localStorage (dev/web mode)
  - Manages model, API key, and MCP server state
  - Provides error handling via toast notifications (errorToast with emoji categorization)
  - Sets up config file watchers for real-time sync across windows
- `src/hooks/useStreamingChat.ts` - Chat hook for streaming messages:
  - Manages chat state via `chatStore` (Zustand)
  - Fetches API key from storage and resolves environment variables (`$ENV_VAR_NAME` format)
  - Sends requests directly to OpenAI-compatible `/chat/completions` endpoint via native fetch
  - Streams responses as SSE (Server-Sent Events) with ReadableStream + TextDecoder
  - Integrates MCP tools via `getInjectedMessages()` for tool injection
  - Implements multi-turn tool execution with MAX_TURNS=10 loop limit
  - Auto-saves messages to thread store
  - Provides detailed error messages categorized by HTTP status (401, 404, 429, 500+)
- `src/stores/chatStore.ts` - Zustand store for chat state:
  - Manages messages, streaming state, abort controller
  - Tracks tool calls and execution
  - Handles message attachments
- `src/stores/threadStore.ts` - Zustand store for thread persistence:
  - Manages conversation threads (thread list, current thread)
  - Persists messages to file system
- `src/types/model.ts` - Defines ModelConfig interface: `{ id, name, apiKeyId, model, temperature?, maxTokens?, systemPrompt? }`
- `src/types/apiKey.ts` - Defines ApiKey interface: `{ id, name, key, baseURL }`
  - Provider detection from API key prefix (OpenAI, Anthropic, Google, Cohere, Mistral, etc.)
  - Provider icon resolution from baseURL
  - Auto-detection and auto-fill of baseURL based on API key pattern

**Key Components**:
- `src/components/Settings.tsx` - Settings panel with tabbed interface (Models, Endpoints, Appearance, MCP Servers, Backup & Restore):
  - Sidebar navigation with 5 tabs
  - **Models tab**: List of configured models with selection state, displays associated endpoint name
  - **Endpoints tab**: List of API keys/endpoints with provider icons (auto-detected from baseURL)
  - **Appearance tab**: Theme selection with visual cards (light/dark/system)
  - **MCP Servers tab**: Connect and manage MCP servers, view tools and capabilities, stream server logs
  - **Backup & Restore tab**: Export/import configuration as JSON
  - Dialog-based forms for adding new models and endpoints
  - Smart model selection: Combobox with searchable list fetched from API `/models` endpoint
  - Environment variable picker with `$` icon (shows API-related env vars)
  - Auto-detection of provider and baseURL when entering API key
  - Prevents deletion of endpoints in use by models
- `src/components/chat/ChatThread.tsx` - Main chat thread display:
  - Displays message list with real-time streaming
  - Integrates composer for message input
  - Handles MCP tool display and execution
- `src/components/chat/MessageList.tsx` - Scrollable message list
- `src/components/chat/Composer.tsx` - Message input area with file attachment support
- `src/components/chat/UserMessage.tsx` - User message display
- `src/components/chat/AssistantMessage.tsx` - Assistant message with markdown and tool calls
- `src/components/chat/MarkdownContent.tsx` - Markdown rendering for messages
- `src/components/chat/CodeHighlighter.tsx` - Syntax highlighting for code blocks
- `src/components/ModelSelector.tsx` - Dropdown for selecting active model in chat header
- `src/components/Sidebar.tsx` - Navigation sidebar with thread list
- `src/components/ThreadListPanel.tsx` - Thread list for conversation management
- `src/components/ThemeProvider.tsx` - Theme management (light/dark/system)

**MCP Components**:
- `src/components/mcp/MCPServerCard.tsx` - Display MCP server status and info
- `src/components/mcp/MCPDialog.tsx` - Add/configure MCP server dialog
- `src/components/mcp/MCPToolsList.tsx` - Display available tools from MCP server
- `src/components/mcp/MCPPromptsList.tsx` - Display available prompts from MCP server
- `src/components/mcp/MCPServerLogs.tsx` - Real-time MCP server logs
- `src/components/mcp/MCPButton.tsx` - Button for triggering MCP tool execution

**Custom UI Components**:
- `src/components/ui/form-field.tsx` - Reusable form field component with label and slim input (h-8)
- `src/components/ui/slim-button.tsx` - Consistent slim button component (h-7) for compact UI
- Uses shadcn/ui components (button, dialog, input, label, tabs, select, dropdown-menu) in `src/components/ui/`
- Tailwind CSS for styling with v4 syntax
- Radix UI primitives for accessible components

### Data Flow

1. **Configuration Setup**:
   - User adds API key/endpoint in Settings → stored in JSON files as ApiKey[] (includes baseURL)
   - User adds model in Settings → stored as ModelConfig[] (references endpoint by apiKeyId, includes systemPrompt)
   - Selected model stored in `selectedModel.json`
   - MCP servers configured and stored in `mcpServers.json` with OAuth tokens

2. **App Initialization**:
   - App.tsx loads models, API keys, and MCP servers from storage (Electron: JSON files, Dev: localStorage)
   - Loads selected model and sets as active
   - Initializes MCP servers via MCPProcessManager
   - Sets up config file watchers for real-time sync

3. **Thread Management**:
   - Threads are stored as individual folders in `conversations/` directory
   - Each thread has `messages.json` containing message history
   - ThreadStore manages current thread and thread list
   - Messages auto-saved to thread files after each response

4. **Message Sending Flow**:
   - User sends message via Composer component
   - Message added to chatStore and thread
   - `useStreamingChat` hook fetches active model and its API key
   - Resolves environment variables if API key in `$ENV_VAR_NAME` format
   - Fetches and injects conventional prompts from MCP servers (via `getInjectedMessages()`)
   - Merges thread system prompt with MCP injected prompts
   - MCP tools fetched from connected servers
   - Sends request directly to OpenAI-compatible `${baseURL}/chat/completions` endpoint
   - Streams response using native fetch + ReadableStream + TextDecoder

### Prompt Injection System

The app implements a sophisticated **MCP Conventional Prompts Auto-Injection System** that automatically injects prompts from connected MCP servers into conversations:

**Conventional Prompt Types** (case-insensitive detection):
- `system_prompt` - System instructions (role: system), concatenated with tool_instructions
- `tool_instructions` - Tool usage guidelines (role: system), merged with system_prompt
- `user_prompt` - User context messages (role: user), multiple allowed, order preserved
- `assistant_prompt` - Response prefill/examples (role: assistant), order preserved
- `tool_call:*` (e.g., `tool_call:memory_index`) - Simulated tool calls (role: assistant) to demonstrate tool patterns
- `tool_result:*` or `tool_answer:*` - Simulated tool results (role: tool) paired with tool_call messages

**Injection Process** (`src/lib/mcpPromptInjection.ts` + `src/hooks/useStreamingChat.ts`):
1. When user sends message, system fetches all prompts from connected (RUNNING) MCP servers
2. Filters prompts by conventional names (ignores others)
3. Detects prompt type from name pattern
4. Organizes messages in OpenAI-compatible order: system → user_prompt → tool_call/result pairs → assistant_prompt
5. Merges any MCP system prompts with thread's system prompt
6. Prepends injected messages to conversation history
7. Sends final message array to API: `[injected prompts] + [conversation history]`

**System Prompt Hierarchy** (first wins):
1. **Thread System Prompt** - Stored per thread in `conversations/thread_*.json`, merged with MCP system prompts
2. **MCP System Prompts** - Auto-fetched from connected servers, concatenated
3. **Default System Prompt** - Used when creating new threads, provides baseline instructions

Note: ModelConfig's `systemPrompt` field is stored but not actively used in chat flow (preserved for future per-model customization).

**Example**: Obsidian Memory MCP Server injects `tool_call:memory_index` (showing how to call memory) + `tool_result:memory_index` (showing result format) to teach the LLM to use memory tools proactively.

**Key Files**:
- `src/lib/mcpPromptInjection.ts` - Prompt detection and organization logic
- `src/hooks/useStreamingChat.ts` (lines 190-210) - Integration point, fetches and injects prompts on each message
- `src/lib/defaultSystemPrompt.ts` - Default system prompt for all threads
- `src/components/mcp-details/MCPPromptsList.tsx` - UI for browsing/previewing available prompts

5. **Tool Execution Loop** (if response includes tool calls):
   - Tool calls extracted from assistant response
   - Executed via MCP servers (limited to MAX_TURNS=10 to prevent infinite loops)
   - Tool results included in next request to model
   - Loop continues until model responds without tool calls

6. **Response Handling**:
   - SSE chunks decoded and parsed
   - Streaming tokens accumulated and displayed in real-time
   - Final message saved to thread store
   - Thread file updated with new message
   - Messages displayed with markdown rendering and syntax highlighting

### IPC Communication (Electron ↔ Renderer)

The app uses Electron IPC for secure communication between main and renderer processes:

**Main Process Handlers** (`electron/main.ts`):

**App/System**:
- `app:get-version` - Get Electron app version
- `app:open-external` - Open URL in system browser (used for OAuth)

**Configuration**:
- `config:read` - Read JSON config file from `userData` directory
- `config:write` - Write JSON config file to `userData` directory (with concurrent write queue)
- `config:export` - Export configuration with file picker dialog
- `config:import` - Import configuration with file picker dialog

**Environment Variables**:
- `env:resolve` - Resolve `$ENV_VAR_NAME` to actual value from process.env
- `env:list` - Filter and return API-related environment variables

**Thread Management**:
- `thread:list` - List all conversation threads
- `thread:delete` - Delete a thread folder

**MCP Server Management**:
- `mcp:start-server` - Start MCP server process with stdio transport
- `mcp:stop-server` - Stop MCP server process
- `mcp:list-tools` - List available tools from MCP server
- `mcp:get-capabilities` - Get MCP server capabilities (tools, prompts, resources)
- `mcp:call-tool` - Execute MCP tool with arguments
- `mcp:list-prompts` - List available prompts from MCP server
- `mcp:get-prompt` - Get MCP prompt by name
- `mcp:get-logs` - Get MCP server logs (recent entries)
- `mcp:clear-logs` - Clear MCP server logs
- `mcp:import-claude-desktop` - Import MCP server config from Claude Desktop

### Storage & Configuration

**API Keys/Endpoints**:
- Stored in `apiKeys.json` (in `AppData/Roaming/Jarvis` on Windows)
- Structure: `ApiKey[] = [{ id, name, key, baseURL }]`
- Key can be literal string or environment variable reference (`$ENV_VAR_NAME`)
- Environment variables resolved at runtime via Electron IPC
- Prevents deletion of endpoints in use by models

**Models**:
- Stored in `models.json`
- Structure: `ModelConfig[] = [{ id, name, apiKeyId, model, temperature?, maxTokens?, systemPrompt? }]`
- References endpoints by `apiKeyId` for reusability
- Selected model ID stored in `selectedModel.json`

**Threads/Conversations**:
- Each thread is a folder in `conversations/` directory
- Thread folder contains `messages.json` with full conversation history
- Thread folder name is the thread ID
- ThreadStore manages thread list and current thread state

**MCP Servers**:
- Stored in `mcpServers.json`
- Includes server configuration, OAuth tokens, and credentials
- Access tokens auto-refreshed when expired (5-minute buffer)
- Server processes managed by MCPProcessManager with lifecycle tracking
- Logs streamed in real-time via IPC to UI

**Fallback**:
- In browser/dev mode without Electron, falls back to localStorage
- Same data structure, just different storage mechanism

### MCP System Architecture

The app provides full MCP (Model Context Protocol) server support with automatic lifecycle management:

**MCP Process Management**:
- `src/lib/mcpProcessManager.ts` - Manages MCP server processes:
  - Launches servers with stdio transport
  - Tracks server state (stopped, initializing, running, error)
  - Handles graceful shutdown and cleanup
  - Recovers from server crashes
- `src/lib/mcpStateMachine.ts` - State machine for MCP server connections
- Tool injection via `getInjectedMessages()` - Injects available MCP tools into chat context

**Built-in MCP Servers**:
- `src/lib/builtInServers.ts` - Auto-enables built-in MCP servers:
  - Obsidian Memory MCP server (mcp-servers/built-in/obsidian-memory/)
  - Additional built-in servers can be configured here

**MCP Configuration** (`.mcp.json`):
- `shadcn` - For shadcn/ui component management
- `electron` - Local MCP server for Jarvis-specific tools

**MCP OAuth Workflow**:
- Automated OAuth discovery and token management (see next section)
- Tokens persisted and auto-refreshed in `mcpServers.json`

### MCP OAuth Workflow

MCP servers like Supabase require OAuth 2.1 authentication. The app implements a fully automated OAuth flow:

**1. OAuth Discovery (RFC 8414)** - `src/lib/mcpOAuthDiscovery.ts`:
- Probes MCP server URL for `www-authenticate` header
- Fetches resource metadata and authorization server metadata from `.well-known` URLs
- Automatically discovers `authUrl`, `tokenUrl`, and `scopes`

**2. Dynamic Client Registration (RFC 7591)**:
- Registers app as OAuth client with authorization server
- Obtains `client_id` (UUID) and `client_secret` automatically
- No manual OAuth configuration needed by user

**3. PKCE Authorization Flow** - `src/lib/mcpAuth.ts`:
- Generates cryptographic `code_verifier` and `code_challenge` (SHA-256)
- Opens system browser with authorization URL
- User authenticates on provider's page
- App receives callback via `jarvis://oauth/callback` custom protocol
- Exchanges authorization code for `access_token` and `refresh_token`

**4. Token Management**:
- Tokens stored in `mcpServers.json` with `client_secret` for refresh
- Access tokens typically expire after 1 hour
- Refresh tokens valid for 30+ days
- `ensureValidToken()` automatically refreshes expired tokens (5-minute buffer)
- Token refresh uses stored `client_secret` - no re-authentication needed

**5. State Persistence**:
- OAuth config (`clientId`, `clientSecret`, `authUrl`, `tokenUrl`, `scopes`) → `AppData/mcpServers.json`
- Access/refresh tokens → `AppData/mcpServers.json` (persist across restarts)
- OAuth flow state (CSRF protection) → `sessionStorage` (temporary, 10-minute expiry)

**UX**: Users see simple "Authenticate" button - all OAuth discovery and DCR happen automatically in background.

## Important Notes

### Development & Build
- **Development port**: 5173 (standard Vite port - see `electron/main.ts:539`)
- **File watching**: Config files watched for changes with automatic reload across all windows
- **Terminology**: UI uses "Endpoints" instead of "API Keys" for user-facing labels
- **Do not launch app** - The user will handle launching and testing
- **No legacy or fallback code** - Only clean code, good practices of coding

### Security & Storage
- **Storage location**: `AppData/Roaming/Jarvis` on Windows, `~/Library/Application Support/Jarvis` on macOS
  - `models.json` - Model configurations
  - `apiKeys.json` - API keys/endpoints (NOT encrypted - use env vars for production)
  - `selectedModel.json` - Currently selected model ID
  - `mcpServers.json` - MCP server configs and OAuth tokens
  - `conversations/` - Thread folders with message history
- **Environment Variables**:
  - Support for `$ENV_VAR_NAME` format in API keys
  - Visual picker in Settings shows API-related env vars (filtered by prefix)
  - Resolved at runtime via Electron IPC for security
- **Config File Watching**: File system watcher monitors config changes and broadcasts updates across all windows
- **Fallback**: localStorage used in browser/dev mode without Electron

### API Compatibility
- **OpenAI-compatible format**: Works with any provider using OpenAI-style `/chat/completions` endpoint
- **Streaming**: SSE (Server-Sent Events) format for real-time responses
- **Supported providers**: OpenAI, Anthropic, Google Gemini, Cohere, Mistral, Hugging Face, AI21, Replicate, Perplexity, ElevenLabs, Azure OpenAI
- **Auto-detection**: Provider and baseURL auto-filled based on API key prefix pattern

### UI/UX Features
- **Export/Import**: Backup & Restore tab in Settings for configuration management
- **Smart model selection**: Fetches available models from `/models` endpoint, displays in searchable combobox
- **Error handling**: User-friendly error messages with emojis, categorized by HTTP status (401, 404, 429, 500+)
- **Theme support**: Light/dark/system themes with visual selector
- **Provider icons**: Auto-detected icons for major AI providers
- **Localization**: English strings throughout UI