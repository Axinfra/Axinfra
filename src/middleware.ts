import { NextRequest, NextResponse } from 'next/server';

/**
 * Global authentication gate — defense-in-depth middleware.
 *
 * RULE: All /api/** routes require a valid session cookie, except
 * explicitly excluded routes (login, logout, health, cron with its own auth).
 *
 * Route-level requireAuth/requireProjectAuth remains as second barrier.
 */

// Routes that do NOT require authentication
const PUBLIC_ROUTES = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/health',
];

// Routes with their own auth mechanism (e.g., CRON_SECRET header)
const SELF_AUTH_ROUTES = [
    '/api/cron/follow-ups',
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only gate /api/** routes
    if (!pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    // Allow public routes
    if (PUBLIC_ROUTES.some(route => pathname === route)) {
        return NextResponse.next();
    }

    // Allow self-auth routes (they check CRON_SECRET themselves)
    if (SELF_AUTH_ROUTES.some(route => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Check for session cookie presence
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken || sessionToken.trim() === '') {
        return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
        );
    }

    // Token exists — proceed. Route-level handlers verify token validity.
    // This middleware acts as a fast-fail gate for missing tokens.
    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all API routes
        '/api/:path*',
    ],
};
