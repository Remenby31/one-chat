/**
 * File encoding detection and conversion utilities
 *
 * Handles different encodings across platforms:
 * - UTF-8 (universal)
 * - UTF-16 LE (Windows default for some files)
 * - UTF-16 BE (macOS/Unix in some cases)
 * - Latin1, Windows-1252, etc.
 */

import { promises as fs } from 'node:fs';
import chardet from 'chardet';
import iconv from 'iconv-lite';

export type FileEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'ascii'
  | 'latin1'
  | 'windows-1252'
  | 'iso-8859-1'
  | string;

/**
 * Detect file encoding from buffer
 * Returns detected encoding or 'utf-8' as fallback
 */
export async function detectEncoding(filePath: string): Promise<FileEncoding> {
  try {
    const buffer = await fs.readFile(filePath);

    // chardet returns null if it can't detect
    const detected = chardet.detect(buffer);

    if (!detected) {
      return 'utf-8'; // Safe default
    }

    // Normalize encoding names
    const normalized = detected.toLowerCase();

    // Map common aliases
    if (normalized.includes('utf-8') || normalized.includes('utf8')) {
      return 'utf-8';
    }
    if (normalized.includes('utf-16le') || normalized.includes('utf16le')) {
      return 'utf-16le';
    }
    if (normalized.includes('utf-16be') || normalized.includes('utf16be')) {
      return 'utf-16be';
    }
    if (normalized.includes('ascii')) {
      return 'ascii';
    }
    if (normalized.includes('windows-1252') || normalized.includes('cp1252')) {
      return 'windows-1252';
    }
    if (normalized.includes('iso-8859-1') || normalized.includes('latin1')) {
      return 'iso-8859-1';
    }

    return detected;
  } catch (error) {
    console.error('[Encoding] Detection failed:', error);
    return 'utf-8';
  }
}

/**
 * Read file with automatic encoding detection
 * Returns decoded string content
 */
export async function readFileWithEncoding(
  filePath: string,
  encoding?: FileEncoding
): Promise<string> {
  const buffer = await fs.readFile(filePath);

  // Use provided encoding or detect it
  const detectedEncoding = encoding || await detectEncoding(filePath);

  // Handle UTF-8 natively (Node.js native support)
  if (detectedEncoding === 'utf-8' || detectedEncoding === 'ascii') {
    return buffer.toString('utf-8');
  }

  // Use iconv-lite for other encodings
  try {
    return iconv.decode(buffer, detectedEncoding);
  } catch (error) {
    console.error(`[Encoding] Failed to decode with ${detectedEncoding}, falling back to utf-8`);
    return buffer.toString('utf-8');
  }
}

/**
 * Write file with specified encoding
 * Preserves original encoding by default
 */
export async function writeFileWithEncoding(
  filePath: string,
  content: string,
  encoding: FileEncoding = 'utf-8'
): Promise<void> {
  // Handle UTF-8 natively
  if (encoding === 'utf-8' || encoding === 'ascii') {
    await fs.writeFile(filePath, content, 'utf-8');
    return;
  }

  // Use iconv-lite for other encodings
  const buffer = iconv.encode(content, encoding);
  await fs.writeFile(filePath, buffer);
}

/**
 * Check if file is likely binary (not text)
 * Samples first 8KB of file
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filePath);

    // Empty files are not binary
    if (buffer.length === 0) {
      return false;
    }

    // Sample first 8KB
    const sample = buffer.subarray(0, Math.min(8192, buffer.length));

    // Check for null bytes (strong indicator of binary)
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        return true;
      }
    }

    // Check for high ratio of non-printable characters
    let nonPrintable = 0;
    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];

      // Printable ASCII: 32-126, plus common whitespace: 9, 10, 13
      if (
        (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) ||
        byte === 127
      ) {
        nonPrintable++;
      }
    }

    // If more than 30% non-printable, consider binary
    return nonPrintable / sample.length > 0.3;
  } catch (error) {
    console.error('[Encoding] Binary check failed:', error);
    return false;
  }
}

/**
 * Get BOM (Byte Order Mark) if present
 * Returns encoding indicated by BOM or null
 */
export async function detectBOM(filePath: string): Promise<FileEncoding | null> {
  const buffer = await fs.readFile(filePath);

  if (buffer.length < 2) {
    return null;
  }

  // UTF-8 BOM: EF BB BF
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }

  // UTF-16 LE BOM: FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }

  // UTF-16 BE BOM: FE FF
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }

  return null;
}

/**
 * Preserve BOM if file originally had one
 */
export async function preserveBOM(filePath: string, content: string): Promise<Buffer> {
  const bom = await detectBOM(filePath);

  if (!bom) {
    return Buffer.from(content, 'utf-8');
  }

  // Add BOM to beginning of buffer
  let bomBytes: number[] = [];

  if (bom === 'utf-8') {
    bomBytes = [0xEF, 0xBB, 0xBF];
  } else if (bom === 'utf-16le') {
    bomBytes = [0xFF, 0xFE];
  } else if (bom === 'utf-16be') {
    bomBytes = [0xFE, 0xFF];
  }

  const contentBuffer = iconv.encode(content, bom);
  return Buffer.concat([Buffer.from(bomBytes), contentBuffer]);
}
