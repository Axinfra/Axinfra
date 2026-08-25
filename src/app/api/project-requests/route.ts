import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { publicFormRateLimiter } from '@/lib/rate-limiter';
import { sendProjectRequestAdminNotifyEmail, sendProjectRequestReceivedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email(),
  companyName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  projectName: z.string().min(1, 'Project name is required').max(200),
  projectDetails: z.string().max(2000).optional(),
});

// POST /api/project-requests — public, unauthenticated. The platform charges per project, so
// this replaces both self-registering as a Client and freely calling POST /api/projects: a
// prospective (or already-approved) Client asks for a project here, an admin reviews it in
// /admin/project-requests, and only on approval does the account/project actually get created
// (see /api/admin/project-requests/[id]/approve). If the caller happens to already be logged in
// (an existing Client asking for a second project), their session is trusted for identity —
// name/email in the body are ignored in that case so nobody can submit a request "as" someone
// else while logged in as themselves.
export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const rateCheck = await publicFormRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.', retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const session = await getSession();
    const { name, email, companyName, phone, projectName, projectDetails } = parsed.data;
    // Trust the session over the body for an already-logged-in requester.
    const requestName = session?.name ?? name;
    const requestEmail = session?.email ?? email;

    const created = await prisma.projectRequest.create({
      data: {
        name: requestName,
        email: requestEmail,
        companyName,
        phone,
        projectName,
        projectDetails,
        requestedByUserId: session?.userId,
      },
    });

    await prisma.systemEvent.create({
      data: {
        eventType: 'PROJECT_REQUEST',
        severity: 'INFO',
        actorId: session?.userId,
        entityType: 'ProjectRequest',
        entityId: created.id,
        message: `Project request from ${requestName} (${requestEmail}) — "${projectName}"`,
        metadata: JSON.stringify({ name: requestName, email: requestEmail, companyName, projectName }),
      },
    }).catch((e) => console.error('[project-requests] systemEvent create failed:', e));

    sendProjectRequestReceivedEmail(requestEmail, requestName, projectName).catch((e) =>
      console.error('[email] project request received failed:', e)
    );
    sendProjectRequestAdminNotifyEmail(requestName, requestEmail, projectName, companyName).catch((e) =>
      console.error('[email] project request admin notify failed:', e)
    );

    return NextResponse.json({ success: true, data: { id: created.id } });
  } catch (err) {
    console.error('[project-requests] failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to submit request. Please email dev@axinfra.in directly.' },
      { status: 500 },
    );
  }
}
