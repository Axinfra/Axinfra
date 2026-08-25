import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';
import { ProjectService } from '@/services/ProjectService';
import { sendProjectAssignedEmail, sendWelcomeEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// POST /api/admin/project-requests/[id]/approve — the one place a Client account and a Project
// actually get created, now that both are gated behind admin approval (platform charges per
// project). Creates the User only if this email hasn't registered before; an already-approved
// Client requesting a second project reuses their existing account and just gets a "your new
// project is ready" email instead of a fresh password.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);
    const { id } = await params;

    const projectRequest = await prisma.projectRequest.findUnique({ where: { id } });
    if (!projectRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (projectRequest.status !== 'PENDING') {
      return NextResponse.json({ error: `This request has already been ${projectRequest.status.toLowerCase()}` }, { status: 409 });
    }

    let user = await prisma.user.findUnique({ where: { email: projectRequest.email } });
    let isNewUser = false;
    let generatedPassword: string | null = null;

    if (!user) {
      isNewUser = true;
      generatedPassword = randomBytes(9).toString('base64url'); // 12 chars, URL-safe
      const hashedPassword = await bcrypt.hash(generatedPassword, 12);
      user = await prisma.user.create({
        data: {
          name: projectRequest.name,
          email: projectRequest.email,
          hashedPassword,
          preferredRole: 'CLIENT',
        },
      });
    }

    const project = await ProjectService.createForOwner(user.id, {
      name: projectRequest.projectName,
      description: projectRequest.projectDetails ?? undefined,
    });

    await prisma.projectRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByEmail: auth.email,
        reviewedAt: new Date(),
        createdProjectId: project.id,
      },
    });

    await prisma.systemEvent.create({
      data: {
        eventType: 'PROJECT_REQUEST_APPROVED',
        severity: 'INFO',
        actorId: auth.userId,
        projectId: project.id,
        entityType: 'ProjectRequest',
        entityId: id,
        message: `${auth.email} approved project request from ${projectRequest.email} — "${project.name}"`,
      },
    }).catch((e) => console.error('[project-requests/approve] systemEvent create failed:', e));

    if (isNewUser && generatedPassword) {
      sendWelcomeEmail(user.email, user.name, generatedPassword).catch((e) =>
        console.error('[email] welcome email failed:', e)
      );
    } else {
      sendProjectAssignedEmail(user.email, user.name, project.name, 'CLIENT', project.id).catch((e) =>
        console.error('[email] project assigned email failed:', e)
      );
    }

    return NextResponse.json({ success: true, data: { userId: user.id, projectId: project.id, isNewUser } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/project-requests/approve]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
