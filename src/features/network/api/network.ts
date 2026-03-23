import { z } from 'zod';
import { env } from '@/lib/env';
import type { NetworkInfo } from '@/types';
import { parseCloudflareTrace } from '@/utils/parsers';

const CLOUDFLARE_TRACE = 'https://www.cloudflare.com/cdn-cgi/trace';

const GeoipSchema = z.object({
  ip: z.string(),
  city: z.string(),
  region: z.string(),
  country: z.string(),
  isp: z.string(),
  status: z.literal('Verified'),
  source: z.string(),
  countryCode: z.string().optional(),
  asn: z.number().optional(),
  organization: z.string().optional(),
});

async function fetchCloudflareTrace(): Promise<Record<string, string> | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.apiTimeout);
    const response = await fetch(CLOUDFLARE_TRACE, {
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const text = await response.text();
    return parseCloudflareTrace(text);
  } catch {
    return null;
  }
}

async function tryGeoipEndpoint(ip?: string): Promise<NetworkInfo | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.apiTimeout);
    const url = ip ? `/api/geoip?ip=${encodeURIComponent(ip)}` : '/api/geoip';
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = GeoipSchema.safeParse(data);
    if (!parsed.success) return null;
    const d = parsed.data;
    return {
      ip: d.ip,
      city: d.city,
      region: d.region,
      country: d.country,
      isp: d.isp,
      status: 'Verified',
      source: d.source,
      countryCode: d.countryCode,
      asn: d.asn,
      organization: d.organization,
    };
  } catch {
    return null;
  }
}

function cloudflarePartialFromTrace(trace: Record<string, string>): NetworkInfo {
  const ip = trace['ip'] ?? 'Unknown';
  const loc = trace['loc'] ?? 'Unknown';
  return {
    ip,
    city: 'Cloudflare Node',
    region: loc,
    country: loc,
    isp: 'Cloudflare',
    status: 'Partial (Fallback)',
    source: 'cloudflare.com',
  };
}

/**
 * 1. /api/geoip (no IP — Cloudflare edge infers it in production)
 * 2. Cloudflare trace -> IP -> /api/geoip?ip=… (local dev with MMDB)
 * 3. Cloudflare trace partial
 * 4. Local timezone inference
 */
export async function scanNetwork(): Promise<NetworkInfo> {
  const edgeResult = await tryGeoipEndpoint();
  if (edgeResult) return edgeResult;

  const trace = await fetchCloudflareTrace();
  const traceIp = trace?.['ip']?.trim();
  if (traceIp && traceIp !== 'Unknown') {
    const local = await tryGeoipEndpoint(traceIp);
    if (local) return local;
  }

  if (trace) {
    return cloudflarePartialFromTrace(trace);
  }

  return getLocalFallback();
}

function getLocalFallback(): NetworkInfo {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = timezone.split('/');

  return {
    ip: 'Blocked / Hidden',
    city: parts[1]?.replace('_', ' ') || 'Localhost',
    region: parts[0] || 'System',
    country: 'Unknown',
    isp: 'Firewall Detected',
    status: 'Restricted',
    source: 'Local Inference',
  };
}
