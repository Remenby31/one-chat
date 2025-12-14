/**
 * Cross-platform path normalization utilities
 *
 * Handles differences between Windows (backslash) and Unix (forward slash) paths
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_WINDOWS = process.platform === 'win32';
export const IS_MACOS = process.platform === 'darwin';
export const IS_LINUX = process.platform === 'linux';

/**
 * Normalize path to use forward slashes (for internal processing)
 * Works with both absolute and relative paths
 */
export function normalizePath(inputPath: string): string {
  // Convert Windows backslashes to forward slashes
  let normalized = inputPath.replace(/\\/g, '/');

  // Resolve to absolute path using Node's path module
  normalized = path.resolve(normalized);

  // Convert back to forward slashes for consistency
  return normalized.replace(/\\/g, '/');
}

/**
 * Convert path to OS-native format
 * - Windows: C:\Users\name\file.txt
 * - Unix: /home/name/file.txt
 */
export function toNativePath(inputPath: string): string {
  return path.normalize(inputPath);
}

/**
 * Check if path is absolute
 * Works cross-platform (handles both / and C:\ styles)
 */
export function isAbsolute(inputPath: string): boolean {
  return path.isAbsolute(inputPath);
}

/**
 * Join path segments cross-platform
 */
export function joinPaths(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Get relative path from 'from' to 'to'
 */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Get directory name from path
 */
export function dirname(inputPath: string): string {
  return path.dirname(inputPath);
}

/**
 * Get base name (file name) from path
 */
export function basename(inputPath: string, ext?: string): string {
  return path.basename(inputPath, ext);
}

/**
 * Get file extension from path
 */
export function extname(inputPath: string): string {
  return path.extname(inputPath);
}

/**
 * Convert file:// URL to path
 */
export function urlToPath(url: string): string {
  return fileURLToPath(url);
}

/**
 * Resolve home directory (~) in paths
 * Works cross-platform
 */
export function resolveHome(inputPath: string): string {
  if (!inputPath.startsWith('~')) {
    return inputPath;
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new Error('Could not resolve home directory');
  }

  return inputPath.replace(/^~/, homeDir);
}

/**
 * Check if path is within allowed directory (security check)
 */
export function isPathWithinDirectory(filePath: string, allowedDir: string): boolean {
  const normalizedFile = path.resolve(filePath);
  const normalizedDir = path.resolve(allowedDir);

  return normalizedFile.startsWith(normalizedDir);
}

/**
 * Get path separator for current platform
 */
export const PATH_SEPARATOR = path.sep;

/**
 * Get delimiter for PATH environment variable
 */
export const PATH_DELIMITER = path.delimiter;
