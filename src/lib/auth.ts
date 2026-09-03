import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { prisma } from './db';
import { cached, invalidatePrefix } from './cache';
import { Role } from '@/types';

if (!process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Set JWT_SECRET in your .env file. The server cannot start without it.'
  );
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const SESSION_EXPIRY_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '24', 10);

// Single source of truth for the session cookie's maxAge — every route that sets the
// `session` cookie must use this instead of hardcoding a value, or the cookie can silently
// outlive/underlive the JWT itself when SESSION_EXPIRY_HOURS is changed from its default.
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_EXPIRY_HOURS * 60 * 60;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  exp?: number;
}

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
}

export interface ProjectAuthContext extends AuthContext {
  projectId: string;
  role: Role;
}

// Which role is "active" when a user holds several on the same project and hasn't picked one
// yet this session — earlier entries win. Kept in one place so getProjectAuth() and anything
// that needs a sane default (e.g. first-time switch-role UI state) agree.
const ROLE_PRIORITY: Role[] = [
  Role.CLIENT,
  Role.PMC,
  Role.SITE_ENGINEER,
  Role.CONSULTANT,
  Role.VENDOR,
  Role.VIEWER,
];

function pickActiveRole(heldRoles: Role[], requested: string | undefined): Role {
  if (requested && heldRoles.includes(requested as Role)) {
    return requested as Role;
  }
  for (const r of ROLE_PRIORITY) {
    if (heldRoles.includes(r)) return r;
  }
  return heldRoles[0];
}

/** Cookie holding the user's chosen active role for one project — read by getProjectAuth(),
 * written by POST /api/projects/[projectId]/switch-role. */
function activeRoleCookieName(projectId: string): string {
  return `activeRole_${projectId}`;
}

export async function createSession(user: { id: string; email: string; name: string }): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET);

  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthContext | null> {
  // Web uses the httpOnly `session` cookie. Native clients (mobile app) send
  // `Authorization: Bearer <token>` instead, since they can't rely on cookie
  // persistence the way a browser can — see MOBILE_APP_SETUP.md §3.1.
  const headerStore = await headers();
  const bearerToken = headerStore.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('session')?.value;

  const token = bearerToken || cookieToken;

  if (!token) {
    return null;
  }

  const payload = await verifySession(token);
  if (!payload) {
    return null;
  }

  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
  };
}

export async function getProjectAuth(projectId: string): Promise<ProjectAuthContext | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  // A user can hold several roles on the same project now (see ProjectRole's
  // @@unique([projectId, userId, role])) — which one is "active" depends on the
  // activeRole_<projectId> cookie, so it's part of the cache key rather than being resolved
  // after a role-agnostic cache read.
  const cookieStore = await cookies();
  const requestedRole = cookieStore.get(activeRoleCookieName(projectId))?.value;

  // Cache the project-existence + role-membership combo for 60s.
  // Hits Redis (Upstash) when configured; in-memory fallback otherwise.
  // Invalidated on role mutations via invalidateProjectAuth().
  const cacheKey = projectAuthCacheKey(projectId, session.userId, requestedRole);
  const cachedRole = await cached<{ role: Role } | null>(cacheKey, 60_000, async () => {
    // Reject access to soft-deleted projects at the auth boundary
    // so every child route (dashboard, boq, milestones, etc.) is protected.
    // Run both lookups in parallel — they're independent of each other.
    const [project, projectRoles] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true },
      }),
      prisma.projectRole.findMany({
        where: { projectId, userId: session.userId },
        select: { role: true },
      }),
    ]);

    if (!project || projectRoles.length === 0) {
      return null;
    }
    const heldRoles = projectRoles.map((r) => r.role as Role);
    return { role: pickActiveRole(heldRoles, requestedRole) };
  });

  if (!cachedRole) {
    return null;
  }

  return {
    ...session,
    projectId,
    role: cachedRole.role,
  };
}

/** Every role the current session user holds on a project — for the role-switcher UI and for
 * switch-role's own validation that the requested role is actually one of theirs. Deliberately
 * uncached (unlike getProjectAuth): it's only read on the roles/switcher UI paths, not on every
 * request, and always needs the fresh set right after a role is added/removed. */
export async function getMyProjectRoles(projectId: string): Promise<Role[]> {
  const session = await getSession();
  if (!session) return [];

  const rows = await prisma.projectRole.findMany({
    where: { projectId, userId: session.userId },
    select: { role: true },
  });
  return rows.map((r) => r.role as Role);
}

/** Cache-key generator for getProjectAuth. `requestedRole` is the raw activeRole_<projectId>
 * cookie value (undefined when unset) — folded into the key so switching roles is visible
 * without an explicit invalidation, since it's a different key entirely. */
export function projectAuthCacheKey(projectId: string, userId: string, requestedRole?: string): string {
  return `auth:project:${projectId}:user:${userId}:role:${requestedRole ?? '_default'}`;
}

/** Invalidate every cached auth entry for a (project, user) pair — all role variants, since
 * role-mutation routes don't know which activeRole_<projectId> cookie value(s) are cached. */
export async function invalidateProjectAuth(projectId: string, userId: string): Promise<void> {
  await invalidatePrefix(`auth:project:${projectId}:user:${userId}:`);
}

/** Invalidate every cached auth entry for a project (e.g. on project delete). */
export async function invalidateProjectAuthForProject(projectId: string): Promise<void> {
  await invalidatePrefix(`auth:project:${projectId}:user:`);
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

export async function requireProjectAuth(projectId: string): Promise<ProjectAuthContext> {
  const auth = await getProjectAuth(projectId);
  if (!auth) {
    throw new Error('UNAUTHORIZED');
  }
  return auth;
}
