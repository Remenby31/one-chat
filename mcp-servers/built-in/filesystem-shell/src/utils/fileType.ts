/**
 * File type detection utilities
 *
 * Detects file types based on:
 * - Magic bytes (file signature)
 * - File extension
 * - MIME type
 */

import { promises as fs } from 'node:fs';
import { fileTypeFromBuffer } from 'file-type';
import { extname } from './path.js';

export interface FileTypeInfo {
  type: 'text' | 'binary' | 'image' | 'video' | 'audio' | 'archive' | 'executable' | 'unknown';
  mimeType?: string;
  extension?: string;
}

/**
 * Detect file type from path
 * Uses magic bytes first, falls back to extension
 */
export async function detectFileType(filePath: string): Promise<FileTypeInfo> {
  try {
    // Read first 4KB for magic bytes detection
    const buffer = await fs.readFile(filePath);
    const sample = buffer.subarray(0, Math.min(4096, buffer.length));

    // Try magic bytes detection first
    const fileType = await fileTypeFromBuffer(sample);

    if (fileType) {
      return {
        type: categorizeFileType(fileType.mime),
        mimeType: fileType.mime,
        extension: fileType.ext,
      };
    }

    // Fallback to extension-based detection
    const ext = extname(filePath).toLowerCase().slice(1); // Remove leading dot
    return detectFromExtension(ext);
  } catch (error) {
    console.error('[FileType] Detection failed:', error);
    return { type: 'unknown' };
  }
}

/**
 * Categorize MIME type into broad category
 */
function categorizeFileType(mimeType: string): FileTypeInfo['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';

  // Archives
  if (
    mimeType.includes('zip') ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z')
  ) {
    return 'archive';
  }

  // Executables
  if (
    mimeType.includes('executable') ||
    mimeType.includes('application/x-') ||
    mimeType.includes('application/vnd.microsoft')
  ) {
    return 'executable';
  }

  // Application files
  if (mimeType.startsWith('application/')) {
    return 'binary';
  }

  return 'unknown';
}

/**
 * Detect file type from extension
 * Fallback when magic bytes detection fails
 */
function detectFromExtension(ext: string): FileTypeInfo {
  // Text files
  const textExtensions = [
    'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'toml',
    'csv', 'tsv', 'log', 'conf', 'config', 'ini', 'cfg',
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go',
    'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rs', 'swift',
    'kt', 'scala', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
    'sql', 'graphql', 'proto', 'r', 'lua', 'vim', 'el', 'clj',
  ];

  if (textExtensions.includes(ext)) {
    return {
      type: 'text',
      mimeType: getMimeTypeForExtension(ext),
      extension: ext,
    };
  }

  // Images
  const imageExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico',
    'tiff', 'tif', 'psd', 'ai', 'eps', 'raw', 'cr2', 'nef',
  ];

  if (imageExtensions.includes(ext)) {
    return {
      type: 'image',
      mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      extension: ext,
    };
  }

  // Videos
  const videoExtensions = [
    'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg',
  ];

  if (videoExtensions.includes(ext)) {
    return {
      type: 'video',
      mimeType: `video/${ext}`,
      extension: ext,
    };
  }

  // Audio
  const audioExtensions = [
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus',
  ];

  if (audioExtensions.includes(ext)) {
    return {
      type: 'audio',
      mimeType: `audio/${ext}`,
      extension: ext,
    };
  }

  // Archives
  const archiveExtensions = [
    'zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'iso',
  ];

  if (archiveExtensions.includes(ext)) {
    return {
      type: 'archive',
      mimeType: `application/${ext}`,
      extension: ext,
    };
  }

  // Executables
  const executableExtensions = [
    'exe', 'dll', 'so', 'dylib', 'app', 'dmg', 'deb', 'rpm',
  ];

  if (executableExtensions.includes(ext)) {
    return {
      type: 'executable',
      mimeType: 'application/octet-stream',
      extension: ext,
    };
  }

  return { type: 'unknown', extension: ext };
}

/**
 * Get MIME type for common text file extensions
 */
function getMimeTypeForExtension(ext: string): string {
  const mimeMap: Record<string, string> = {
    'txt': 'text/plain',
    'md': 'text/markdown',
    'markdown': 'text/markdown',
    'json': 'application/json',
    'xml': 'application/xml',
    'yaml': 'application/yaml',
    'yml': 'application/yaml',
    'toml': 'application/toml',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'mjs': 'text/javascript',
    'ts': 'text/typescript',
    'jsx': 'text/javascript',
    'tsx': 'text/typescript',
    'py': 'text/x-python',
    'rb': 'text/x-ruby',
    'java': 'text/x-java',
    'c': 'text/x-c',
    'cpp': 'text/x-c++',
    'sh': 'text/x-shellscript',
    'bash': 'text/x-shellscript',
  };

  return mimeMap[ext] || 'text/plain';
}

/**
 * Check if file is a text file (safe to read as string)
 */
export async function isTextFile(filePath: string): Promise<boolean> {
  const fileType = await detectFileType(filePath);
  return fileType.type === 'text';
}

/**
 * Check if file is an image
 */
export async function isImageFile(filePath: string): Promise<boolean> {
  const fileType = await detectFileType(filePath);
  return fileType.type === 'image';
}

/**
 * Get file type category without full detection
 * Quick check based on extension only
 */
export function getFileCategory(filePath: string): FileTypeInfo['type'] {
  const ext = extname(filePath).toLowerCase().slice(1);
  return detectFromExtension(ext).type;
}
