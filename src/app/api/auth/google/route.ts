import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'VIEWER'];

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 503 });
  }

  const role = new URL(request.url).searchParams.get('role') ?? '';
  // Encode role in state so callback can read it back
  const state = VALID_ROLES.includes(role) ? role : '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    ...(state ? { state } : {}),
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
