/**
 * logger.ts — Structured logging helper.
 *
 * Outputs JSON-structured log entries for production observability.
 * In development, logs are human-readable. In production, they're
 * JSON for ingestion by log aggregators (ELK, Datadog, etc.).
 *
 * Fields: level, route, userId, projectId, message, stack, requestId, timestamp
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
    route?: string;
    userId?: string;
    projectId?: string;
    requestId?: string;
    [key: string]: unknown;
}

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    route?: string;
    userId?: string;
    projectId?: string;
    requestId?: string;
    stack?: string;
    [key: string]: unknown;
}

class Logger {
    private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            ...context,
        };

        if (error?.stack) {
            entry.stack = error.stack;
        }

        return entry;
    }

    info(message: string, context?: LogContext): void {
        const entry = this.formatEntry('info', message, context);
        // console.log(JSON.stringify(entry));
    }

    warn(message: string, context?: LogContext): void {
        const entry = this.formatEntry('warn', message, context);
        console.warn(JSON.stringify(entry));
    }

    error(message: string, context?: LogContext, error?: Error): void {
        const entry = this.formatEntry('error', message, context, error);
        console.error(JSON.stringify(entry));
    }

    debug(message: string, context?: LogContext): void {
        if (process.env.NODE_ENV === 'development') {
            const entry = this.formatEntry('debug', message, context);
            console.debug(JSON.stringify(entry));
        }
    }
}

export const logger = new Logger();
