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
  '/api/demo-request',     // demo request form — no session needed
  '/api/contact',          // support form — no session needed
  '/api/project-requests', // "request a new project" form — no session needed (optionally
                            // attaches one if present; enforced inside the route, not here)
];

// API routes that use their own secret-based auth
const SELF_AUTH_ROUTES = ['/api/cron/follow-ups'];

// Page routes accessible without a session
const PUBLIC_PAGE_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/invite',           // invite acceptance page is public (shows sign-in prompt when needed)
  '/request-project',  // "request a new project" form is public — see /api/project-requests
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

// Dev-only CORS for testing the mobile app via `expo start --web` in a
// browser. Native iOS/Android builds aren't subject to CORS at all (no
// browser involved), so this never matters for them — it only exists so the
// web-preview target of the Expo app can call this API cross-origin during
// local development. Never enabled in production.
const DEV_CORS_ORIGINS = ['http://localhost:8081', 'http://localhost:19006'];

function applyDevCors(response: NextResponse, request: NextRequest): NextResponse {
  if (process.env.NODE_ENV === 'production') return response;
  const origin = request.headers.get('origin');
  if (!origin || !DEV_CORS_ORIGINS.includes(origin)) return response;

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieToken = request.cookies.get('session')?.value?.trim();
  const bearerToken = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  const sessionToken = cookieToken || bearerToken;

  // ── API routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Preflight — answer directly, never reaches a route handler either way.
    if (request.method === 'OPTIONS') {
      return applyDevCors(new NextResponse(null, { status: 204 }), request);
    }

    if (PUBLIC_API_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/')))
      return applyDevCors(NextResponse.next(), request);
    if (SELF_AUTH_ROUTES.some((r) => pathname.startsWith(r)))
      return applyDevCors(NextResponse.next(), request);

    if (!sessionToken) {
      return applyDevCors(
        NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 }),
        request,
      );
    }
    return applyDevCors(NextResponse.next(), request);
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
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};
