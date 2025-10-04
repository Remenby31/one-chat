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
- **Main Process** (`electron/main.ts`): Creates BrowserWindow, handles IPC, loads frontend from http://localhost:5174 in dev or from `dist/index.html` in production
- **Preload Script** (`electron/preload.ts`): Bridges main and renderer processes with context isolation
- **Build Config**: Uses custom Vite config (`electron.vite.config.ts`) and electron-builder config (`electron-builder.json`)

### Frontend Architecture

**State Management & Runtime**:
- `src/App.tsx` - Main app component, manages model configuration state via localStorage, provides AssistantRuntimeProvider
- `src/lib/useModelRuntime.ts` - Creates custom AI runtime that:
  - Intercepts chat requests
  - Routes them to user-configured API endpoints (stored in ModelConfig)
  - Fetches API key from localStorage using apiKeyId reference
  - Handles streaming responses from OpenAI-compatible APIs
  - Returns helpful error messages when model is not configured or API key is missing
- `src/types/model.ts` - Defines ModelConfig interface (id, name, baseURL, apiKeyId, model, temperature, maxTokens)
- `src/types/apiKey.ts` - Defines ApiKey interface (id, name, key) for centralized API key management

**Key Components**:
- `src/components/Settings.tsx` - Settings panel with tabbed interface (Models, API Keys, Appearance):
  - Sidebar navigation with sections
  - List of configured models and API keys
  - Dialog-based forms for adding new items
  - Theme selection with visual cards
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

1. User manages API keys in Settings → stored in JSON files (or localStorage in dev mode)
2. User configures models in Settings → stored in JSON files as ModelConfig[] (references API keys by apiKeyId)
3. App.tsx loads ModelConfig and passes to useModelRuntime
4. useModelRuntime creates custom runtime that intercepts chat requests via AssistantChatTransport
5. When user sends message:
   - Runtime fetches the API key from storage using model's apiKeyId
   - Resolves environment variables if API key format is $ENV_VAR_NAME
   - Makes fetch to `${baseURL}/chat/completions` with the retrieved API key
   - Handles streaming response
6. Streaming response is passed back to assistant-ui Thread component for display

**API Key Management**:
- API keys are stored centrally in JSON files (`AppData/Roaming/OneChat/apiKeys.json` on Windows)
- Models stored in `models.json`, selected model in `selectedModel.json`
- Models reference keys by ID, allowing key reuse across multiple models
- Prevents deletion of API keys that are in use by models
- Environment variable support: Use `$ENV_VAR_NAME` format for API keys
- Environment variable picker UI available in Settings dialog (shows API-related env vars)

### MCP Servers

The project has MCP servers configured in `.mcp.json`:
- `shadcn` - For shadcn/ui component management
- `assistant-ui` - For assistant-ui documentation and examples

These servers provide tools for component discovery and integration.

## Important Notes

- Development port is 5174 (not default 5173 - see main.ts:32)
- **Storage**: Configuration files stored in JSON format in `AppData/Roaming/OneChat`:
  - `models.json` - Model configurations
  - `apiKeys.json` - API keys (not encrypted, use environment variables for production)
  - `selectedModel.json` - Currently selected model
- **Export/Import**: Settings panel includes "Backup & Restore" section for configuration export/import
- **Environment Variables**: Support for `$ENV_VAR_NAME` format in API keys with visual picker
- The app uses OpenAI-compatible API format, supporting any provider with compatible endpoints
- English localization is used in UI strings
- Fallback to localStorage when running in browser/dev mode without Electron