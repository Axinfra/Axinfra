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


/**
 * Active storage adapter — change this line to switch storage backends.
 *
 * For production S3: export const fileStorage = new S3Storage();
 */

export const fileStorage =
  process.env.NODE_ENV === "production"
    ? new S3Storage()
    : new LocalDiskStorage();

