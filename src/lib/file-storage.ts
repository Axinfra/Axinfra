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

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";

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

export class LocalDiskStorage implements FileStorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.UPLOAD_DIR || "./uploads";
  }

  async save(key: string, data: Buffer, _mimeType: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
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
    } catch {}
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

export class S3Storage implements FileStorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET!;

    this.client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  async save(key: string, data: Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
      })
    );
    return key;
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const stream = res.Body as any;
      const chunks: Uint8Array[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}


// ── Vercel Blob adapter (production — simplest for Vercel deployments) ─────────

export class VercelBlobStorage implements FileStorageAdapter {
  async save(key: string, data: Buffer, mimeType: string): Promise<string> {
    const { put } = await import('@vercel/blob');
    // Keep private access (matches store default settings).
    // The serve API routes use getDownloadUrl() or redirect to handle private blob reads.
    const blob = await put(key, data, {
      access: 'private',
      contentType: mimeType,
    });
    return blob.url;
  }

  async read(storageKey: string): Promise<Buffer | null> {
    try {
      const res = await fetch(storageKey);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const { del } = await import('@vercel/blob');
    await del(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const res = await fetch(storageKey, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Supabase Storage adapter (production — recommended for Vercel) ────────────

export class SupabaseStorage implements FileStorageAdapter {
  private supabase;
  private bucket: string;

  constructor() {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'evidence';
    this.supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  async save(key: string, data: Buffer, mimeType: string): Promise<string> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(key, data, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return key;
  }

  async read(key: string): Promise<Buffer | null> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .download(key);
    if (error || !data) return null;
    const arrayBuffer = await (data as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(key: string): Promise<void> {
    await this.supabase.storage.from(this.bucket).remove([key]);
  }

  async exists(key: string): Promise<boolean> {
    const folder = key.split('/').slice(0, -1).join('/') || '';
    const name = key.split('/').pop() ?? key;
    const { data } = await this.supabase.storage
      .from(this.bucket)
      .list(folder, { search: name });
    return (data?.length ?? 0) > 0;
  }
}

/**
 * Active storage adapter.
 *
 * Priority:
 *  1. Vercel Blob      — if BLOB_READ_WRITE_TOKEN is set (simplest for Vercel)
 *  2. Supabase Storage — if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 *  3. Cloudflare R2    — if R2_BUCKET is set
 *  4. Local disk       — dev fallback (not suitable for Vercel / serverless)
 */
export const fileStorage: FileStorageAdapter =
  process.env.BLOB_READ_WRITE_TOKEN
    ? new VercelBlobStorage()
    : process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseStorage()
      : process.env.R2_BUCKET
        ? new S3Storage()
        : new LocalDiskStorage();

