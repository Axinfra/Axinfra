import { prisma } from '@/lib/db';
import { fileStorage } from '@/lib/file-storage';

/**
 * EvidenceService - Serves previously uploaded evidence files.
 * Submission and review flows have been removed; this only keeps
 * historical files reachable via their existing download links.
 */
export class EvidenceService {
  /**
   * Get file content for download.
   * Reads from file storage (disk/S3) instead of database blob.
   */
  static async getFile(fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
    const file = await prisma.evidenceFile.findUnique({
      where: { id: fileId },
    });

    if (!file || !file.storageKey) {
      return null;
    }

    // filePath is the resolved path returned by save() (e.g. "./uploads/key").
    // storageKey alone is missing the base dir for LocalDiskStorage, so prefer filePath.
    const readTarget = file.filePath || file.storageKey;
    const buffer = await fileStorage.read(readTarget);
    if (!buffer) {
      return null;
    }

    return {
      buffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }
}
