# Obsidian Memory MCP Server

Un serveur MCP (Model Context Protocol) pour créer un système de mémoire persistante compatible avec Obsidian.

## Fonctionnalités

- ✅ **Compatible Obsidian** : Fichiers markdown avec frontmatter YAML
- ✅ **Références croisées** : Support des liens wiki `[[note]]`
- ✅ **Organisation hiérarchique** : Gestion des dossiers et sous-dossiers
- ✅ **Recherche puissante** : Recherche fuzzy par contenu, titre, tags
- ✅ **Backlinks automatiques** : Détection automatique des références inverses
- ✅ **Tags flexibles** : Support hashtags `#tag` et frontmatter
- ✅ **Graphe de connaissances** : Visualisation des connexions entre notes

## Installation

```bash
# Cloner le repository
cd obsidian-memory-mcp

# Installer les dépendances
npm install

# Compiler TypeScript
npm run build
```

## Configuration Claude Desktop

Ajouter dans `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian-memory": {
      "command": "node",
      "args": ["/chemin/vers/obsidian-memory-mcp/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/chemin/vers/votre/vault"
      }
    }
  }
}
```

## Utilisation avec Claude

### Créer une note
```
Utilise memory_create pour créer une note "Ma première note" avec le contenu "Ceci est un test"
```

### Lire une note
```
Utilise memory_read pour lire la note "Ma première note"
```

### Rechercher des notes
```
Utilise memory_search pour chercher "test" dans mes notes
```

### Créer des liens
```
Utilise memory_link pour lier "Note A" à "Note B"
```

### Voir les backlinks
```
Utilise memory_backlinks pour voir toutes les notes qui référencent "Note B"
```

## Structure du Vault

```
vault/
├── Daily/           # Notes quotidiennes
├── Projects/        # Notes de projets
├── References/      # Notes de référence
└── Archive/         # Notes archivées
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

## Section

Contenu...
```

## Outils MCP disponibles

| Outil | Description |
|-------|-------------|
| `memory_create` | Créer une nouvelle note |
| `memory_read` | Lire une note existante |
| `memory_update` | Modifier une note |
| `memory_delete` | Supprimer une note |
| `memory_list` | Lister toutes les notes |
| `memory_search` | Rechercher dans les notes |
| `memory_link` | Créer un lien entre notes |
| `memory_backlinks` | Obtenir les backlinks |
| `memory_graph` | Obtenir le graphe de connaissances |

## Développement

```bash
# Mode développement avec hot-reload
npm run dev

# Lancer les tests
npm test

# Build pour production
npm run build
```

## Licence

MIT