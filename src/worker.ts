interface CfProperties {
  city?: string;
  region?: string;
  regionCode?: string;
  country?: string;
  asn?: number;
  asOrganization?: string;
  timezone?: string;
}

function countryName(code: string | undefined): string {
  if (!code) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function handleGeoip(request: Request): Response {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'Unknown';

  const cf = (request as unknown as { cf?: CfProperties }).cf;
  const code = cf?.country;

  return Response.json({
    ip,
    city: cf?.city || 'Unknown',
    region: cf?.region || '',
    country: countryName(code),
    countryCode: code || undefined,
    isp: cf?.asOrganization || 'Unknown',
    asn: cf?.asn,
    organization: cf?.asOrganization || undefined,
    status: 'Verified',
    source: 'Cloudflare (edge)',
  }, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/geoip' && request.method === 'GET') {
      return handleGeoip(request);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler;
