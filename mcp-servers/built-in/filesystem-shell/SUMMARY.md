# Résumé Technique - Architecture Cross-Platform Filesystem-Shell

## Vue d'ensemble de l'architecture

J'ai conçu une architecture complète et robuste pour un serveur MCP filesystem-shell qui gère TOUS les aspects cross-platform entre Windows, macOS et Linux.

## Points clés de l'architecture

### 1. Gestion des chemins (src/utils/path.ts)

**Problématiques résolues:**
- Séparateurs différents: `\` (Windows) vs `/` (Unix)
- Normalisation interne en forward slash `/` pour cohérence
- Conversion vers format natif quand nécessaire
- Résolution du home directory (`~`) cross-platform
- Support des chemins relatifs et absolus

**Techniques utilisées:**
- `path.resolve()` pour résolution absolue
- `path.normalize()` pour format natif
- Détection plateforme via `process.platform`
- Variable d'environnement `HOME` (Unix) vs `USERPROFILE` (Windows)

### 2. Gestion des encodages (src/utils/encoding.ts)

**Problématiques résolues:**
- UTF-8 (universel) vs UTF-16 LE (Windows) vs UTF-16 BE (rare)
- Détection automatique d'encodage via BOM + heuristique
- Conversion entre encodages avec `iconv-lite`
- Détection fichiers binaires (null bytes + ratio non-printable)
- Préservation du BOM si présent

**Techniques utilisées:**
- `chardet` pour détection heuristique (~40 encodages)
- BOM detection: `EF BB BF` (UTF-8), `FF FE` (UTF-16 LE), `FE FF` (UTF-16 BE)
- Sampling premiers 8KB pour performance
- Threshold 30% caractères non-printables = binaire

### 3. Gestion des fins de ligne (src/utils/lineEndings.ts)

**Problématiques résolues:**
- CRLF `\r\n` (Windows) vs LF `\n` (Unix) vs CR `\r` (old Mac)
- Détection du style existant via regex
- Conversion entre styles
- Préservation lors de modifications

**Techniques utilisées:**
- Regex lookahead/lookbehind: `/(?<!\r)\n/` (LF seul), `/\r(?!\n)/` (CR seul)
- Détection dominant (>90%) vs mixed
- Normalisation en LF pour traitement interne
- Conversion vers style plateforme ou préservation

### 4. Gestion des permissions (src/utils/permissions.ts)

**Problématiques résolues:**
- Unix: chmod (rwx) vs Windows: ACLs (trop complexes)
- Exécutable: chmod +x (Unix) vs extension .exe (Windows)
- Liens symboliques: ln -s (Unix) vs mklink avec admin (Windows)
- File locking: advisory (Unix) vs mandatory (Windows)

**Techniques utilisées:**
- `fs.access()` avec constants `R_OK`, `W_OK`, `X_OK`
- `fs.chmod()` Unix-only (no-op sur Windows)
- `fs.lstat()` pour détection symlinks
- `fs.realpath()` pour résolution symlinks
- Tentative d'ouverture exclusive pour détection lock Windows

### 5. Gestion des processus (src/utils/process.ts)

**Problématiques résolues:**
- Shell différent: cmd.exe/PowerShell (Windows) vs bash/zsh (Unix)
- Arguments shell différents: `/c` (cmd) vs `-c` (bash)
- Variables d'environnement: `%VAR%` (Windows) vs `$VAR` (Unix)
- PATH separator: `;` (Windows) vs `:` (Unix)
- Kill process tree cross-platform

**Techniques utilisées:**
- Détection shell via `process.env.COMSPEC` (Windows) ou `process.env.SHELL` (Unix)
- `spawn()` avec shell automatique
- `tree-kill` pour kill récursif des enfants
- Normalisation PATH (merge variants case-insensitive sur Windows)
- Échappement arguments: `"arg"` (Windows) vs `'arg'` (Unix)

### 6. Détection de type de fichier (src/utils/fileType.ts)

**Problématiques résolues:**
- Magic bytes (signatures binaires) vs extensions
- MIME type detection
- Catégorisation (text/binary/image/video/audio/archive/executable)

**Techniques utilisées:**
- `file-type` pour magic bytes detection (premiers 4KB)
- Fallback extension-based si magic bytes échouent
- Mapping extensions → MIME types
- Support 100+ types de fichiers

## Outils implémentés

### 1. Read Tool (src/tools/read.ts)

**Caractéristiques cross-platform:**
- Auto-détection encodage (BOM → chardet → UTF-8 fallback)
- Détection binaire automatique
- Images retournées en base64
- Résolution symlinks
- Vérification permissions avant lecture

**Cas d'usage:**
- Fichiers texte UTF-8 (Unix)
- Fichiers UTF-16 LE avec BOM (Windows)
- Images PNG/JPEG (base64)
- Fichiers CSV Windows-1252 (legacy)

### 2. Write Tool (src/tools/write.ts)

**Caractéristiques cross-platform:**
- Création récursive répertoires (`mkdir -p` équivalent)
- Fins de ligne automatiques: CRLF (Windows) ou LF (Unix)
- Préservation encodage original
- Écriture atomique (temp + rename)
- Préservation permissions Unix
- Détection lock Windows

**Cas d'usage:**
- Création fichiers config JSON
- Mise à jour code source (préservation line endings)
- Écriture données critiques (atomic)

### 3. Edit Tool (src/tools/edit.ts)

**Caractéristiques cross-platform:**
- Find/replace literal ou regex
- Préservation encodage + line endings + BOM
- Mode multiline (patterns cross-line)
- Dry-run (preview)
- Écriture atomique

**Cas d'usage:**
- Bump version dans package.json
- Refactoring import paths
- Remplacement TODO → DONE
- Migration code

### 4. Bash Tool (src/tools/bash.ts)

**Caractéristiques cross-platform:**
- Détection shell automatique (cmd/PS/bash/zsh)
- Arguments adaptés au shell
- Timeout avec kill process tree
- Capture stdout/stderr
- Variables d'environnement
- Validation sécurité (patterns dangereux)

**Cas d'usage:**
- npm install/test/build
- git operations
- Scripts multi-plateforme
- CI/CD pipelines

### 5. Glob Tool (src/tools/glob.ts)

**Caractéristiques cross-platform:**
- Pattern matching rapide (`fast-glob`)
- Case-sensitivity selon OS (Linux: oui, Windows/macOS: non)
- Ignore patterns (.gitignore style)
- Hidden files support
- Symlinks following
- Depth limiting

**Cas d'usage:**
- Trouver tous les *.ts
- Lister répertoires
- Chercher fichiers cachés (.env)
- Multiple patterns avec exclusions

### 6. Grep Tool (src/tools/grep.ts)

**Caractéristiques cross-platform:**
- Ripgrep si disponible (100x faster) + fallback Node.js
- Regex multiline
- Context lines
- File type filtering
- Performance optimisée

**Cas d'usage:**
- Chercher TODO/FIXME
- Trouver fonctions (regex)
- Chercher dans logs
- Code analysis

## Technologies et dépendances

### Production
- `@modelcontextprotocol/sdk` - SDK MCP officiel
- `zod` - Validation schemas TypeScript
- `fast-glob` - Pattern matching performant (5x faster que `glob`)
- `chardet` - Détection encodage heuristique
- `iconv-lite` - Conversion encodages
- `file-type` - Détection type via magic bytes
- `tree-kill` - Kill process tree cross-platform

### Optionnelles (runtime)
- `ripgrep` (`rg`) - Recherche ultra-rapide (recommandé, 100x faster)

## Patterns d'architecture avancés

### 1. Détection automatique vs Configuration explicite

L'architecture utilise le pattern "détection automatique avec override":

```typescript
// Auto-detect encoding
const encoding = input.encoding || await detectEncoding(filePath);

