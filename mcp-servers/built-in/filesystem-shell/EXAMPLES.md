# Exemples d'utilisation - Filesystem-Shell MCP Server

Ce document fournit des exemples concrets d'utilisation des outils pour chaque système d'exploitation.

## Read Tool

### Exemple 1: Lire un fichier texte simple

**Windows:**
```json
{
  "name": "read",
  "arguments": {
    "path": "C:\\Users\\John\\Documents\\notes.txt"
  }
}
```

**macOS/Linux:**
```json
{
  "name": "read",
  "arguments": {
    "path": "/home/john/documents/notes.txt"
  }
}
```

**Résultat:**
```json
{
  "message": "Read file: /home/john/documents/notes.txt",
  "size": "1.25 KB",
  "encoding": "utf-8",
  "fileType": "text",
  "lines": 42,
  "content": "My notes..."
}
```

### Exemple 2: Lire un fichier avec encodage Windows-1252

```json
{
  "name": "read",
  "arguments": {
    "path": "./legacy-data.csv",
    "encoding": "windows-1252"
  }
}
```

### Exemple 3: Lire une image en base64

```json
{
  "name": "read",
  "arguments": {
    "path": "./logo.png",
    "asBase64": true
  }
}
```

**Résultat:**
```json
{
  "message": "Read image file: ./logo.png",
  "size": "45.23 KB",
  "encoding": "base64",
  "mimeType": "image/png",
  "content": "iVBORw0KGgoAAAANSUhEUgAA...",
  "note": "Content is base64-encoded"
}
```

## Write Tool

### Exemple 1: Créer un fichier JSON

**Tous OS:**
```json
{
  "name": "write",
  "arguments": {
    "path": "./config/settings.json",
    "content": "{\n  \"version\": \"1.0.0\",\n  \"debug\": false\n}",
    "createDirectories": true
  }
}
```

**Résultat Windows (CRLF automatique):**
```json
{
  "message": "Created file: C:/project/config/settings.json",
  "bytesWritten": 58,
  "encoding": "utf-8",
  "lineEnding": "CRLF"
}
```

**Résultat Unix (LF automatique):**
```json
{
  "message": "Created file: /project/config/settings.json",
  "bytesWritten": 55,
  "encoding": "utf-8",
  "lineEnding": "LF"
}
```

### Exemple 2: Modifier un fichier existant en préservant les fins de ligne

```json
{
  "name": "write",
  "arguments": {
    "path": "./README.md",
    "content": "# My Project\n\nUpdated documentation...",
    "preserveLineEndings": true
  }
}
```

### Exemple 3: Écriture atomique (éviter corruption)

```json
{
  "name": "write",
  "arguments": {
    "path": "./database/data.json",
    "content": "{\"users\": [...]}",
    "atomic": true
  }
}
```

**Note:** L'écriture atomique écrit d'abord dans un fichier temporaire puis renomme (opération atomique), évitant la corruption si le processus est interrompu.

## Edit Tool

### Exemple 1: Remplacer une version dans package.json

```json
{
  "name": "edit",
  "arguments": {
    "path": "./package.json",
    "find": "\"version\": \"1.0.0\"",
    "replace": "\"version\": \"2.0.0\"",
    "regex": false
  }
}
```

**Résultat:**
```json
{
  "message": "Made 1 replacement(s)",
  "path": "./package.json",
  "replacements": 1,
  "originalSize": 1024,
  "newSize": 1024,
  "sizeDelta": 0
}
```

### Exemple 2: Remplacer tous les TODO par DONE

```json
{
  "name": "edit",
  "arguments": {
    "path": "./src/app.ts",
    "find": "TODO",
    "replace": "DONE",
    "replaceAll": true,
    "caseInsensitive": true
  }
}
```

### Exemple 3: Regex pour remplacer import paths

```json
{
  "name": "edit",
  "arguments": {
    "path": "./src/index.ts",
    "find": "from ['\"]@/(.+?)['\"]",
    "replace": "from '../$1'",
    "regex": true,
    "replaceAll": true
  }
}
```

