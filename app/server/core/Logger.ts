/**
 * Logger — Structured logging مع مستويات واضحة
 * يدعم: info, warn, error, debug
 * يُضيف: timestamp, context, errorCode
 */

import { ErrorCode, ErrorCodes } from './ErrorCodes';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  errorCode?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class LoggerService {
  private formatEntry(level: LogLevel, message: string, meta?: {
    context?: string;
    errorCode?: ErrorCode;
    data?: Record<string, unknown>;
  }): LogEntry {
    return {
      level,
      message,
      context: meta?.context,
      errorCode: meta?.errorCode ? ErrorCodes[meta.errorCode] : undefined,
      data: meta?.data,
      timestamp: new Date().toISOString(),
    };
  }

  private print(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const context = entry.context ? ` [${entry.context}]` : '';
    const code = entry.errorCode ? ` | ${entry.errorCode}` : '';
    const data = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
    const line = `${prefix}${context} ${entry.message}${code}${data}`;

    if (entry.level === 'error') {
      console.error(line);
    } else if (entry.level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  info(message: string, meta?: { context?: string; data?: Record<string, unknown> }): void {
    this.print(this.formatEntry('info', message, meta));
  }

  warn(message: string, meta?: { context?: string; errorCode?: ErrorCode; data?: Record<string, unknown> }): void {
    this.print(this.formatEntry('warn', message, meta));
  }

  error(message: string, meta?: { context?: string; errorCode?: ErrorCode; data?: Record<string, unknown>; error?: unknown }): void {
    const entry = this.formatEntry('error', message, meta);
    if (meta?.error instanceof Error) {
      entry.data = { ...entry.data, stack: meta.error.stack, errorMessage: meta.error.message };
    }
    this.print(entry);
  }

  debug(message: string, meta?: { context?: string; data?: Record<string, unknown> }): void {
    if (process.env.NODE_ENV === 'development') {
      this.print(this.formatEntry('debug', message, meta));
    }
  }
}

export const Logger = new LoggerService();
