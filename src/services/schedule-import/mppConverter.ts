import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const FALLBACK_HINT = 'Try re-exporting your schedule from Microsoft Project via File → Save As → XML and uploading that instead.';
const CONVERT_TIMEOUT_MS = 25_000;

// vendor/mpp-runtime/ — a jlink-trimmed JRE (java.base + java.desktop + java.net.http +
// java.prefs + java.scripting + java.sql + jdk.charsets/jdk.crypto.ec/jdk.zipfs) plus MPXJ
// 16.5.0 and its dependency jars, plus a tiny compiled `Convert.class` wrapping MPXJ's
// documented UniversalProjectReader → UniversalProjectWriter(MSPDI) example. Built for
// linux-x64 specifically (~90MB) because that's the one platform @byteink/mppjs's
// GraalVM native-image binary cannot run on at all (see below) — everywhere else keeps
// using the much smaller @byteink/mppjs native binary unchanged.
const JAVA_RUNTIME_ROOT = path.join(process.cwd(), 'vendor', 'mpp-runtime');
const JAVA_BIN = path.join(JAVA_RUNTIME_ROOT, 'jre', 'bin', 'java');

function hasJavaRuntime(): boolean {
  return process.platform === 'linux' && process.arch === 'x64' && existsSync(JAVA_BIN);
}

/** Runs the bundled JRE + MPXJ directly — bypasses @byteink/mppjs entirely. Verified against
 * real production .mpp uploads: the exact files that crash the GraalVM native-image binary
 * with `UnsatisfiedLinkError: no awt in java.library.path` convert cleanly through a real JVM
 * (even fully headless), because that's a GraalVM native-image AWT limitation
 * (https://github.com/oracle/graal/issues/2842, unresolved for years across the ecosystem),
 * not a JVM one. */
function convertViaBundledJre(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const classpath = `${JAVA_RUNTIME_ROOT}:${path.join(JAVA_RUNTIME_ROOT, 'lib', '*')}`;
    const child = spawn(
      JAVA_BIN,
      ['-Djava.awt.headless=true', '-cp', classpath, 'Convert', inputPath, outputPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`bundled JRE conversion timed out after ${CONVERT_TIMEOUT_MS}ms`));
    }, CONVERT_TIMEOUT_MS);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`bundled JRE conversion exited ${code}: ${stderr.trim() || 'no stderr'}`));
    });
  });
}

/**
 * Converts a native .mpp file buffer to MSPDI XML. Runs entirely through temp files.
 * Output feeds straight into parseMspdiXml — same schema as a real MS Project XML export,
 * so no separate .mpp parsing path is needed downstream.
 *
 * Two conversion backends:
 * - linux-x64 (production/Vercel): the bundled JRE above (vendor/mpp-runtime).
 * - everywhere else (darwin-arm64 local dev, etc.): @byteink/mppjs's native binary, which
 *   works fine on those platforms and is far smaller — no reason to replace it there.
 */
export async function convertMppToXml(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ax-mpp-'));
  const inputPath = path.join(dir, `${randomUUID()}.mpp`);
  const outputPath = path.join(dir, `${randomUUID()}.xml`);
  try {
    await writeFile(inputPath, buffer);

    try {
      if (hasJavaRuntime()) {
        await convertViaBundledJre(inputPath, outputPath);
      } else {
        const { convert } = await import('@byteink/mppjs');
        await convert(inputPath, outputPath, { timeoutMs: CONVERT_TIMEOUT_MS });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Full detail (often a multi-line Java stack trace) goes to server logs only —
      // never shown to the user, who needs an actionable message, not a stack trace.
      console.error('[mppConverter] conversion failed:', detail);

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
