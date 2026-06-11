import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// API routes that never need a session
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/google/callback',
  '/api/health',
  '/api/invite',       // invite GET (details) is public; POST requires session handled in route
  '/api/demo-request', // demo request form — no session needed
  '/api/contact',      // support form — no session needed
];

// API routes that use their own secret-based auth
const SELF_AUTH_ROUTES = ['/api/cron/follow-ups'];

// Page routes accessible without a session
const PUBLIC_PAGE_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/select-role',
  '/invite',           // invite acceptance page is public (shows sign-in prompt when needed)
];

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? 'admin@axinfra.local')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function getSessionEmail(token: string): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    const { payload } = await jwtVerify(token, secret);
    return (payload as { email?: string }).email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session')?.value?.trim();

  // ── API routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))) return NextResponse.next();
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
  const isPublicPage = PUBLIC_PAGE_ROUTES.some((r) =>
    r === '/' ? pathname === '/' : pathname.startsWith(r)
  );
  if (isPublicPage) {
    // Already logged in — send away from login page
    if (sessionToken && pathname.startsWith('/auth/login')) {
      const email = await getSessionEmail(sessionToken);
      const dest = email && getAdminEmails().includes(email) ? '/admin/dashboard' : '/projects';
      return NextResponse.redirect(new URL(dest, request.url));
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
