import { fileStorage } from '@/lib/file-storage';
import { sendShareEmail } from '@/lib/email';
import { MessageService } from '@/services/MessageService';

/** A file ready to be shared — `storageKey` must already be the value fileStorage.read()
 * expects (ProjectDocumentFile/DrawingVersion callers pass their `filePath`; a freshly
 * generated PDF passes whatever fileStorage.save() just returned). */
export interface ShareableFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

/** Shares an existing file (a document, or a freshly generated Checklist/DPR/etc. PDF) via
 * email or via the internal direct-message system — the two "Share" options surfaced on
 * Documents. Neither path re-uploads anything: email reads the bytes once and attaches them;
 * message sharing just references the same storageKey from a new MessageAttachment row. */
export const ShareService = {
  async shareByEmail(params: {
    senderName: string;
    to: string[];
    subject: string;
    note?: string;
    file: ShareableFile;
  }): Promise<{ success: boolean; error?: string }> {
    if (params.to.length === 0) {
      return { success: false, error: 'At least one recipient email is required' };
    }
    const buffer = await fileStorage.read(params.file.storageKey);
    if (!buffer) {
      return { success: false, error: 'File not found' };
    }

    await Promise.all(
      params.to.map((to) =>
        sendShareEmail(to, {
          senderName: params.senderName,
          subject: params.subject,
          note: params.note,
          fileName: params.file.fileName,
          mimeType: params.file.mimeType,
          buffer,
        }),
      ),
    );
    return { success: true };
  },

  async shareByMessage(params: {
    projectId: string;
    senderId: string;
    recipientIds: string[];
    note: string;
    file: ShareableFile;
  }): Promise<{ success: boolean; error?: string; failedCount: number }> {
    if (params.recipientIds.length === 0) {
      return { success: false, error: 'At least one recipient is required', failedCount: 0 };
    }
    const results = await Promise.all(
      params.recipientIds.map((recipientId) =>
        MessageService.send(params.projectId, params.senderId, recipientId, params.note, [
          {
            storageKey: params.file.storageKey,
            fileName: params.file.fileName,
            mimeType: params.file.mimeType,
            fileSize: params.file.fileSize,
          },
        ]),
      ),
    );
    const failedCount = results.filter((r) => !r.success).length;
    return { success: failedCount === 0, failedCount };
  },
};
