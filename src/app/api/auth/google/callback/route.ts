import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { sendSignupWelcomeEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  error?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });
  return res.json();
}

async function fetchGoogleUser(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

function loginRedirect(request: NextRequest, isAdmin: boolean, preferredRole: string): string {
  const base = new URL(request.url).origin;
  if (isAdmin) return `${base}/admin/dashboard`;
  return preferredRole === 'VENDOR' ? `${base}/vendor` : `${base}/projects`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');
  const role  = searchParams.get('state') ?? '';

  if (error || !code) {
    return NextResponse.redirect(`${origin}/auth/login?error=google_denied`);
  }

  try {
    const tokens = await exchangeCode(code);
    if (tokens.error) {
      return NextResponse.redirect(`${origin}/auth/login?error=google_failed`);
    }

    const googleUser = await fetchGoogleUser(tokens.access_token);
    if (!googleUser.email_verified) {
      return NextResponse.redirect(`${origin}/auth/login?error=google_unverified`);
    }

    // Find existing user by googleId first, then fall back to email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.sub },
          { email: googleUser.email },
        ],
      },
    });

    const VALID_ROLES = ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'VIEWER'];
    const preferredRole = VALID_ROLES.includes(role) ? role : undefined;

    if (!user) {
      // No account — only allow creation if a role was passed (signup flow)
      if (!preferredRole) {
        return NextResponse.redirect(`${origin}/auth/register?error=no_account`);
      }
      user = await prisma.user.create({
        data: {
          name: googleUser.name,
          email: googleUser.email,
          googleId: googleUser.sub,
          avatarUrl: googleUser.picture ?? null,
          preferredRole,
        },
      });
      sendSignupWelcomeEmail(user.email, user.name).catch(e =>
        console.error('[email] google signup welcome failed:', e)
      );
    } else {
      // Existing user — link Google account and update role if a new one was provided
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.googleId ? {} : { googleId: googleUser.sub }),
          avatarUrl: user.avatarUrl ?? googleUser.picture ?? null,
          ...(preferredRole ? { preferredRole } : {}),
        },
      });

      // Block login if account still has no role
      if (!user.preferredRole) {
        return NextResponse.redirect(`${origin}/auth/login?error=no_role`);
      }
    }

    const token = await createSession(user);
    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'admin@axinfra.local')
      .split(',')
      .map((e) => e.trim().toLowerCase());
    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());

    const dest = loginRedirect(request, isAdmin, user.preferredRole ?? '');

    const response = NextResponse.redirect(dest);
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (err) {
    console.error('[google/callback]', err);
    return NextResponse.redirect(`${origin}/auth/login?error=server_error`);
  }
}
