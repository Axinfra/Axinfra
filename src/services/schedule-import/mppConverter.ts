import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const FALLBACK_HINT = 'Try re-exporting your schedule from Microsoft Project via File → Save As → XML and uploading that instead.';

/**
 * Converts a native .mpp file buffer to MSPDI XML using @byteink/mppjs (MPXJ
 * compiled to a native binary via GraalVM — no JVM needed). Runs entirely
 * through temp files since the underlying binary is a file-in/file-out CLI.
 * Output feeds straight into parseMspdiXml — same schema as a real MS Project
 * XML export, so no separate .mpp parsing path is needed downstream.
 *
 * KNOWN LIMITATION (as of 2026-07-31): on Vercel's linux-x64 runtime, the
 * @byteink/mppjs-linux-x64 binary reliably crashes with
 * `UnsatisfiedLinkError: no awt in java.library.path` on any .mpp file that
 * has Gantt chart view formatting saved in it (i.e. most real-world files —
 * confirmed against multiple production uploads). This is a known GraalVM
 * native-image limitation (AWT is not fully supported in native-image
 * builds — see https://github.com/oracle/graal/issues/2842 and related,
 * unresolved for years), not something fixable here. The .mpp path only
 * actually works today on darwin-arm64 (local dev). Until upstream fixes
 * this or the binary is rebuilt with proper AWT support, every user hits
 * the fallback below — which is why the message is this explicit rather
 * than a generic "something went wrong".
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
      // Full detail (often a multi-line Java stack trace) goes to server logs only —
      // never shown to the user, who needs an actionable message, not a stack trace.
      console.error('[mppConverter] @byteink/mppjs conversion failed:', detail);

      const isAwtCrash = detail.includes('no awt in java.library.path') || detail.includes('UnsatisfiedLinkError');
      const isMissingBinary = detail.includes('no prebuilt binary');
      const summary = isAwtCrash
        ? "this platform's .mpp reader is currently unable to process this file (a known limitation, not specific to your file)"
        : isMissingBinary
          ? "this platform's .mpp reader isn't available right now"
          : "this .mpp file couldn't be read";

      throw new Error(`Couldn't read this .mpp file — ${summary}. ${FALLBACK_HINT}`);
    }

    return await readFile(outputPath, 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
