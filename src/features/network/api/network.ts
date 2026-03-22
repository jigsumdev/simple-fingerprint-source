import { z } from 'zod';
import { env } from '@/lib/env';
import type { NetworkInfo } from '@/types';
import { parseCloudflareTrace } from '@/utils/parsers';

const CLOUDFLARE_TRACE = 'https://www.cloudflare.com/cdn-cgi/trace';

// Zod schemas for API response validation
const IPApiSchema = z.object({
  status: z.string(),
  query: z.string().optional(),
  country: z.string().optional(),
  regionName: z.string().optional(),
  city: z.string().optional(),
  isp: z.string().optional(),
});

const IPWhoSchema = z.object({
  success: z.boolean().optional(),
  ip: z.string(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  connection: z
    .object({
      isp: z.string().optional(),
    })
    .optional(),
});

const DBIPSchema = z.object({
  ipAddress: z.string().optional(),
  city: z.string().optional(),
  regionName: z.string().optional(),
  countryName: z.string().optional(),
  isp: z.string().optional(),
});

const LocalGeoipSchema = z.object({
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

interface APIProvider {
  url: string;
  type: 'json';
  fields: {
    ip: string;
    city: string;
    region: string;
    country: string;
    isp: string;
  };
  schema?: z.ZodSchema;
}

// HTTPS providers first — plain HTTP (ip-api) last to avoid mixed-content failures on HTTPS origins
const providers: APIProvider[] = [
  {
    url: 'https://ipwho.is/',
    type: 'json',
    fields: {
      ip: 'ip',
      city: 'city',
      region: 'region',
      country: 'country',
      isp: 'connection.isp',
    },
    schema: IPWhoSchema,
  },
  {
    url: 'https://api.db-ip.com/v2/free/self',
    type: 'json',
    fields: {
      ip: 'ipAddress',
      city: 'city',
      region: 'regionName',
      country: 'countryName',
      isp: 'isp',
    },
    schema: DBIPSchema,
  },
  {
    url: 'http://ip-api.com/json/?fields=status,query,country,regionName,city,isp',
    type: 'json',
    fields: {
      ip: 'query',
      city: 'city',
      region: 'regionName',
      country: 'country',
      isp: 'isp',
    },
    schema: IPApiSchema,
  },
];

function resolvePath(path: string, obj: Record<string, unknown>): string | null {
  const result = path.split('.').reduce<unknown>((prev, curr) => {
    if (prev != null && typeof prev === 'object' && curr in (prev as Record<string, unknown>)) {
      return (prev as Record<string, unknown>)[curr];
    }
    return null;
  }, obj);
  return typeof result === 'string' ? result : null;
}

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

/**
 * Enrich public IP using local GeoLite2 MMDB when the Vite dev/preview server exposes /api/geoip.
 */
async function tryLocalGeoip(ip: string): Promise<NetworkInfo | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.apiTimeout);
    const url = `/api/geoip?ip=${encodeURIComponent(ip)}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = LocalGeoipSchema.safeParse(data);
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
 * Scan network information: prefer GeoLite2 via same-origin /api/geoip (dev/preview), then HTTPS APIs, then Cloudflare trace.
 */
export async function scanNetwork(): Promise<NetworkInfo> {
  const trace = await fetchCloudflareTrace();
  const traceIp = trace?.['ip']?.trim();
  if (traceIp && traceIp !== 'Unknown') {
    const local = await tryLocalGeoip(traceIp);
    if (local) return local;
  }

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), env.apiTimeout);

      const response = await fetch(provider.url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: Record<string, unknown> = await response.json();

      if (provider.url.includes('ipwho') && data['success'] === false) {
        console.warn('IPWho API returned error:', data);
        continue;
      }
      if (provider.url.includes('ip-api') && data['status'] === 'fail') {
        continue;
      }

      if (provider.schema) {
        const validationResult = provider.schema.safeParse(data);
        if (!validationResult.success) {
          console.warn('API response validation failed:', validationResult.error);
          continue;
        }
      }

      const rawCity = resolvePath(provider.fields.city, data);
      const rawRegion = resolvePath(provider.fields.region, data);
      const rawCountry = resolvePath(provider.fields.country, data);
      const rawIsp = resolvePath(provider.fields.isp, data);
      const city = rawCity?.trim() || 'Unknown';
      const region = rawRegion?.trim() ?? '';
      const country = rawCountry?.trim() || 'Unknown';
      const isp = rawIsp?.trim() || 'Unknown';

      if (city === 'Unknown' && !region && country === 'Unknown' && isp === 'Unknown') {
        continue;
      }

      return {
        ip: resolvePath(provider.fields.ip, data) || 'Unknown',
        city,
        region,
        country,
        isp,
        status: 'Verified',
        source: new URL(provider.url).hostname,
      };
    } catch (error) {
      console.warn(`Provider ${provider.url} failed:`, error);
    }
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
