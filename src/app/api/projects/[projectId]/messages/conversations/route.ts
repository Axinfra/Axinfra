import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { MessageService } from '@/services/MessageService';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/messages/conversations
// Every other project member (the contact list to message), each with their last message and
// unread count, most-recent-activity first.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const conversations = await MessageService.getConversations(projectId, auth.userId);
    return NextResponse.json({ success: true, data: conversations });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Messages conversations error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
