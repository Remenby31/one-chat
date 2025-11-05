# MCP Conventional Prompts - Auto-Injection System

## Vue d'ensemble

Le système de prompts conventionnels permet aux serveurs MCP d'injecter automatiquement du contexte dans les conversations en exposant des prompts avec des noms spécifiques. Ce système suit les conventions de nommage pour déterminer **où** et **comment** injecter chaque prompt dans la conversation.

## Architecture

### Composants principaux

1. **`src/lib/mcpPromptInjection.ts`** - Système central d'injection
2. **`src/hooks/useStreamingChat.ts`** - Intégration dans le flux de chat
3. **`src/lib/mcpManager.ts`** - Communication avec les serveurs MCP
4. **`electron/main.ts` + `electron/preload.ts`** - Handlers IPC pour Electron

## Noms de prompts conventionnels

Le système détecte automatiquement les prompts basés sur leur nom (case-insensitive):

| Nom du prompt | Rôle OpenAI | Position | Comportement |
|---------------|-------------|----------|--------------|
| `system_prompt` | `system` | Début (avant tout) | Concaténé avec autres system_prompt si multiples |
| `tool_instructions` | `system` | Avec system_prompt | Concaténé au system prompt |
| `user_prompt` | `user` | Après system, avant conversation | Multiple autorisé, ordre préservé |
| `assistant_prompt` | `assistant` | Après user_prompt | Préfill de réponse, multiple autorisé |
| `tool_call:*` | `assistant` + `tool` | Entre user et assistant | Simule un appel d'outil (ex: `tool_call:example1`) |
| `tool_result:*` ou `tool_answer:*` | `tool` | Après tool_call | Résultat d'outil simulé |

## Ordre d'injection

Les messages sont injectés dans cet ordre précis:

```
1. system_prompt (tous concaténés)
2. tool_instructions (concaténé au system)
3. [System prompt du thread si présent - fusionné avec #1]
4. user_prompt (multiples possibles, ordre préservé)
5. tool_call + tool_result (paires, ordre préservé)
6. assistant_prompt (multiples possibles, ordre préservé)
7. [Messages de conversation réels commencent ici]
```

## Flux de fonctionnement

### 1. Exposition des prompts (Côté serveur MCP)

Un serveur MCP expose des prompts via le protocole MCP:

```typescript
// Dans un serveur MCP (ex: obsidian-memory)
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'user_prompt',  // ← Nom conventionnel détecté
      description: 'Main memory index',
    }
  ]
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'user_prompt') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: '# Memory Vault Index\n\n[Contenu de la mémoire...]'
          }
        }
      ]
    }
  }
})
```

### 2. Récupération et détection (Côté client)

Lors de l'envoi d'un message par l'utilisateur:

```typescript
// 1. Interroger tous les serveurs MCP actifs
const servers = mcpManager.getConnectedServers()

// 2. Pour chaque serveur, lister les prompts
const prompts = await mcpManager.listPromptsFromServer(serverId)

// 3. Détecter les prompts conventionnels
function detectPromptType(promptName: string): ConventionalPromptType | null {
  const normalized = promptName.toLowerCase().trim()

  if (normalized === 'system_prompt') return 'system_prompt'
  if (normalized === 'user_prompt') return 'user_prompt'
  // ... autres détections

  return null  // Prompt ignoré s'il ne suit pas la convention
}

// 4. Récupérer le contenu des prompts conventionnels
const content = await mcpManager.getPromptContent(serverId, promptName)
```

### 3. Construction des messages injectés

```typescript
function buildInjectedMessages(prompts: ConventionalPrompt[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = []

  // 1. Fusionner tous les system_prompt
  const systemPrompts = prompts.filter(p => p.type === 'system_prompt')
  if (systemPrompts.length > 0) {
    const combinedSystem = systemPrompts
      .map(p => `[System instructions from Server: ${p.serverName}]\n${p.content}`)
      .join('\n\n---\n\n')

    messages.push({
      role: 'system',
      content: combinedSystem
    })
  }

  // 2. Ajouter user_prompt
  prompts.filter(p => p.type === 'user_prompt')
    .forEach(p => messages.push({ role: 'user', content: p.content }))

  // 3. Ajouter tool_call/tool_result
  // 4. Ajouter assistant_prompt

  return messages
}
```

### 4. Fusion avec le contexte du thread

```typescript
// Dans useStreamingChat.ts

// Récupérer les prompts injectés
const injectedMessages = await getInjectedMessages(mcpManager)

// Fusionner avec le system prompt du thread
const threadSystemPrompt = threadStore.currentSystemPrompt

if (threadSystemPrompt && injectedMessages[0]?.role === 'system') {
  // Ajouter le system prompt du thread aux prompts MCP
  injectedMessages[0].content += `\n\n---\n\n[Thread System Prompt]\n${threadSystemPrompt}`
} else if (threadSystemPrompt) {
  // Pas de system prompt MCP, créer un nouveau
  injectedMessages.unshift({
    role: 'system',
    content: threadSystemPrompt
  })
}
```