// Auto-detect line endings
const lineEnding = input.preserveLineEndings
  ? detectLineEnding(originalContent)
  : DEFAULT_LINE_ENDING;
```

**Avantages:**
- UX simple par défaut (zéro config)
- Flexibilité pour cas avancés
- Fail gracefully avec fallbacks

### 2. Écriture atomique

Pattern "temp file + rename" pour éviter corruption:

```typescript
const tempPath = `${filePath}.tmp.${Date.now()}`;
await writeFileWithEncoding(tempPath, content, encoding);
await fs.rename(tempPath, filePath);  // Atomic on Unix, near-atomic on Windows
```

**Avantages:**
- Évite corruption si crash pendant write
- POSIX atomic sur Unix
- Quasi-atomic sur Windows (peut échouer si fichier ouvert)

### 3. Normalisation interne, conversion externe

Pattern "normalize → process → convert":

```typescript
// Input: normalize
const normalizedPath = normalizePath(input.path);  // Always forward slash

// Process: internal logic uses normalized format
const content = await readFile(normalizedPath);

// Output: convert to native if needed
const nativePath = toNativePath(normalizedPath);
```

**Avantages:**
- Logique interne simple (un seul format)
- Compatibilité externe préservée
- Évite bugs de conversion multiples

### 4. Fallback cascade

Pattern "try best → fallback → failsafe":

```typescript
// Try ripgrep first
if (input.useRipgrep && await isRipgrepAvailable()) {
  try {
    return await grepWithRipgrep(input);
  } catch {
    // Fall through to Node.js
  }
}

