import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AIWorkOrderDraftService } from '@/services/AIWorkOrderDraftService';
import { isAiEnabled } from '@/lib/ai/claude';
import { aiGenerationRateLimiter } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

interface RequestBody {
  briefDescription?: string;
}

// POST /api/projects/[projectId]/orders/[orderId]/work-order/ai-draft
// Drafts the narrative Work Order fields (work description, scope, terms & conditions, etc.)
// from live project/vendor/BOQ context via Claude, for GenerateWorkOrderPdfModal's "Generate
// with AI" button. PMC-only, same as the PDF generation route this feeds into. Returns 501
// when ANTHROPIC_API_KEY isn't configured so the client can hide the button instead of erroring.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> },
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    if (!isAiEnabled()) {
      return NextResponse.json({ success: false, error: 'AI drafting is not configured' }, { status: 501 });
    }

    // Every request here is a real, billed Claude API call shared across every client on this
    // Anthropic account — cap per-user usage so one tenant can't exhaust the shared quota/budget.
    const rateCheck = await aiGenerationRateLimiter.check(auth.userId);
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many AI drafting requests. Please try again later.', retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const [order, project, boqItems] = await Promise.all([
      prisma.phase.findFirst({
        where: { id: orderId, projectId, parentPhaseId: null, scheduleImportId: null },
        include: { vendorUser: { select: { name: true } } },
      }),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.bOQItem.findMany({
        where: { boq: { orderId } },
        select: { description: true, unit: true, plannedQty: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found in this project' }, { status: 404 });
    }
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const draft = await AIWorkOrderDraftService.draftWorkOrderDetails({
      projectName: project.name,
      orderName: order.name,
      vendorName: order.vendorUser?.name ?? null,
      boqItems: boqItems.map((i) => ({ description: i.description, unit: i.unit, quantity: i.plannedQty })),
      briefDescription: body.briefDescription,
    });

    if (!draft) {
      return NextResponse.json({ success: false, error: 'AI drafting failed — please fill the fields manually' }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: draft });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Work order AI draft error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