### Exemple 4: Preview avant modification (dry-run)

```json
{
  "name": "edit",
  "arguments": {
    "path": "./src/config.ts",
    "find": "API_URL = 'localhost'",
    "replace": "API_URL = 'production.com'",
    "dryRun": true
  }
}
```

**Résultat:**
```json
{
  "message": "Dry run - no changes made",
  "replacements": 3,
  "originalSize": 2048,
  "newSize": 2052,
  "sizeDelta": 4,
  "preview": "Found 3 replacement(s):\n\nLine 15:\n  - API_URL = 'localhost'\n  + API_URL = 'production.com'\n..."
}
```

## Bash Tool

### Exemple 1: Installer des dépendances npm

**Tous OS:**
```json
{
  "name": "bash",
  "arguments": {
    "command": "npm install",
    "cwd": "./project",
    "timeout": 300000
  }
}
```

**Résultat:**
```json
{
  "message": "Command executed successfully",
  "exitCode": 0,
  "durationMs": 15432,
  "stdout": "added 247 packages in 15s",
  "shell": "/bin/bash",
  "cwd": "/project"
}
```

### Exemple 2: Lister des fichiers (cross-platform)

**Windows:**
```json
{
  "name": "bash",
  "arguments": {
    "command": "dir /b *.txt"
  }
}
```

**macOS/Linux:**
```json
{
  "name": "bash",
  "arguments": {
    "command": "ls *.txt"
  }
}
```

### Exemple 3: Exécuter des tests avec variables d'environnement

```json
{
  "name": "bash",
  "arguments": {
    "command": "npm test",
    "env": {
      "NODE_ENV": "test",
      "DEBUG": "*",
      "CI": "true"
    },
    "timeout": 120000
  }
}
```

### Exemple 4: Commande avec timeout

```json
{
  "name": "bash",
  "arguments": {
    "command": "npm run build",
    "timeout": 60000
  }
}
```

**Résultat si timeout:**
```json
{
  "message": "Command timed out after 60000ms",
  "exitCode": -1,
  "timedOut": true,
  "durationMs": 60001,
  "stdout": "Building...\nCompiling src/..."
}
```

### Exemple 5: Git operations

```json
{
  "name": "bash",
  "arguments": {
    "command": "git status --porcelain",
    "cwd": "./my-repo"
  }
}
```

## Glob Tool

### Exemple 1: Trouver tous les fichiers TypeScript

```json
{
  "name": "glob",
  "arguments": {
    "patterns": "**/*.{ts,tsx}",
    "cwd": "./src"
  }
}
```

**Résultat:**
```json
{
  "message": "Found 47 match(es)",
  "count": 47,
  "patterns": ["**/*.{ts,tsx}"],
  "cwd": "/project/src",
  "matches": [
    "/project/src/index.ts",
    "/project/src/app.tsx",
    "/project/src/components/Button.tsx",
    "..."
  ]
}
```

### Exemple 2: Multiple patterns

```json
{
  "name": "glob",
  "arguments": {
    "patterns": [
      "**/*.ts",
      "**/*.tsx",
      "!**/*.test.ts",
      "!**/*.spec.tsx"
    ]
  }
}
```

### Exemple 3: Trouver les répertoires uniquement

```json
{
  "name": "glob",
  "arguments": {
    "patterns": "*",
    "onlyDirectories": true,
    "maxDepth": 1
  }
}
```

### Exemple 4: Inclure les fichiers cachés

```json
{
  "name": "glob",
  "arguments": {
    "patterns": ".*",
    "includeHidden": true,
    "maxDepth": 1
  }
}
```

**Résultat:**
```json
{
  "message": "Found 5 match(es)",
  "count": 5,
  "matches": [
    "/project/.gitignore",
    "/project/.env",
    "/project/.prettierrc",
    "/project/.eslintrc.json",
    "/project/.vscode"
  ]
}
```

