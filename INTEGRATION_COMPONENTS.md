# Intégration des composants assistant-ui

## Composants installés et intégrés

### ✅ Composants fonctionnels dans Thread

1. **Markdown** - Support du rendu markdown avec `MarkdownText`
2. **Syntax Highlighting** - Coloration syntaxique avec `shiki-highlighter` (react-shiki)
3. **Mermaid Diagrams** - Rendu de diagrammes Mermaid
4. **ToolFallback** - Interface par défaut pour les appels d'outils
5. **ToolGroup** - Regroupement d'appels d'outils consécutifs
6. **Custom Scrollbar** - Scrollbar personnalisée avec Radix UI
7. **Attachment** - Support des pièces jointes (images, fichiers)

### 📦 Composants UI disponibles

#### Thread (principal)
- Localisation: `src/components/assistant-ui/thread.tsx`
- Fonctionnalités:
  - Messages avec markdown enrichi
  - Syntax highlighting pour le code
  - Diagrammes Mermaid
  - Pièces jointes
  - Scrollbar personnalisée
  - Regroupement d'outils

#### ThreadList
- Localisation: `src/components/assistant-ui/thread-list.tsx`
- Liste des conversations avec:
  - Création de nouvelles conversations
  - Navigation entre threads
  - Actions d'archivage et suppression

#### AssistantModal
- Localisation: `src/components/assistant-ui/assistant-modal.tsx`
- Chat bubble en bas à droite
- Idéal pour support/Q&A

#### AssistantSidebar
- Localisation: `src/components/assistant-ui/assistant-sidebar.tsx`
- Chat sidebar redimensionnable
- Idéal pour copilot

## Configuration actuelle

### Thread enrichi

Le composant Thread intègre:

```tsx
<MessagePrimitive.Parts
  components={{
    Text: MarkdownText,           // Markdown + Syntax Highlighting + Mermaid
    tools: { Fallback: ToolFallback },  // UI par défaut pour outils
    ToolGroup,                     // Regroupement d'outils
  }}
/>
```

### Markdown avec extensions

```tsx
<MarkdownTextPrimitive
  components={defaultComponents}
  componentsByLanguage={{
    mermaid: {
      SyntaxHighlighter: MermaidDiagram
    },
  }}
/>
```

Le `defaultComponents` inclut le `SyntaxHighlighter` pour tous les blocs de code.

### Scrollbar personnalisée

```tsx
<ScrollAreaPrimitive.Root asChild>
  <ThreadPrimitive.Root>
    <ScrollAreaPrimitive.Viewport className="thread-viewport" asChild>
      <ThreadPrimitive.Viewport>
        {/* Contenu */}
      </ThreadPrimitive.Viewport>
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
  </ThreadPrimitive.Root>
</ScrollAreaPrimitive.Root>
```

## Exemples d'utilisation

### Utiliser le Thread principal
```tsx
import { Thread } from "@/components/assistant-ui/thread";

<Thread />
```

### Utiliser AssistantModal
```tsx
import { AssistantModal } from "@/components/assistant-ui/assistant-modal";

<AssistantModal />
```

### Utiliser AssistantSidebar
```tsx
import { AssistantSidebar } from "@/components/assistant-ui/assistant-sidebar";

<AssistantSidebar>
  {/* Votre contenu principal */}
</AssistantSidebar>
```

### Utiliser ThreadList
```tsx
import { ThreadList } from "@/components/assistant-ui/thread-list";

<div className="grid h-full grid-cols-[200px_1fr]">
  <ThreadList />
  <Thread />
</div>
```

## Notes importantes

### Message Part Grouping
Le composant Thread supporte déjà le groupement via `ToolGroup`. Pour un groupement plus avancé, utiliser `MessagePrimitive.Unstable_PartsGrouped` avec une fonction de groupement personnalisée.

### Attachments
Les composants d'attachments sont intégrés mais nécessitent la configuration d'adapteurs dans le runtime pour gérer le téléchargement et le traitement des fichiers. Voir la documentation assistant-ui pour la configuration complète.

### Thèmes Shiki
Configuration actuelle: `{ dark: "kanagawa-wave", light: "kanagawa-lotus" }`
Peut être modifié dans `src/components/assistant-ui/shiki-highlighter.tsx`

### Thème Mermaid
Configuration actuelle: `{ theme: "default" }`
Peut être modifié dans `src/components/assistant-ui/mermaid-diagram.tsx`

## Problèmes TypeScript restants

Les erreurs TypeScript actuelles concernent:
1. AttachmentPrimitive.Content - API potentiellement obsolète
2. Fichiers existants du projet (ErrorBoundary, Settings, Sidebar, runtime)

Ces erreurs ne concernent pas les nouveaux composants intégrés et nécessitent des corrections dans le code existant du projet.