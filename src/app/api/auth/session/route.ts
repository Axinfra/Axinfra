import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get user's project roles
    const projectRoles = await prisma.projectRole.findMany({
      where: { userId: session.userId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
