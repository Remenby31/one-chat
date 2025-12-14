# Filesystem-Shell MCP Server - Architecture Documentation

## Vue d'ensemble

Ce serveur MCP fournit des outils filesystem et shell cross-platform compatibles avec Windows, macOS et Linux. L'architecture est conçue pour gérer les différences entre systèmes d'exploitation de manière transparente.

## Outils disponibles

### 1. Read Tool (`src/tools/read.ts`)

Lecture de fichiers avec gestion cross-platform complète.

**Fonctionnalités:**
- Détection automatique de l'encodage (UTF-8, UTF-16 LE/BE, Windows-1252, Latin1, ASCII)
- Gestion des fichiers binaires (détection via null bytes et ratio de caractères non-imprimables)
- Support des images (retour en base64)
- Résolution des liens symboliques
- Vérification des permissions avant lecture
- Support des BOM (Byte Order Mark)

**Cas d'usage cross-platform:**

```typescript
// Fichier Windows avec UTF-16 LE + BOM
await readFile({ path: 'C:\\Users\\file.txt' });
// → Détecte automatiquement UTF-16 LE via BOM

// Fichier Unix avec UTF-8
await readFile({ path: '/home/user/file.txt' });
// → Détecte automatiquement UTF-8

// Image
await readFile({ path: './image.png' });
// → Retourne base64 automatiquement
```

**Gestion des chemins:**
- Normalisation automatique: `C:\Path\File` → `C:/Path/File` (interne)
- Support des chemins relatifs et absolus
- Expansion du `~` (home directory)
- Résolution des symlinks (Unix/macOS)

**Détection d'encodage:**
1. Vérification du BOM (si présent)
2. Analyse heuristique via `chardet` (détecte ~40 encodages)
3. Fallback UTF-8 si inconnu

### 2. Write Tool (`src/tools/write.ts`)

Écriture de fichiers avec préservation des attributs.

**Fonctionnalités:**
- Création récursive de répertoires (`mkdir -p` équivalent)
- Gestion des fins de ligne (CRLF Windows ↔ LF Unix)
- Préservation de l'encodage original
- Écriture atomique (temp file + rename)
- Préservation des permissions Unix (chmod)
- Détection des fichiers verrouillés (Windows)

**Cas d'usage cross-platform:**

```typescript
// Windows - CRLF automatique
await writeFile({
  path: 'C:\\temp\\file.txt',
  content: 'Hello\nWorld',
  preserveLineEndings: true
});
// → Écrit "Hello\r\nWorld" (CRLF)

// Unix - LF automatique
await writeFile({
  path: '/tmp/file.txt',
  content: 'Hello\nWorld',
  preserveLineEndings: true
});
// → Écrit "Hello\nWorld" (LF)

// Écriture atomique (évite corruption)
await writeFile({
  path: './important.json',
  content: JSON.stringify(data),
  atomic: true  // default
});
// → Écrit dans temp file puis rename (opération atomique)
```

**Gestion des fins de ligne:**
1. Détecte le style existant (CRLF/LF/CR/mixed)
2. Préserve le style si `preserveLineEndings: true`
3. Sinon utilise le style de la plateforme (`\r\n` Windows, `\n` Unix)

**Écriture atomique:**
- Windows: Write → Rename (quasi-atomique, peut échouer si fichier ouvert)
- Unix: Write → Rename (atomique POSIX)

### 3. Edit Tool (`src/tools/edit.ts`)

Find/replace avec préservation des attributs.

**Fonctionnalités:**
- Recherche littérale ou regex
- Case-sensitive/insensitive
- Remplacement multiple ou simple
- Mode multiline (regex cross-line)
- Preview (dry-run)
- Préservation encoding + line endings

**Cas d'usage cross-platform:**

