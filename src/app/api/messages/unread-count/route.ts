import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { MessageService } from '@/services/MessageService';

export const dynamic = 'force-dynamic';

// GET /api/messages/unread-count - total unread direct messages across every project the
// signed-in user belongs to. Powers the navbar message badge, which is global rather than
// project-scoped since a user may have unread messages in a project they aren't currently viewing.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const count = await MessageService.getUnreadCountForUser(session.userId);
    return NextResponse.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Unread message count error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
