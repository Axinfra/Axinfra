import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatters

/** Locale to format each supported currency's digit grouping under — INR uses the
 * lakh/crore grouping via en-IN, everything else gets standard 3-digit grouping. The
 * currency code itself (not the locale) controls which symbol Intl prints. */
const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  AED: 'en-AE',
  USD: 'en-US',
  EUR: 'en-IE',
  GBP: 'en-GB',
};

/** Formats a monetary amount in the given currency (defaults to INR — the historical
 * default before per-project currency was wired up). Pass the project's own
 * `metadata.currency` wherever one is known instead of relying on the default. */
export function formatCurrency(amount: number | string, currency: string = 'INR') {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-';
  try {
    return format(new Date(date), 'MMM d, yyyy');
  } catch (error) {
    return '-';
  }
}

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return '-';
  try {
    return format(new Date(date), 'MMM d, yyyy HH:mm');
  } catch (error) {
    return '-';
  }
}

// Env helpers
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Alias for backwards compatibility found in some files
export const parseEnvNumber = getEnvNumber;

// Generators
export function generateStorageKey(fileName: string): string {
  const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${uuidv4()}-${cleanName}`;
}

/**
 * Extracts a storage-key-safe extension from a user-supplied filename. Callers that build a
 * storage key like `${prefix}/${uuid}.${ext}` must use this instead of a raw
 * `fileName.split('.').pop()` — a filename with no dot (e.g. "x/../../etc/passwd") makes
 * `.pop()` return the entire filename verbatim, embedding path separators straight into the
 * storage key. This only ever returns a short alphanumeric token or 'bin'.
 */
export function sanitizeFileExt(fileName: string): string {
  const raw = (fileName.split('.').pop() ?? '').toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(raw) ? raw : 'bin';
}
