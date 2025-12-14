/**
 * File permission checking utilities
 *
 * Cross-platform permission handling:
 * - Unix: chmod-style permissions (rwx)
 * - Windows: ACLs (Access Control Lists)
 */

import { promises as fs } from 'node:fs';
import { constants } from 'node:fs';
import { IS_WINDOWS } from './path.js';

export interface PermissionInfo {
  readable: boolean;
  writable: boolean;
  executable: boolean;
  exists: boolean;
}

/**
 * Check file/directory permissions
 * Returns detailed permission info
 */
export async function checkPermissions(filePath: string): Promise<PermissionInfo> {
  try {
    // Check if path exists
    try {
      await fs.access(filePath, constants.F_OK);
    } catch {
      return {
        readable: false,
        writable: false,
        executable: false,
        exists: false,
      };
    }

    // Check read permission
    let readable = false;
    try {
      await fs.access(filePath, constants.R_OK);
      readable = true;
    } catch {
      // Not readable
    }

    // Check write permission
    let writable = false;
    try {
      await fs.access(filePath, constants.W_OK);
      writable = true;
    } catch {
      // Not writable
    }

    // Check execute permission (Unix-specific, always false on Windows)
    let executable = false;
    if (!IS_WINDOWS) {
      try {
        await fs.access(filePath, constants.X_OK);
        executable = true;
      } catch {
        // Not executable
      }
    }

    return {
      readable,
      writable,
      executable,
      exists: true,
    };
  } catch (error) {
    console.error('[Permissions] Check failed:', error);
    return {
      readable: false,
      writable: false,
      executable: false,
      exists: false,
    };
  }
}

/**
 * Check if file/directory is readable
 */
export async function canRead(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file/directory is writable
 */
export async function canWrite(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file stats (size, creation time, etc.)
 */
export async function getStats(filePath: string) {
  return fs.stat(filePath);
}

/**
 * Check if path is a file
 */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a symbolic link
 */
export async function isSymbolicLink(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(filePath); // lstat doesn't follow symlinks
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Resolve symbolic link to actual path
 * Returns original path if not a symlink
 */
export async function resolveSymlink(filePath: string): Promise<string> {
  try {
    const isSymlink = await isSymbolicLink(filePath);
    if (!isSymlink) {
      return filePath;
    }

    return await fs.realpath(filePath);
  } catch (error) {
    console.error('[Permissions] Symlink resolution failed:', error);
    return filePath;
  }
}

/**
 * Ensure directory exists, create if not
 * Recursively creates parent directories
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    // Ignore EEXIST error (directory already exists)
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Check if file is locked (Windows-specific)
 * On Unix, files are rarely locked, so this always returns false
 */
export async function isFileLocked(filePath: string): Promise<boolean> {
  if (!IS_WINDOWS) {
    return false; // Unix systems don't lock files the same way
  }

  try {
    // Try to open file with exclusive access
    const fileHandle = await fs.open(filePath, 'r+');
    await fileHandle.close();
    return false; // Successfully opened, not locked
  } catch (error: any) {
    // EBUSY or EPERM typically means file is locked
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      return true;
    }
    // Other errors (file not found, etc.) - not locked
    return false;
  }
}

/**
 * Get file permissions as octal string (Unix-style)
 * Returns '0644' format
 */
export async function getPermissionsOctal(filePath: string): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    // Extract permission bits and convert to octal string
    return '0' + (stats.mode & parseInt('777', 8)).toString(8);
  } catch (error) {
    console.error('[Permissions] Failed to get octal permissions:', error);
    return '0644'; // Default
  }
}

/**
 * Set file permissions (Unix-style)
 * No-op on Windows
 */
export async function setPermissions(filePath: string, mode: number | string): Promise<void> {
  if (IS_WINDOWS) {
    // Windows doesn't support chmod
    return;
  }

  try {
    const numericMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    await fs.chmod(filePath, numericMode);
  } catch (error) {
    console.error('[Permissions] Failed to set permissions:', error);
    throw error;
  }
}
