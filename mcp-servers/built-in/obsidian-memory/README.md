# Obsidian Memory MCP Server

Un serveur MCP (Model Context Protocol) pour créer un système de mémoire persistante compatible avec Obsidian.

## Fonctionnalités

- ✅ **Compatible Obsidian** : Fichiers markdown avec frontmatter YAML
- ✅ **Flexible** : Les notes peuvent être créées sans liens obligatoires
- ✅ **Références croisées** : Support des liens wiki `[[note]]` pour construire le graphe
- ✅ **Organisation hiérarchique** : Gestion des dossiers et sous-dossiers
- ✅ **Recherche puissante** : Recherche fuzzy par contenu, titre, tags
- ✅ **Backlinks automatiques** : Détection automatique des références inverses
- ✅ **Tags flexibles** : Support hashtags `#tag` et frontmatter
- ✅ **Graphe de connaissances** : Visualisation des connexions entre notes (root-memory comme point d'entrée)

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
La note est créée librement. Ajoute `[[root-memory]]` ou une autre référence dans le contenu pour la connecter au graphe.

### Lire une note
```
Utilise memory_read pour lire la note "Ma première note"
```

### Rechercher des notes
```
Utilise memory_search pour chercher "test" dans mes notes
```

### Créer des liens manuels
```
Utilise memory_update pour ajouter [[Note A]] dans le contenu de "Note B"
```

### Voir les backlinks
```
Utilise memory_backlinks pour voir toutes les notes qui référencent "Note B"
```

### Upsert (créer ou mettre à jour)
```
Utilise memory_upsert pour créer ou mettre à jour une note en une seule opération
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
| `memory_create` | Créer une nouvelle note (libre, sans obligation de liens) |
| `memory_read` | Lire une note existante |
| `memory_update` | Modifier une note et ajouter des liens |
| `memory_upsert` | Créer ou mettre à jour une note en une opération |
| `memory_delete` | Supprimer une note |
| `memory_list` | Lister toutes les notes |
| `memory_search` | Rechercher dans les notes |
| `memory_link` | Créer un lien entre notes |
| `memory_backlinks` | Obtenir les backlinks |
| `memory_graph` | Obtenir le graphe de connaissances |
| `memory_get_root` | Obtenir la note racine (root-memory) |
| `memory_validate_graph` | Valider la connectivité du graphe |

## Philosophie de conception

### Flexibilité plutôt que contraintes

- **Pas de validation stricte** : Les notes peuvent être créées sans liens
- **Graphe organique** : Le LLM décide comment connecter les notes
- **Suggestions intelligentes** : Après chaque création, un rappel suggère d'ajouter des liens
- **root-memory comme point d'entrée** : Note racine pour naviguer (mais pas obligatoire de tout y lier directement)

### Points clés

1. Les notes sont créées sans obligation de connexion
2. Le LLM reçoit une suggestion après chaque création
3. Les liens entre notes peuvent être créés progressivement
4. Le graphe se construit naturellement via les appels `memory_update` et `memory_link`

## Développement

```bash
# Mode développement avec hot-reload
npm run dev

# Lancer les tests
npm test

# Build pour production
npm run build
```

## Migration depuis les versions antérieures

Si vous aviez une version antérieure avec `index.md`:
- Le serveur renomme automatiquement `index.md` → `root-memory.md`
- L'ID frontmatter est mis à jour de `root-index` → `root-memory`
- Aucune action requise de votre part

## Licence

MIT