### 5. Construction finale de la conversation

```typescript
const conversationMessages = [
  ...injectedMessages,           // Prompts MCP injectés
  ...userConversationMessages    // Messages utilisateur/assistant réels
]

// Envoi à l'API OpenAI
await fetch(`${baseURL}/chat/completions`, {
  body: JSON.stringify({
    model: modelConfig.model,
    messages: conversationMessages,
    stream: true
  })
})
```

## Exemple concret: Obsidian Memory

### Configuration du serveur

Le serveur `obsidian-memory` expose deux prompts pour simuler un appel d'outil:

```typescript
// mcp-servers/built-in/obsidian-memory/src/index.ts
{
  name: 'tool_call:memory_index',
  description: 'Simulated tool call to retrieve the memory vault root index'
},
{
  name: 'tool_result:memory_index',
  description: 'Result of the memory_get_root tool call'
}
```

### Contenu retourné

**tool_call:memory_index** (Message assistant simulé):
```
Let me check the memory vault index to understand what information is available.
```

**tool_result:memory_index** (Résultat JSON du tool):
```json
{
  "success": true,
  "tool": "memory_get_root",
  "data": {
    "id": "root-index",
    "title": "Index",
    "path": "_index.md",
    "content": "[Contenu markdown de la note root]",
    "links": ["Project A", "Project B", "Ideas", "Notes", "Archive"],
    "backlinks": ["Daily Notes", "Quick Capture", "Reference"],
    "tags": ["index", "root"],
    "created": "2025-01-01T00:00:00.000Z",
    "modified": "2025-01-15T12:30:00.000Z"
  }
}
```

### Résultat dans la conversation

Quand un utilisateur envoie un message, l'API reçoit:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "[System prompt du thread si présent]"
    },
    {
      "role": "assistant",
      "content": "Let me check the memory vault index to understand what information is available."
    },
    {
      "role": "tool",
      "tool_call_id": "memory_index",
      "name": "memory_index",
      "content": "{\"success\":true,\"tool\":\"memory_get_root\",\"data\":{...}}"
    },
    {
      "role": "user",
      "content": "Comment puis-je organiser mes projets?"
    }
  ]
}
```

### Avantages de cette approche

🎯 **Entraîne le LLM** à comprendre que:
1. Il peut appeler `memory_get_root` pour obtenir l'index
2. Le résultat est structuré en JSON avec des métadonnées
3. Les outils de mémoire sont disponibles et utiles
4. Il doit être proactif dans l'utilisation des tools

💡 Le LLM voit un **exemple d'utilisation réussie** du tool avant même de commencer la conversation, ce qui l'incite à utiliser les outils mémoire de manière plus naturelle et fréquente.

## Création d'un prompt conventionnel

### Étape 1: Ajouter la capacité prompts

```typescript
const server = new Server({
  name: 'mon-serveur',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    prompts: {}  // ← Ajouter cette ligne
  }
})
```

### Étape 2: Implémenter les handlers

```typescript
// Lister les prompts disponibles
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'system_prompt',  // Nom conventionnel
      description: 'Configuration système de mon serveur'
    },
    {
      name: 'user_prompt',
      description: 'Contexte utilisateur automatique'
    }
  ]
}))

// Retourner le contenu d'un prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params

  if (name === 'system_prompt') {
    return {
      messages: [
        {
          role: 'user',  // Le rôle est déterminé par le nom, pas ce champ
          content: {
            type: 'text',
            text: 'Tu es un assistant spécialisé en...'
          }
        }
      ]
    }
  }

  if (name === 'user_prompt') {
    const context = await getMyContext()
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Contexte actuel:\n${context}`
          }
        }
      ]
    }
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`)
})
```

### Étape 3: Tester

1. Démarrez le serveur MCP
2. Dans l'app Jarvis, ouvrez les détails du serveur
3. Allez dans l'onglet "Prompts"
4. Vérifiez que vos prompts apparaissent avec leur badge de type
5. Démarrez une conversation - les prompts seront automatiquement injectés!

## Cas d'usage avancés

### Entraînement du LLM via tool calls simulés

**Objectif**: Montrer au LLM comment utiliser les tools de manière proactive en simulant des appels réussis.

**Technique**: Au lieu d'injecter directement du contexte avec `user_prompt`, utilisez une paire `tool_call` + `tool_result` pour démontrer l'utilisation d'un tool.

**Exemple - Obsidian Memory**:

```typescript
// Au lieu de ceci (approche passive):
{
  name: 'user_prompt',
  description: 'Memory vault index'
}
// Contenu: "Voici l'index du vault: [données]"

