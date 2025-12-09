/**
 * Console Logger Adapter
 *
 * Simple logger that outputs to console with structured formatting.
 */

import type { LoggerAdapter, LogEntry, LogLevel } from './types'

/**
 * Logger options
 */
export interface ConsoleLoggerOptions {
  /** Minimum log level to output */
  minLevel?: LogLevel

  /** Maximum entries to keep in memory */
  maxEntries?: number

  /** Whether to include timestamps in output */
  timestamps?: boolean

  /** Context prefix */
  context?: string
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/**
 * Console logger adapter
 */
export class ConsoleLoggerAdapter implements LoggerAdapter {
  private entries: LogEntry[] = []
  private readonly minLevel: number
  private readonly maxEntries: number
  private readonly timestamps: boolean
  private readonly context?: string

  constructor(options: ConsoleLoggerOptions = {}) {
    this.minLevel = LOG_LEVELS[options.minLevel ?? 'debug']
    this.maxEntries = options.maxEntries ?? 1000
    this.timestamps = options.timestamps ?? true
    this.context = options.context
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data)
  }

  child(context: string): LoggerAdapter {
    const fullContext = this.context ? `${this.context}:${context}` : context
    return new ConsoleLoggerAdapter({
      minLevel: Object.entries(LOG_LEVELS).find(([, v]) => v === this.minLevel)?.[0] as LogLevel,
      maxEntries: this.maxEntries,
      timestamps: this.timestamps,
      context: fullContext,
    })
  }

  getEntries(limit?: number): LogEntry[] {
    if (limit) {
      return this.entries.slice(-limit)
    }
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Check log level
    if (LOG_LEVELS[level] < this.minLevel) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: this.context,
      data,
    }

    // Store entry
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }

    // Format and output
    const prefix = this.formatPrefix(level, entry.timestamp)
    const fullMessage = this.context ? `[${this.context}] ${message}` : message

    switch (level) {
      case 'debug':
        if (data) {
          console.debug(prefix, fullMessage, data)
        } else {
          console.debug(prefix, fullMessage)
        }
        break
      case 'info':
        if (data) {
          console.info(prefix, fullMessage, data)
        } else {
          console.info(prefix, fullMessage)
        }
        break
      case 'warn':
        if (data) {
          console.warn(prefix, fullMessage, data)
        } else {
          console.warn(prefix, fullMessage)
        }
        break
      case 'error':
        if (data) {
          console.error(prefix, fullMessage, data)
        } else {
          console.error(prefix, fullMessage)
        }
        break
    }
  }

  private formatPrefix(level: LogLevel, timestamp: number): string {
    const levelStr = level.toUpperCase().padEnd(5)

    if (this.timestamps) {
      const date = new Date(timestamp)
      const timeStr = date.toISOString().slice(11, 23)
      return `[${timeStr}] ${levelStr}`
    }

    return levelStr
  }
}

/**
 * No-op logger adapter (discards all logs)
 *
 * Useful for testing when you don't want console output.
 */
export class NoopLoggerAdapter implements LoggerAdapter {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}

  child(): LoggerAdapter {
    return this
  }

  getEntries(): LogEntry[] {
    return []
  }

  clear(): void {}
}
