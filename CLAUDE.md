# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OneChat is an Electron-based desktop chat application that integrates AI models via OpenAI-compatible APIs. It uses React with TypeScript for the UI and the assistant-ui library for chat interface components.

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
- `src/App.tsx` - Main app component, manages model configuration state, provides AssistantRuntimeProvider
  - Loads configuration from JSON files (Electron) or localStorage (dev/web mode)
  - Manages current model selection and model list state
  - Handles model changes and updates via callbacks
- `src/lib/useModelRuntime.ts` - Creates custom AI runtime that:
  - Intercepts chat requests via AssistantChatTransport
  - Fetches API key from storage using model's apiKeyId reference
  - Resolves environment variables if API key format is `$ENV_VAR_NAME`
  - Routes requests through Electron IPC to bypass CSP restrictions
  - Converts assistant-ui message format to OpenAI format
  - Handles streaming responses as Server-Sent Events (SSE)
  - Provides detailed error messages with emojis for different error types (401, 404, 429, 500, etc.)
  - Falls back to direct fetch in browser/dev mode without Electron
- `src/types/model.ts` - Defines ModelConfig interface: `{ id, name, apiKeyId, model, temperature?, maxTokens? }`
- `src/types/apiKey.ts` - Defines ApiKey interface: `{ id, name, key, baseURL }`
  - Provider detection from API key prefix (OpenAI, Anthropic, Google, Cohere, Mistral, etc.)
  - Provider icon resolution from baseURL
  - Auto-detection and auto-fill of baseURL based on API key pattern

**Key Components**:
- `src/components/Settings.tsx` - Settings panel with tabbed interface (Models, Endpoints, Appearance, Backup & Restore):
  - Sidebar navigation with 4 tabs
  - **Models tab**: List of configured models with selection state, displays associated endpoint name
  - **Endpoints tab**: List of API keys/endpoints with provider icons (auto-detected from baseURL)
  - **Appearance tab**: Theme selection with visual cards (light/dark/system)
  - **Backup & Restore tab**: Export/import configuration as JSON
  - Dialog-based forms for adding new models and endpoints
  - Smart model selection: Combobox with searchable list fetched from API `/models` endpoint
  - Environment variable picker with `$` icon (shows API-related env vars)
  - Auto-detection of provider and baseURL when entering API key
  - Prevents deletion of endpoints in use by models
- `src/components/ModelSelector.tsx` - Dropdown for selecting active model in chat header
- `src/components/Sidebar.tsx` - Navigation sidebar
- `src/components/assistant-ui/thread.tsx` - Chat thread display using assistant-ui primitives
- `src/components/ThemeProvider.tsx` - Theme management (light/dark/system)

**Custom UI Components**:
- `src/components/ui/form-field.tsx` - Reusable form field component with label and slim input (h-8)
- `src/components/ui/slim-button.tsx` - Consistent slim button component (h-7) for compact UI
- Uses shadcn/ui components (button, dialog, input, label, tabs, select, dropdown-menu) in `src/components/ui/`
- Tailwind CSS for styling with v4 syntax
- Radix UI primitives for accessible components
- assistant-ui library for chat interface patterns

### Data Flow

1. **Configuration Setup**:
   - User adds API key/endpoint in Settings → stored in JSON files as ApiKey[] (includes baseURL)
   - User adds model in Settings → stored as ModelConfig[] (references endpoint by apiKeyId)
   - Selected model stored in `selectedModel.json`

2. **App Initialization**:
   - App.tsx loads models from storage (Electron: JSON files, Dev: localStorage)
   - Loads selected model and sets as active
   - Passes current model to useModelRuntime hook

3. **Runtime Creation**:
   - useModelRuntime creates custom AssistantChatTransport
   - Transport intercepts all chat requests from assistant-ui

