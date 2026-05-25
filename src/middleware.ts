import { NextRequest, NextResponse } from 'next/server';

// API routes that never need a session
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/health',
];

// API routes that use their own secret-based auth
const SELF_AUTH_ROUTES = ['/api/cron/follow-ups'];

// Page routes accessible without a session
const PUBLIC_PAGE_ROUTES = [
  '/auth/login',
  '/auth/register',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session')?.value?.trim();

  // ── API routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API_ROUTES.some((r) => pathname === r)) return NextResponse.next();
    if (SELF_AUTH_ROUTES.some((r) => pathname.startsWith(r))) return NextResponse.next();

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  // ── Page routes ─────────────────────────────────────────────────────────
  if (PUBLIC_PAGE_ROUTES.some((r) => pathname.startsWith(r))) {
    // Already logged in — send away from login page
    if (sessionToken && pathname.startsWith('/auth/login')) {
      return NextResponse.redirect(new URL('/projects', request.url));
    }
    return NextResponse.next();
  }

  // Protect all other pages — no session → redirect to login
  if (!sessionToken) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
