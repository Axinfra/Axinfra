/**
 * file-storage.ts — Pluggable file storage abstraction.
 *
 * PURPOSE: Remove binary BLOBs from database. Files are stored on
 * disk (dev) or object storage (production), and the DB only stores
 * metadata (path, name, mime, size).
 *
 * ADAPTER PATTERN: Swap LocalDiskStorage for S3Storage by changing
 * the export at the bottom of this file.
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface FileStorageAdapter {
    /** Save a file and return the storage path/key */
    save(key: string, data: Buffer, mimeType: string): Promise<string>;

    /** Read a file by its storage path/key */
    read(filePath: string): Promise<Buffer | null>;

    /** Delete a file by its storage path/key */
    delete(filePath: string): Promise<void>;

    /** Check if a file exists */
    exists(filePath: string): Promise<boolean>;
}

/**
 * LocalDiskStorage — Stores files on the local filesystem.
 * Suitable for development and single-server deployments.
 */
export class LocalDiskStorage implements FileStorageAdapter {
    private baseDir: string;

    constructor(baseDir?: string) {
        this.baseDir = baseDir || process.env.UPLOAD_DIR || './uploads';
    }

    async save(key: string, data: Buffer, _mimeType: string): Promise<string> {
        const filePath = path.join(this.baseDir, key);
        const dir = path.dirname(filePath);

        // Ensure directory exists
        await fs.mkdir(dir, { recursive: true });

        // Write file
        await fs.writeFile(filePath, data);

        return filePath;
    }

    async read(filePath: string): Promise<Buffer | null> {
        try {
            return await fs.readFile(filePath);
        } catch {
            return null;
        }
    }

    async delete(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch {
            // File may not exist — ignore
        }
    }

    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * S3Storage — Stub for S3-compatible object storage.
 * Implement when deploying to cloud.
 */
export class S3Storage implements FileStorageAdapter {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async save(_key: string, _data: Buffer, _mimeType: string): Promise<string> {
        throw new Error('S3Storage not implemented. Configure AWS SDK and implement.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async read(_filePath: string): Promise<Buffer | null> {
        throw new Error('S3Storage not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async delete(_filePath: string): Promise<void> {
        throw new Error('S3Storage not implemented.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async exists(_filePath: string): Promise<boolean> {
        throw new Error('S3Storage not implemented.');
    }
}

/**
 * Active storage adapter — change this line to switch storage backends.
 *
 * For production S3: export const fileStorage = new S3Storage();
 */
export const fileStorage: FileStorageAdapter = new LocalDiskStorage();
