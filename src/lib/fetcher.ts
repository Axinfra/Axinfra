/**
 * Default SWR fetcher for our APIs.
 *
 * All API responses follow the shape `{ success: boolean, data?: T, error?: string }`.
 * We unwrap to `data` on success and throw on failure so SWR's `error` populates.
 */
export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  const body = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (body.success === false) {
    throw new Error(body.error || 'Request failed');
  }
  return body.data as T;
}
