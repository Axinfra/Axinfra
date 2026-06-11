/**
 * Platform admin access is restricted to admin@axinfra.local only.
 * Override by setting ADMIN_EMAILS in .env (comma-separated).
 */
const PLATFORM_ADMIN = 'admin@axinfra.local';

export function isAdminEmail(email: string): boolean {
  const overrides = process.env.ADMIN_EMAILS?.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean) ?? [];

  const allowed = overrides.length > 0 ? overrides : [PLATFORM_ADMIN];
  return allowed.includes(email.toLowerCase());
}

export async function requireAdminAccess(email: string): Promise<void> {
  if (!isAdminEmail(email)) throw new Error('FORBIDDEN');
}
