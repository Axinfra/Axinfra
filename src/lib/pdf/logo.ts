import fs from 'fs';
import path from 'path';

// Read once per warm serverless instance — the file is small (~90KB) and never changes at
// runtime. Bundled into the function via next.config.js `outputFileTracingIncludes` (Next's
// default file tracer can't see this dynamic fs.readFileSync call, same reason @byteink/mppjs
// needed the same treatment).
let cachedLogoDataUri: string | null = null;
export function getLogoDataUri(): string {
  if (!cachedLogoDataUri) {
    const buffer = fs.readFileSync(path.join(process.cwd(), 'public', 'light.png'));
    cachedLogoDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
  }
  return cachedLogoDataUri;
}