4. **Message Sending Flow**:
   - User sends message via Thread component
   - Runtime intercepts request, fetches ApiKey from storage using model's apiKeyId
   - Resolves environment variables if API key is in `$ENV_VAR_NAME` format
   - Converts assistant-ui message format (with parts) to OpenAI format (with content)
   - **In Electron**: Routes through IPC (`api:chat-completion`) to bypass CSP
   - **In browser/dev**: Direct fetch to `${baseURL}/chat/completions`
   - Streams response back as SSE (Server-Sent Events)

5. **Response Handling**:
   - SSE chunks processed and decoded
   - Streaming response passed to assistant-ui Thread component
   - Messages displayed in real-time with markdown rendering

### IPC Communication (Electron ↔ Renderer)

The app uses Electron IPC for secure communication between main and renderer processes:

**Preload API** (`electron/preload.ts` exposes via `window.electronAPI`):
- `readConfig(filename)` - Read JSON config file from user data directory
- `writeConfig(filename, data)` - Write JSON config file to user data directory
- `exportConfig()` - Export configuration with file picker dialog
- `importConfig()` - Import configuration with file picker dialog
- `resolveEnvVar(value)` - Resolve `$ENV_VAR_NAME` to actual value from process.env
- `getEnvVars()` - List API-related environment variables (OPENAI, ANTHROPIC, API, KEY, etc.)
- `fetchModels(baseURL, apiKey)` - Fetch available models from `/models` endpoint
- `chatCompletion(baseURL, apiKey, body)` - Proxy chat completion request to bypass CSP

**Main Process Handlers** (`electron/main.ts`):
- `app:get-version` - Get Electron app version
- `config:read` / `config:write` - Read/write JSON files in `userData` directory
- `config:export` / `config:import` - File dialogs for backup/restore
- `env:resolve` - Resolve environment variables (supports `$` prefix)
- `env:list` - Filter and return API-related environment variables
- `api:fetch-models` - Fetch from `/models` endpoint with auth
- `api:chat-completion` - Stream chat completion responses as SSE

### Storage & Configuration

**API Keys/Endpoints**:
- Stored centrally in `apiKeys.json` (in `AppData/Roaming/OneChat` on Windows)
- Structure: `ApiKey[] = [{ id, name, key, baseURL }]`
- Key can be literal string or environment variable reference (`$ENV_VAR_NAME`)
- Environment variables resolved at runtime via Electron IPC
- Prevents deletion of endpoints in use by models

**Models**:
- Stored in `models.json`
- Structure: `ModelConfig[] = [{ id, name, apiKeyId, model, temperature?, maxTokens? }]`
- References endpoints by `apiKeyId` for reusability
- Selected model ID stored in `selectedModel.json`

**Fallback**:
- In browser/dev mode without Electron, falls back to localStorage
- Same data structure, just different storage mechanism

### MCP Servers

The project has MCP servers configured in `.mcp.json`:
- `shadcn` - For shadcn/ui component management
- `assistant-ui` - For assistant-ui documentation and examples

These servers provide tools for component discovery and integration.

## Important Notes

### Development & Build
- **Development port**: 5173 (standard Vite port - see `electron/main.ts:81`)
- **Terminology**: UI uses "Endpoints" instead of "API Keys" for user-facing labels
- **Do not launch app** - The user will handle launching and testing

### Security & Storage
- **Storage location**: `AppData/Roaming/OneChat` on Windows, `~/Library/Application Support/OneChat` on macOS
  - `models.json` - Model configurations
  - `apiKeys.json` - API keys/endpoints (NOT encrypted - use env vars for production)
  - `selectedModel.json` - Currently selected model ID
- **Environment Variables**:
  - Support for `$ENV_VAR_NAME` format in API keys
  - Visual picker in Settings shows API-related env vars (filtered by prefix)
  - Resolved at runtime via Electron IPC for security
- **CSP Bypass**: API requests routed through Electron IPC to avoid CSP restrictions in renderer
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