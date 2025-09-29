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
  - Handles streaming responses from OpenAI-compatible APIs
  - Returns helpful error messages when model is not configured
- `src/types/model.ts` - Defines ModelConfig interface (id, name, baseURL, apiKey, model, temperature, maxTokens)

**Key Components**:
- `src/components/Settings.tsx` - Model configuration UI (add/delete models, set API keys, select active model, theme switcher)
- `src/components/Sidebar.tsx` - Navigation sidebar
- `src/components/assistant-ui/thread.tsx` - Chat thread display using assistant-ui primitives
- `src/components/ThemeProvider.tsx` - Theme management (light/dark/system)

**UI Libraries**:
- Uses shadcn/ui components (button, dialog, input, label, etc.) in `src/components/ui/`
- Tailwind CSS for styling with v4 syntax
- Radix UI primitives for accessible components
- assistant-ui library for chat interface patterns

### Data Flow

1. User configures model in Settings → stored in localStorage as ModelConfig
2. App.tsx loads ModelConfig and passes to useModelRuntime
3. useModelRuntime creates custom runtime that intercepts `/api/chat` requests
4. When user sends message, runtime makes fetch to `${baseURL}/chat/completions` with configured API key
5. Streaming response is passed back to assistant-ui Thread component for display

### MCP Servers

The project has MCP servers configured in `.mcp.json`:
- `shadcn` - For shadcn/ui component management
- `assistant-ui` - For assistant-ui documentation and examples

These servers provide tools for component discovery and integration.

## Important Notes

- Development port is 5174 (not default 5173 - see main.ts:32)
- API keys are stored in localStorage (not encrypted)
- The app uses OpenAI-compatible API format, supporting any provider with compatible endpoints
- French localization is used in UI strings
- All model configurations persist across sessions via localStorage