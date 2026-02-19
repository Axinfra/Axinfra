/**
 * api-error-handler.ts — Centralized API error handling.
 *
 * PURPOSE: Consistent error responses across all API routes.
 * Catches known error types (Zod validation, auth, ownership)
 * and returns appropriate HTTP status codes + structured JSON.
 *
 * USAGE in route handlers:
 *   try { ... } catch (error) {
 *     return handleApiError(error, { route: 'GET /api/projects', userId, projectId });
 *   }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OwnershipError } from '@/lib/validate-ownership';
import { logger, LogContext } from '@/lib/logger';

export interface ApiErrorContext extends LogContext {
    route: string;
}

/**
 * Handle any error thrown in an API route and return an appropriate NextResponse.
 */
export function handleApiError(error: unknown, context: ApiErrorContext): NextResponse {
    // Auth errors
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        logger.warn('Unauthorized access attempt', context);
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // Forbidden (role guard)
    if (error instanceof Error && error.message === 'FORBIDDEN') {
        logger.warn('Forbidden access attempt', context);
        return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
        );
    }

    // Ownership / IDOR errors
    if (error instanceof OwnershipError) {
        logger.warn('Ownership validation failed', { ...context, detail: error.message });
        return NextResponse.json(
            { success: false, error: 'Resource not found' },
            { status: 404 }
        );
    }

    // Validation errors (Zod)
    if (error instanceof z.ZodError) {
        logger.info('Validation error', { ...context, issues: error.issues });
        return NextResponse.json(
            { success: false, error: 'Invalid input', details: error.issues },
            { status: 400 }
        );
    }

    // Unknown errors
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Unhandled API error', context, err);

    return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
    );
}