// Fallback: Node.js implementation
return await grepWithNodeJS(input);
```

**Avantages:**
- Performance optimale si possible
- Robustesse (toujours une solution)
- Transparent pour l'utilisateur

### 5. Lazy detection avec cache

Pattern "detect once, cache result":

```typescript
let ripgrepAvailable: boolean | null = null;

async function isRipgrepAvailable(): Promise<boolean> {
  if (ripgrepAvailable !== null) {
    return ripgrepAvailable;  // Cache hit
  }

  ripgrepAvailable = await commandExists('rg');  // Detect once
  return ripgrepAvailable;
}
```

**Avantages:**
- Performance (pas de détection répétée)
- Synchronisation simple (variable module)

## Sécurité

### 1. Validation des chemins
- Check symlinks (pas de path traversal)
- Validation répertoire parent
- Interdiction chemins absolus dangereux (/etc, C:\Windows\System32)

### 2. Validation commandes shell
- Liste noire patterns dangereux:
  - `rm -rf /`
  - Fork bombs `:(){ :|:& };:`
  - `mkfs` (format filesystem)
  - `dd if=/dev/` (direct disk write)
- Échappement arguments

### 3. Permissions
- Check readable avant read
- Check writable avant write
- No-op chmod sur Windows (évite erreurs)

### 4. Timeouts
- Timeout par défaut 2 minutes (bash)
- Kill process tree si timeout
- Limite buffer stdout/stderr (10MB)

## Performance

### Optimisations implémentées

1. **Glob**: `fast-glob` (~5x faster que `glob`)
2. **Grep**: ripgrep (~100x faster que Node.js grep)
3. **Encoding detection**: Sample 8KB seulement (pas tout le fichier)
4. **Binary detection**: Early exit si null byte trouvé
5. **Line ending detection**: Regex optimisée avec lookahead/lookbehind
6. **Cache**: Détection ripgrep en cache

### Benchmarks attendus

| Opération | Performance |
|-----------|-------------|
| Read 1MB text file | ~10ms |
| Write 1MB text file | ~15ms (atomic) |
| Edit 1MB file | ~25ms |
| Glob 10k files | ~200ms |
| Grep 10k files (ripgrep) | ~2s |
| Grep 10k files (Node.js) | ~20s |
| Bash npm install | Variable (dépend npm) |

## Limitations connues et solutions

### Windows
**Limitation**: Pas de chmod/permissions
**Solution**: No-op silencieux, pas d'erreur

**Limitation**: Symlinks nécessitent admin
**Solution**: Detection + erreur claire

**Limitation**: File locking agressif
**Solution**: Detection via tentative open exclusive

### macOS
**Limitation**: Filesystem case-insensitive par défaut
**Solution**: Force case-sensitive si demandé

### Linux
**Limitation**: Aucune majeure
**Solution**: N/A

## Extension future recommandée

### 1. Watch tool
Monitor changements fichiers avec `chokidar`:
```typescript
{
  "name": "watch",
  "arguments": {
    "patterns": "**/*.ts",
    "events": ["add", "change", "unlink"]
  }
}
```

### 2. Copy/Move tools
Copie/déplacement avec préservation attributs:
```typescript
{
  "name": "copy",
  "arguments": {
    "from": "./src",
    "to": "./backup",
    "preservePermissions": true
  }
}
```

### 3. Archive tools
Compression/décompression:
```typescript
{
  "name": "archive",
  "arguments": {
    "source": "./dist",
    "output": "./dist.tar.gz",
    "format": "tar.gz"
  }
}
```

### 4. Diff tool
Comparaison de fichiers:
```typescript
{
  "name": "diff",
  "arguments": {
    "file1": "./v1.txt",
    "file2": "./v2.txt",
    "format": "unified"
  }
}
```

## Conclusion

Cette architecture fournit une base solide et robuste pour des opérations filesystem et shell cross-platform. Les points clés:

1. **Abstraction complète** des différences OS
2. **Détection automatique** avec override manuel
3. **Fallbacks robustes** pour garantir fonctionnement
4. **Performance optimisée** avec outils natifs (ripgrep)
5. **Sécurité** via validation et sandboxing
6. **Maintenabilité** via séparation concerns (utils/ vs tools/)

Le code est prêt pour production et peut être étendu facilement avec de nouveaux outils suivant les mêmes patterns.
