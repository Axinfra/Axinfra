import type { WorkBook } from 'xlsx';

export interface ExtractedExcelImage {
  fileName: string;
  mimeType: string;
  blob: Blob;
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

/** SheetJS Community Edition doesn't decode embedded images through the normal sheet-parsing
 * API (`cellImages`/`bookImages` are Pro-only) — but reading the workbook with `bookFiles:
 * true` exposes the raw zip entries (an .xlsx is a zip), including `xl/media/*`, which is
 * where embedded pictures actually live. This pulls those out directly, in file order — no
 * attempt to match a photo to a specific caption/cell position (that needs parsing
 * `xl/drawings/drawing*.xml` anchors, not needed for the "attach all photos, let the user
 * caption them" flow this feeds into). */
export function extractExcelImages(workbook: WorkBook): ExtractedExcelImage[] {
  const files = (workbook as unknown as { files?: Record<string, { content?: Uint8Array | number[] }> }).files;
  if (!files) return [];

  const images: ExtractedExcelImage[] = [];
  const keys = Object.keys(files).filter((k) => k.startsWith('xl/media/')).sort();
  for (const key of keys) {
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = EXT_MIME[ext];
    const content = files[key]?.content;
    if (!mimeType || !content) continue;
    const bytes = Uint8Array.from(content);
    images.push({
      fileName: key.split('/').pop() ?? key,
      mimeType,
      blob: new Blob([bytes], { type: mimeType }),
    });
  }
  return images;
}
