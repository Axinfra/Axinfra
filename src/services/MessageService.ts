import { prisma } from '@/lib/db';

export interface MessageFileInput {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

const senderInclude = { sender: { select: { id: true, name: true } }, attachments: true } as const;

/** Direct messaging between two members of the same project — one-on-one only (no role-wide
 * broadcast; VendorRequest/RFI already covers that). Read-only, always-open for any two people
 * who both hold a role on the project, mirroring how Checklists/DPR visibility is broad by
 * design in this app. */
export class MessageService {
  /** Sends a message. Both sender and recipient must hold a role on this project — the sender
   * is already guaranteed by the caller's auth check; the recipient is validated here so you
   * can't message someone outside the project. */
  static async send(
    projectId: string,
    senderId: string,
    recipientId: string,
    body: string,
    files: MessageFileInput[] = []
  ): Promise<{ success: boolean; error?: string; message?: unknown }> {
    if (senderId === recipientId) {
      return { success: false, error: 'Cannot message yourself' };
    }
    if (!body.trim() && files.length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    const recipientRole = await prisma.projectRole.findFirst({ where: { projectId, userId: recipientId } });
    if (!recipientRole) {
      return { success: false, error: 'Recipient is not a member of this project' };
    }

    const message = await prisma.message.create({
      data: {
        projectId,
        senderId,
        recipientId,
        body: body.trim(),
        attachments: { create: files },
      },
      include: senderInclude,
    });

    return { success: true, message };
  }

  /** Full thread between two users in a project, oldest first. */
  static async getThread(projectId: string, userId: string, otherUserId: string) {
    return prisma.message.findMany({
      where: {
        projectId,
        OR: [
          { senderId: userId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: userId },
        ],
      },
      include: senderInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Marks every message from otherUserId to userId in this project as read. */
  static async markRead(projectId: string, userId: string, otherUserId: string): Promise<void> {
    await prisma.message.updateMany({
      where: { projectId, senderId: otherUserId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Every other project member (the contact list), each with their last message (if any) and
   * unread count, sorted by most recent activity — members never messaged sort last, by name. */
  static async getConversations(projectId: string, userId: string) {
    const [roles, messages] = await Promise.all([
      prisma.projectRole.findMany({
        where: { projectId, userId: { not: userId } },
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.message.findMany({
        where: { projectId, OR: [{ senderId: userId }, { recipientId: userId }] },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const lastMessageByPartner = new Map<string, (typeof messages)[number]>();
    const unreadByPartner = new Map<string, number>();
    for (const m of messages) {
      const partnerId = m.senderId === userId ? m.recipientId : m.senderId;
      if (!lastMessageByPartner.has(partnerId)) lastMessageByPartner.set(partnerId, m);
      if (m.recipientId === userId && !m.readAt) {
        unreadByPartner.set(partnerId, (unreadByPartner.get(partnerId) ?? 0) + 1);
      }
    }

    return roles
      .map((r) => {
        const last = lastMessageByPartner.get(r.userId) ?? null;
        return {
          userId: r.userId,
          name: r.user.name,
          role: r.role,
          lastMessageBody: last?.body ?? null,
          lastMessageAt: last?.createdAt ?? null,
          unreadCount: unreadByPartner.get(r.userId) ?? 0,
        };
      })
      .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  }

  /** Total unread messages for a user across every project they belong to — powers the navbar badge. */
  static async getUnreadCountForUser(userId: string): Promise<number> {
    return prisma.message.count({ where: { recipientId: userId, readAt: null } });
  }

  /** Unread count scoped to a single project. */
  static async getUnreadCountForProject(projectId: string, userId: string): Promise<number> {
    return prisma.message.count({ where: { projectId, recipientId: userId, readAt: null } });
  }
}