```typescript
// Replace avec regex
await editFile({
  path: './src/config.ts',
  find: 'version:\\s*"[^"]*"',
  replace: 'version: "2.0.0"',
  regex: true
});

// Replace littéral case-insensitive
await editFile({
  path: './README.md',
  find: 'TODO',
  replace: 'DONE',
  caseInsensitive: true,
  replaceAll: true
});

// Preview avant modification
await editFile({
  path: './package.json',
  find: '"version": "1.0.0"',
  replace: '"version": "2.0.0"',
  dryRun: true
});
// → Retourne preview sans modifier le fichier
```

**Préservation:**
- Encoding: Détecté puis préservé lors de l'écriture
- Line endings: Détectés puis préservés (CRLF ↔ LF)
- BOM: Préservé si présent

### 4. Bash Tool (`src/tools/bash.ts`)

Exécution de commandes shell cross-platform.

**Fonctionnalités:**
- Détection automatique du shell (cmd/PowerShell/bash/zsh)
- Gestion des variables d'environnement
- Timeout avec kill du process tree
- Capture stdout/stderr séparément
- Support du working directory
- Échappement des arguments (prévention injection)

**Shells par plateforme:**

| Plateforme | Shell par défaut | Variable |
|-----------|-----------------|----------|
| Windows | `cmd.exe` ou `powershell.exe` | `%COMSPEC%` |
| macOS | `/bin/zsh` (moderne) ou `/bin/bash` | `$SHELL` |
| Linux | `/bin/bash` ou `/bin/sh` | `$SHELL` |

**Cas d'usage cross-platform:**

```typescript
// Windows (cmd.exe)
await executeBash({
  command: 'dir /b *.txt',
  cwd: 'C:\\temp'
});
// → Utilise cmd.exe automatiquement

// Unix (bash)
await executeBash({
  command: 'ls -la *.txt',
  cwd: '/tmp'
});
// → Utilise bash automatiquement

// Commande multi-plateforme
await executeBash({
  command: IS_WINDOWS ? 'dir /b' : 'ls',
  timeout: 30000
});

// Avec variables d'environnement
await executeBash({
  command: 'npm test',
  env: {
    NODE_ENV: 'test',
    DEBUG: '*'
  }
});
```

**Gestion du timeout:**
- Kill du process principal
- Kill de tous les processus enfants (tree-kill)
- Support des signaux Unix (`SIGTERM`, `SIGKILL`)
- Force kill sur Windows (`taskkill /F /T`)

