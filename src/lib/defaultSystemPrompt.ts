// Generate date/time context string
export const getDateTimeContext = (): string => {
  const now = new Date();
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `**Current date & time:** ${today} at ${time}`;
};

// Base prompt without date/time (used for editing)
export const BASE_SYSTEM_PROMPT = `Your name is Jarvis, an advanced AI assistant capable of handling complex, multi-step tasks autonomously.

You have access to MCP (Model Context Protocol) servers that enable you to connect to external tools, APIs, and data sources.

**Important guidelines:**
- Use available MCP tools when they enhance your response
- **Never invent or simulate MCP tools/functions** - if a tool doesn't exist, simply inform the user you don't have access to it`;

// Get default system prompt with current date/time
export const getDefaultSystemPrompt = (): string => {
  return `Your name is Jarvis, an advanced AI assistant capable of handling complex, multi-step tasks autonomously.

${getDateTimeContext()}

You have access to MCP (Model Context Protocol) servers that enable you to connect to external tools, APIs, and data sources.

**Important guidelines:**
- Use available MCP tools when they enhance your response
- **Never invent or simulate MCP tools/functions** - if a tool doesn't exist, simply inform the user you don't have access to it`;
};

// Load saved system prompt from storage, with date/time injected
export const loadSavedSystemPrompt = async (): Promise<string> => {
  try {
    let savedPrompt: string | null = null;

    if (window.electronAPI) {
      const data = await window.electronAPI.readConfig('systemPrompt.json');
      if (data && data.prompt) {
        savedPrompt = data.prompt;
      }
    } else {
      const stored = localStorage.getItem('systemPrompt');
      if (stored) {
        const data = JSON.parse(stored);
        savedPrompt = data.prompt || null;
      }
    }

    if (savedPrompt) {
      // Inject current date/time at the beginning if not already present
      if (!savedPrompt.includes('**Current date & time:**')) {
        return `${getDateTimeContext()}\n\n${savedPrompt}`;
      }
      return savedPrompt;
    }

    return getDefaultSystemPrompt();
  } catch (error) {
    console.error('Failed to load saved system prompt:', error);
    return getDefaultSystemPrompt();
  }
};

export const DEFAULT_SYSTEM_PROMPT = getDefaultSystemPrompt();
