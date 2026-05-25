import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const projectRoles = await cached(
      `session:roles:${session.userId}`,
      300_000,
      () =>
        prisma.projectRole.findMany({
          where: { userId: session.userId },
          select: {
            projectId: true,
            role: true,
            project: { select: { id: true, name: true } },
          },
        })
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: session.userId,
            name: session.name,
            email: session.email,
          },
          projectRoles: projectRoles.map((pr) => ({
            projectId: pr.projectId,
            projectName: pr.project.name,
            role: pr.role,
          })),
        },
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
