/**
 * cyrb53 - A simple but high-quality 53-bit hash function (non-cryptographic; legacy display only)
 */
export function cyrb53(str: string, seed: number = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Recursively sort object keys for stable JSON serialization */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = canonicalize(obj[k]);
    }
    return out;
  }
  return String(value);
}

/** SHA-256 hex (uppercase) via Web Crypto */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export interface FingerprintIdResult {
  /** 64-char SHA-256 hex — primary device digest */
  primaryId: string;
  /** Legacy cyrb53-based hex for comparison / display */
  legacyDisplayHash: string;
}

/**
 * Stable device fingerprint ID: SHA-256 over canonical JSON of all sources.
 * Order of arguments is preserved in the payload array.
 */
export async function generateFingerprintId(
  ...sources: unknown[]
): Promise<FingerprintIdResult> {
  const payload = canonicalize(sources);
  const canonical = JSON.stringify(payload);
  const primaryId = await sha256Hex(canonical);
  const legacyDisplayHash = cyrb53(canonical).toString(16).toUpperCase();
  return { primaryId, legacyDisplayHash };
}