### Exemple 5: Case-sensitive sur Windows

```json
{
  "name": "glob",
  "arguments": {
    "patterns": "**/*.Config.ts",
    "caseSensitive": true
  }
}
```

**Note:** Force la recherche case-sensitive même sur Windows (trouve `AppConfig.ts` mais pas `appconfig.ts`).

## Grep Tool

### Exemple 1: Rechercher tous les TODO

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "TODO",
    "regex": false,
    "path": "./src"
  }
}
```

**Résultat:**
```json
{
  "message": "Found 12 match(es) in 8 file(s)",
  "totalMatches": 12,
  "filesSearched": 47,
  "usedRipgrep": true,
  "matches": [
    {
      "file": "/project/src/app.ts",
      "line": 42,
      "column": 8,
      "match": "// TODO: Implement error handling"
    },
    {
      "file": "/project/src/utils.ts",
      "line": 15,
      "column": 4,
      "match": "// TODO: Add validation"
    }
  ]
}
```

### Exemple 2: Regex pour trouver les fonctions

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "function\\s+\\w+\\s*\\(",
    "regex": true,
    "filePattern": "**/*.js"
  }
}
```

### Exemple 3: Recherche avec contexte

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "console\\.log",
    "regex": true,
    "contextBefore": 2,
    "contextAfter": 2
  }
}
```

**Résultat:**
```json
{
  "matches": [
    {
      "file": "/project/src/debug.ts",
      "line": 24,
      "column": 4,
      "match": "console.log('Debug:', data);",
      "contextBefore": [
        "function debugData(data) {",
        "  if (!DEBUG) return;"
      ],
      "contextAfter": [
        "  validateData(data);",
        "}"
      ]
    }
  ]
}
```

### Exemple 4: Multiline pattern

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "interface\\s+\\w+\\s*\\{[\\s\\S]*?\\}",
    "regex": true,
    "multiline": true,
    "filePattern": "**/*.ts"
  }
}
```

