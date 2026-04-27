import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { Role } from '@/types';

if (!process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Set JWT_SECRET in your .env file. The server cannot start without it.'
  );
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const SESSION_EXPIRY_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '24', 10);

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
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

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

  // Reject access to soft-deleted projects at the auth boundary
  // so every child route (dashboard, boq, milestones, etc.) is protected.
  // Run both lookups in parallel — they're independent of each other.
  const [project, projectRole] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    }),
    prisma.projectRole.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: session.userId,
        },
      },
    }),
  ]);

  if (!project || !projectRole) {
    return null;
  }

  return {
    ...session,
    projectId,
    role: projectRole.role as Role,
  };
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
