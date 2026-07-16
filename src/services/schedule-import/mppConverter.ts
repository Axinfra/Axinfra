import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Converts a native .mpp file buffer to MSPDI XML using @byteink/mppjs (MPXJ
 * compiled to a native binary via GraalVM — no JVM needed). Runs entirely
 * through temp files since the underlying binary is a file-in/file-out CLI.
 * Output feeds straight into parseMspdiXml — same schema as a real MS Project
 * XML export, so no separate .mpp parsing path is needed downstream.
 */
export async function convertMppToXml(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ax-mpp-'));
  const inputPath = path.join(dir, `${randomUUID()}.mpp`);
  const outputPath = path.join(dir, `${randomUUID()}.xml`);
  try {
    await writeFile(inputPath, buffer);

    const { convert } = await import('@byteink/mppjs');
    try {
      await convert(inputPath, outputPath, { timeoutMs: 25_000 });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Couldn't read this .mpp file (${detail}). Try re-exporting your schedule from Microsoft Project via File → Save As → XML and uploading that instead.`
      );
    }

    return await readFile(outputPath, 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
