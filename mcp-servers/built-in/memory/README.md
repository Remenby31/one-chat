# Memory MCP Server

Un serveur MCP (Model Context Protocol) pour créer un système de mémoire persistante basé sur des fichiers markdown.

## Fonctionnalités

- ✅ **Fichiers Markdown** : Notes avec frontmatter YAML
- ✅ **Flexible** : Les notes peuvent être créées sans liens obligatoires
- ✅ **Références croisées** : Support des liens wiki `[[note]]` pour construire le graphe
- ✅ **Organisation hiérarchique** : Gestion des dossiers et sous-dossiers
- ✅ **Recherche puissante** : Recherche fuzzy par contenu, titre, tags
- ✅ **Backlinks automatiques** : Détection automatique des références inverses
- ✅ **Tags flexibles** : Support hashtags `#tag` et frontmatter

## Installation

```bash
cd memory-mcp

# Installer les dépendances
npm install

# Compiler TypeScript
npm run build
```

## Configuration

Ajouter dans la configuration MCP:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/chemin/vers/memory-mcp/dist/index.js"],
      "env": {
        "MEMORY_VAULT_PATH": "/chemin/vers/votre/vault"
      }
    }
  }
}
```

## Utilisation

### Créer une note
```
memory_create avec title: "Ma première note" et content: "Ceci est un test"
```

### Référencer les notes (Wikilinks)

Pour lier des notes, utilise la syntaxe `[[Titre]]`:

- Note dans la racine: `[[Ma première note]]`
- Note dans un dossier: `[[Projects/Ma note]]`
- Avec alias: `[[mon-alias]]` (si `aliases: [mon-alias]` en frontmatter)

### Lire une note
```
memory_read avec id: "Ma première note"
```

### Éditer une note (find & replace)
```
memory_edit avec id: "Ma note", old_content: "ancien texte", new_content: "nouveau texte"
```

### Rechercher des notes
```
memory_search avec query: "test"
```

### Créer des dossiers
```
memory_create avec title: "Mon projet", folder: "Projects", content: "..."
```

## Format des notes

```markdown
---
id: unique-id
created: 2025-01-10
modified: 2025-01-10
tags: [tag1, tag2]
aliases: [alias1, alias2]
---

# Titre de la note

Contenu avec [[liens vers autres notes]] et #hashtags.
```

## Outils MCP disponibles

| Outil | Description |
|-------|-------------|
| `memory_create` | Créer une nouvelle note |
| `memory_read` | Lire une note existante |
| `memory_edit` | Éditer une portion d'une note (find & replace) |
| `memory_delete` | Supprimer une note |
| `memory_list` | Lister toutes les notes |
| `memory_search` | Rechercher dans les notes |
| `memory_get_root` | Obtenir la note racine (root-memory) |

## Développement

```bash
# Mode développement avec hot-reload
npm run dev

# Build pour production
npm run build
```

## Licence

MIT