**Sécurité:**
- Fonction `isCommandSafe()` détecte les patterns dangereux
- Échappement des arguments via `escapeShellArg()`
- Validation des chemins (pas d'exécution hors CWD)

### 5. Glob Tool (`src/tools/glob.ts`)

Pattern matching de fichiers avec fast-glob.

**Fonctionnalités:**
- Support des patterns glob standard (`**/*.ts`, `{a,b}`, `[0-9]`)
- Gestion case-sensitivity selon OS
- Support .gitignore automatique
- Hidden files handling
- Symlinks following (optionnel)
- Depth limiting

**Case sensitivity par plateforme:**

| Plateforme | Case-sensitive | Raison |
|-----------|----------------|--------|
| Linux | Oui | Filesystem ext4/btrfs case-sensitive |
| macOS | Non | APFS/HFS+ case-insensitive par défaut |
| Windows | Non | NTFS case-insensitive |

**Cas d'usage cross-platform:**

```typescript
// Tous les TypeScript
await globFiles({
  patterns: '**/*.ts',
  cwd: './src'
});

// Multiple patterns
await globFiles({
  patterns: ['**/*.{ts,tsx}', '!**/*.test.ts'],
  ignore: ['**/node_modules/**', '**/dist/**']
});

// Force case-sensitive (Linux-style sur Windows)
await globFiles({
  patterns: '**/*.Config.ts',
  caseSensitive: true  // Force case-sensitive
});

// Directories only
await globFiles({
  patterns: '*',
  onlyDirectories: true
});
```

**Patterns ignorés par défaut:**
- `**/node_modules/**`
- `**/.git/**`
- `**/dist/**`
- `**/build/**`
- `**/.next/**`
- `**/.nuxt/**`

### 6. Grep Tool (`src/tools/grep.ts`)

Recherche dans le contenu avec ripgrep + fallback Node.js.

**Fonctionnalités:**
- Utilise ripgrep (`rg`) si disponible (100x plus rapide)
- Fallback Node.js si ripgrep absent
- Regex et literal search
- Context lines (before/after)
- Multiline patterns
- File type filtering

**Performance:**

| Méthode | Vitesse | Codebase 10k fichiers |
|---------|---------|----------------------|
| ripgrep | ~100 MB/s | ~2 secondes |
| Node.js | ~10 MB/s | ~20 secondes |

**Cas d'usage cross-platform:**

```typescript
// Recherche simple
await grepSearch({
  pattern: 'TODO',
  path: './src'
});

// Regex avec context
await grepSearch({
  pattern: 'function\\s+\\w+\\(',
  regex: true,
  contextBefore: 2,
  contextAfter: 2
});

// Multiline pattern
await grepSearch({
  pattern: 'interface\\s+\\{[\\s\\S]*?\\}',
  multiline: true,
  regex: true
});

// Filter files
await grepSearch({
  pattern: 'export default',
  filePattern: '**/*.{ts,tsx}'
});
```

**Détection ripgrep:**
1. Check `rg` dans PATH au premier appel
2. Cache le résultat en mémoire
3. Fallback automatique si `rg` échoue

## Utilitaires cross-platform

### Path Utilities (`src/utils/path.ts`)

Normalisation des chemins entre OS.

**Problématiques résolues:**
- Séparateurs: `\` (Windows) vs `/` (Unix)
- Chemins absolus: `C:\` vs `/`
- Home directory: `%USERPROFILE%` vs `$HOME`
- Case sensitivity filesystem

**API:**

```typescript
// Normalisation interne (toujours forward slash)
normalizePath('C:\\Users\\file.txt')  // → 'C:/Users/file.txt'

// Native OS format
toNativePath('./file.txt')
// Windows: '.\\file.txt'
// Unix: './file.txt'

// Check absolute
isAbsolute('C:\\temp')  // → true (Windows)
isAbsolute('/tmp')      // → true (Unix)

// Home expansion
resolveHome('~/Documents/file.txt')
// Windows: 'C:/Users/Username/Documents/file.txt'
// Unix: '/home/username/Documents/file.txt'
```

### Encoding Utilities (`src/utils/encoding.ts`)

Gestion des encodages entre plateformes.

**Encodages supportés:**
- UTF-8 (universel)
- UTF-16 LE (Windows par défaut)
- UTF-16 BE (macOS/Unix rare)
- ASCII (compatible UTF-8)
- Windows-1252 (legacy Windows)
- ISO-8859-1 / Latin1 (legacy Unix)

**Détection:**

```typescript
// Auto-detect
await detectEncoding('./file.txt')
// → Analyse BOM puis heuristique

// Check binary
await isBinaryFile('./image.png')  // → true
await isBinaryFile('./text.txt')   // → false

// Read with encoding
await readFileWithEncoding('./file.txt', 'utf-16le')
```

**BOM (Byte Order Mark):**

| Encoding | BOM bytes | Usage |
|----------|-----------|-------|
| UTF-8 | `EF BB BF` | Rare, Windows notepad |
| UTF-16 LE | `FF FE` | Windows par défaut |
| UTF-16 BE | `FE FF` | macOS/Unix rare |

### Line Ending Utilities (`src/utils/lineEndings.ts`)

Gestion des fins de ligne.

**Styles par OS:**

| OS | Style | Bytes | Exemple |
|----|-------|-------|---------|
| Windows | CRLF | `\r\n` | `0D 0A` |
| Unix/Linux | LF | `\n` | `0A` |
| Old Mac | CR | `\r` | `0D` |

**API:**

```typescript
// Détection
detectLineEnding('Hello\r\nWorld')  // → 'crlf'
detectLineEnding('Hello\nWorld')    // → 'lf'

// Conversion
convertLineEndings(text, 'crlf')  // → Convertit en CRLF
convertLineEndings(text, 'lf')    // → Convertit en LF

// Préservation
preserveLineEndings(originalContent, newContent)
// → Applique le style de originalContent à newContent

// Platform-specific
toPlatformLineEndings(text)
// Windows: → CRLF
// Unix: → LF
```

### Permission Utilities (`src/utils/permissions.ts`)

Vérification des permissions cross-platform.

**Différences OS:**

| Fonctionnalité | Unix | Windows |
|---------------|------|---------|
| Permissions | rwx (chmod) | ACLs |
| Exécutable | chmod +x | Extension (.exe) |
| Symlinks | ln -s | mklink (admin) |
| File locking | Advisory | Mandatory |

**API:**

```typescript
// Check permissions
await checkPermissions('./file.txt')
// → { readable: true, writable: true, executable: false, exists: true }

// Unix permissions
await getPermissionsOctal('./file.txt')  // → '0644'
await setPermissions('./file.txt', 0755)  // Unix only

// Windows file locking
await isFileLocked('./file.txt')  // Windows only

// Symlinks
await isSymbolicLink('./link')
await resolveSymlink('./link')  // → Chemin réel
```

### Process Utilities (`src/utils/process.ts`)

Spawn de processus cross-platform.

**Shell detection:**

```typescript
// Auto shell
getDefaultShell()
// Windows: 'cmd.exe' ou 'powershell.exe'
// macOS: '/bin/zsh'
// Linux: '/bin/bash'

// Command args
getShellCommandArgs('npm test')
// Windows cmd: ['cmd.exe', '/d', '/s', '/c', 'npm test']
// Windows PS: ['powershell.exe', '-NoProfile', '-Command', 'npm test']
// Unix: ['/bin/bash', '-c', 'npm test']
```

**Process management:**

```typescript
// Spawn avec timeout
await spawnProcess('node', ['script.js'], {
  cwd: '/path/to/dir',
  timeout: 30000,
  env: { NODE_ENV: 'production' }
})

// Kill process tree
killProcess(childProcess, 'SIGTERM')
// Unix: Envoie SIGTERM
// Windows: taskkill /F /T

// Check command exists
await commandExists('git')  // → true/false
await resolveCommand('git') // → '/usr/bin/git'
```

**PATH handling:**

```typescript
// Normalize environment
normalizeEnvironment({
  PATH: '/usr/bin',
  Path: '/usr/local/bin'  // Windows case-insensitive
})
// → Merge en une seule variable PATH

// Add to PATH
addToPath(env, '/custom/bin')
// Windows: 'PATH=/custom/bin;C:\existing'
// Unix: 'PATH=/custom/bin:/existing'
```

## Patterns de gestion d'erreurs

### Read Tool

```typescript
try {
  const result = await readFile({ path: './file.txt' });
} catch (error) {
  if (error.message.includes('not found')) {
    // File doesn't exist
  } else if (error.message.includes('permission denied')) {
    // Not readable
  } else if (error.message.includes('not a file')) {
    // Path is directory
  }
}
```

### Write Tool

```typescript
try {
  const result = await writeFile({ path: './file.txt', content: 'data' });
} catch (error) {
  if (error.message.includes('not writable')) {
    // Permission denied
  } else if (error.message.includes('locked')) {
    // File locked (Windows)
  } else if (error.code === 'ENOSPC') {
    // No space left
  }
}
```

### Bash Tool

```typescript
const result = await executeBash({ command: 'npm test', timeout: 60000 });

if (result.timedOut) {
  // Command timed out
} else if (result.exitCode !== 0) {
  // Command failed
  console.error(result.stderr);
} else {
  // Success
  console.log(result.stdout);
}
```

## Optimisations de performance

### Glob Tool
- Utilise `fast-glob` (5x plus rapide que `glob`)
- Ignore patterns configurables
- Depth limiting pour grandes arborescences

### Grep Tool
- Détection ripgrep automatique (100x plus rapide)
- Fallback Node.js si ripgrep absent
- Limite de résultats configurable (évite OOM)
- Skip fichiers binaires automatique

### Read/Write Tools
- Streaming pour gros fichiers (>10MB)
- Buffer size configurable
- Atomic writes (évite corruption)
- Cache de détection d'encodage

## Tests recommandés

### Tests multi-OS

```bash
# Windows
npm test -- --platform=win32

# macOS
npm test -- --platform=darwin

# Linux
npm test -- --platform=linux
```

### Tests d'encodage

```typescript
// UTF-8 sans BOM
testRead('utf8-no-bom.txt')

// UTF-8 avec BOM
testRead('utf8-bom.txt')

// UTF-16 LE (Windows)
testRead('utf16le.txt')

// Windows-1252 (legacy)
testRead('windows1252.txt')
```

### Tests de fins de ligne

```typescript
// CRLF (Windows)
testEdit('crlf.txt', preserveLineEndings: true)

// LF (Unix)
testEdit('lf.txt', preserveLineEndings: true)

// Mixed (doit détecter et warning)
testEdit('mixed.txt')
```

## Dépendances

### Production

- `@modelcontextprotocol/sdk` - SDK MCP officiel
- `zod` - Validation des schémas
- `fast-glob` - Pattern matching rapide
- `chardet` - Détection d'encodage
- `iconv-lite` - Conversion d'encodage
- `file-type` - Détection type fichier (magic bytes)
- `tree-kill` - Kill process tree cross-platform

### Optionnelles (runtime)

- `rg` (ripgrep) - Recherche ultra-rapide (recommandé)

### Installation ripgrep

```bash
# macOS
brew install ripgrep

# Windows
choco install ripgrep
# ou
scoop install ripgrep

# Linux (Ubuntu/Debian)
apt install ripgrep

# Linux (Fedora)
dnf install ripgrep
```

## Configuration recommandée

### Dans l'app Jarvis

```json
{
  "mcpServers": [
    {
      "id": "filesystem-shell",
      "name": "Filesystem & Shell",
      "command": "node",
      "args": [
        "./mcp-servers/built-in/filesystem-shell/dist/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  ]
}
```

### Environnement recommandé

```bash
# Linux/macOS
export PATH="$PATH:/usr/local/bin"
export SHELL="/bin/bash"

# Windows
set PATH=%PATH%;C:\Program Files\ripgrep
set COMSPEC=C:\Windows\System32\cmd.exe
```

## Limitations connues

### Windows

- Chmod/permissions non supportés (ACLs trop complexes)
- Symlinks nécessitent droits admin (sauf mode développeur)
- File locking plus agressif qu'Unix
- Case-insensitive filesystem (peut causer bugs)

### macOS

- Filesystem case-insensitive par défaut (configurable)
- Gatekeeper peut bloquer binaires téléchargés
- Sandbox App Store limite accès filesystem

### Linux

- Pas de limitation majeure
- Selinux peut bloquer certaines opérations
- Apparmor peut restreindre accès

## Sécurité

### Validation des chemins

- Pas d'accès hors working directory (sandboxing)
- Validation des symlinks (pas de path traversal)
- Échappement des arguments shell

### Commandes dangereuses bloquées

- `rm -rf /`
- Fork bombs
- `mkfs` (format filesystem)
- `dd if=/dev/` (direct disk write)

### Recommandations

- Toujours utiliser atomic writes
- Valider les chemins utilisateur
- Limiter timeout des commandes
- Logger les opérations sensibles