### Exemple 5: Case-insensitive search

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "error|warning|critical",
    "regex": true,
    "caseInsensitive": true,
    "filePattern": "**/*.log"
  }
}
```

## Scénarios réels

### Scénario 1: Migration d'import paths dans un projet TypeScript

**Étape 1: Trouver tous les fichiers TypeScript**
```json
{
  "name": "glob",
  "arguments": {
    "patterns": ["**/*.ts", "**/*.tsx"],
    "ignore": ["**/node_modules/**", "**/dist/**"]
  }
}
```

**Étape 2: Pour chaque fichier, remplacer les imports**
```json
{
  "name": "edit",
  "arguments": {
    "path": "./src/components/Button.tsx",
    "find": "from ['\"]@/(.+?)['\"]",
    "replace": "from '../$1'",
    "regex": true,
    "replaceAll": true
  }
}
```

### Scénario 2: Rechercher et documenter tous les TODOs

**Étape 1: Trouver tous les TODOs**
```json
{
  "name": "grep",
  "arguments": {
    "pattern": "TODO:|FIXME:|HACK:",
    "regex": true,
    "contextAfter": 1
  }
}
```

**Étape 2: Créer un fichier de documentation**
```json
{
  "name": "write",
  "arguments": {
    "path": "./docs/TODO.md",
    "content": "# TODO List\n\n## Found 12 items\n\n- [ ] app.ts:42 - Implement error handling\n..."
  }
}
```

### Scénario 3: Build et test automatisés

**Étape 1: Clean**
```json
{
  "name": "bash",
  "arguments": {
    "command": "rm -rf dist",
    "timeout": 10000
  }
}
```

**Étape 2: Build**
```json
{
  "name": "bash",
  "arguments": {
    "command": "npm run build",
    "env": {
      "NODE_ENV": "production"
    },
    "timeout": 120000
  }
}
```

**Étape 3: Test**
```json
{
  "name": "bash",
  "arguments": {
    "command": "npm test",
    "env": {
      "NODE_ENV": "test",
      "CI": "true"
    },
    "timeout": 180000
  }
}
```

### Scénario 4: Analyse de code (trouver les console.log oubliés)

```json
{
  "name": "grep",
  "arguments": {
    "pattern": "console\\.(log|debug|info|warn|error)",
    "regex": true,
    "filePattern": "**/*.{ts,tsx,js,jsx}",
    "ignore": ["**/*.test.*", "**/*.spec.*"]
  }
}
```

### Scénario 5: Mise à jour de version dans tous les fichiers

**Étape 1: package.json**
```json
{
  "name": "edit",
  "arguments": {
    "path": "./package.json",
    "find": "\"version\": \"1.0.0\"",
    "replace": "\"version\": \"2.0.0\""
  }
}
```

**Étape 2: README.md**
```json
{
  "name": "edit",
  "arguments": {
    "path": "./README.md",
    "find": "v1\\.0\\.0",
    "replace": "v2.0.0",
    "regex": true
  }
}
```

**Étape 3: Vérification**
```json
{
  "name": "grep",
  "arguments": {
    "pattern": "1\\.0\\.0",
    "regex": true
  }
}
```

## Gestion d'erreurs

### Fichier non trouvé

```json
{
  "name": "read",
  "arguments": {
    "path": "./does-not-exist.txt"
  }
}
```

**Résultat:**
```json
{
  "error": "File not found: /project/does-not-exist.txt",
  "tool": "read"
}
```

### Permission refusée

```json
{
  "name": "write",
  "arguments": {
    "path": "/etc/passwd",
    "content": "hacked"
  }
}
```

**Résultat:**
```json
{
  "error": "Parent directory not writable: /etc",
  "tool": "write"
}
```

### Timeout de commande

```json
{
  "name": "bash",
  "arguments": {
    "command": "sleep 100",
    "timeout": 5000
  }
}
```

**Résultat:**
```json
{
  "message": "Command timed out after 5000ms",
  "exitCode": -1,
  "timedOut": true,
  "durationMs": 5001
}
```

### Fichier verrouillé (Windows)

```json
{
  "name": "write",
  "arguments": {
    "path": "C:\\Windows\\System32\\config\\SAM",
    "content": "data"
  }
}
```

**Résultat:**
```json
{
  "error": "File is locked by another process: C:/Windows/System32/config/SAM",
  "tool": "write"
}
```

## Bonnes pratiques

### 1. Toujours utiliser des chemins absolus pour la production

```json
// ❌ Mauvais (relatif, peut changer)
{
  "path": "./config.json"
}

// ✅ Bon (absolu, prévisible)
{
  "path": "/project/config/config.json"
}
```

### 2. Utiliser dry-run pour les opérations critiques

```json
// Étape 1: Preview
{
  "name": "edit",
  "arguments": {
    "path": "./database/schema.sql",
    "find": "DROP TABLE",
    "replace": "-- DROP TABLE",
    "dryRun": true
  }
}

// Étape 2: Appliquer si OK
{
  "name": "edit",
  "arguments": {
    "path": "./database/schema.sql",
    "find": "DROP TABLE",
    "replace": "-- DROP TABLE",
    "dryRun": false
  }
}
```

### 3. Utiliser atomic writes pour éviter la corruption

```json
{
  "name": "write",
  "arguments": {
    "path": "./important-data.json",
    "content": "...",
    "atomic": true  // Always true for critical data
  }
}
```

### 4. Limiter les résultats grep pour éviter la surcharge

```json
{
  "name": "grep",
  "arguments": {
    "pattern": ".",
    "maxResults": 100  // Limit output
  }
}
```

### 5. Utiliser glob avec ignore pour de meilleures performances

```json
{
  "name": "glob",
  "arguments": {
    "patterns": "**/*.js",
    "ignore": [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**"
    ]
  }
}
```