// Faire ceci (approche active - entraînement):
{
  name: 'tool_call:memory_index',
  description: 'Simulated call to memory_get_root'
}
// Contenu: "Let me check the memory vault..."

{
  name: 'tool_result:memory_index',
  description: 'Result of memory_get_root'
}
// Contenu: {"success": true, "tool": "memory_get_root", "data": {...}}
```

**Résultat**: Le LLM apprend que:
- ✅ Il PEUT et DEVRAIT appeler `memory_get_root` de lui-même
- ✅ Le format de réponse attendu est du JSON structuré
- ✅ Les tools sont fiables et retournent des données utiles
- ✅ C'est une bonne pratique d'être proactif avec les tools

**Quand utiliser cette technique**:
- ✅ Vous voulez que le LLM utilise certains tools automatiquement
- ✅ Le tool retourne beaucoup de données structurées
- ✅ Vous avez des tools "d'initialisation" (get_config, list_items, etc.)
- ❌ Le contexte est simple et ne nécessite pas d'interaction

### Prompt avec arguments

```typescript
{
  name: 'user_prompt',
  description: 'Contexte avec paramètres',
  arguments: [
    {
      name: 'depth',
      description: 'Niveau de détail (1-3)',
      required: false
    },
    {
      name: 'focus',
      description: 'Domaine de focus',
      required: true
    }
  ]
}

// Pour l'instant, les arguments ne sont pas utilisés automatiquement
// Le système injecte toujours sans arguments
// Feature future: configuration par utilisateur
```

### Multiples serveurs avec system_prompt

Si plusieurs serveurs exposent `system_prompt`, ils sont concaténés:

```
[System instructions from Server: obsidian-memory]
Tu as accès à une mémoire Obsidian...

---

[System instructions from Server: code-analyzer]
Tu peux analyser du code...

---

[Thread System Prompt]
Réponds de manière concise.
```

### Tool calls simulés

Pour simuler une interaction outil:

```typescript
// Serveur expose deux prompts
{
  name: 'tool_call:weather',
  description: 'Simule un appel météo'
}
{
  name: 'tool_result:weather',
  description: 'Résultat météo simulé'
}

// Résultat dans la conversation:
[
  { role: 'assistant', content: '{"function":"weather","args":{"city":"Paris"}}' },
  { role: 'tool', tool_call_id: 'weather', content: '{"temp":15,"conditions":"sunny"}' }
]
```

## Débogage

### Logs console

Les logs suivants sont émis lors de l'injection:

```javascript
console.log(`[useStreamingChat] Injected ${count} conventional prompts from MCP servers`)
console.warn('[useStreamingChat] Failed to fetch conventional prompts:', error)
```

### Visualisation

1. Ouvrez DevTools (F12)
2. Onglet "Prompts" dans les détails d'un serveur
3. Section "Overview" affiche le nombre de prompts
4. Vérifiez que le badge de type est correct

### Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| Prompt non injecté | Nom ne suit pas la convention | Utiliser un nom exact: `system_prompt`, `user_prompt`, etc. |
| Serveur pas trouvé | Serveur non RUNNING | Vérifier le statut dans la liste MCP |
| Contenu vide | GetPrompt retourne vide | Vérifier l'implémentation du handler |
| Ordre incorrect | Mauvais type détecté | Respecter case-insensitive: `System_Prompt` = `system_prompt` |

## Limitations actuelles

1. **Pas d'arguments dynamiques** - Les prompts sont appelés sans arguments
2. **Pas de désactivation sélective** - Tous les prompts conventionnels sont injectés
3. **Pas de cache** - Prompts récupérés à chaque message
4. **Pas de preview utilisateur** - L'injection est automatique et invisible

## Évolutions futures

- [ ] Configuration utilisateur pour activer/désactiver certains prompts
- [ ] Support des arguments avec UI de configuration
- [ ] Cache des prompts avec invalidation intelligente
- [ ] Preview du contexte injecté dans l'interface
- [ ] Métriques de tokens utilisés par les prompts
- [ ] Priorité et ordre personnalisable
- [ ] Conditions d'injection (selon le thread, le modèle, etc.)

## Références

- **Spécification MCP**: https://modelcontextprotocol.io/specification
- **Code source**:
  - `src/lib/mcpPromptInjection.ts` - Système d'injection
  - `src/hooks/useStreamingChat.ts` - Intégration chat (lignes 190-239)
  - `mcp-servers/built-in/obsidian-memory/src/index.ts` - Exemple serveur

---

**Note**: Ce système est une extension du protocole MCP standard. Les prompts conventionnels sont une convention de nommage spécifique à Jarvis pour faciliter l'injection automatique de contexte.
