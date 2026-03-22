import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { Reader, type ReaderModel } from '@maxmind/geoip2-node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const CITY_DB = path.join(projectRoot, 'GeoIP', 'GeoLite2-City.mmdb');
const ASN_DB = path.join(projectRoot, 'GeoIP', 'GeoLite2-ASN.mmdb');

let cityReader: ReaderModel | undefined;
let asnReader: ReaderModel | undefined;
let openError: string | null = null;

function dbPathsOk(): boolean {
  return fs.existsSync(CITY_DB) && fs.existsSync(ASN_DB);
}

async function getReaders(): Promise<{ city: ReaderModel; asn: ReaderModel } | null> {
  if (!dbPathsOk()) {
    return null;
  }
  if (openError) return null;
  if (cityReader && asnReader) return { city: cityReader, asn: asnReader };
  try {
    const city = await Reader.open(CITY_DB);
    const asn = await Reader.open(ASN_DB);
    cityReader = city;
    asnReader = asn;
    return { city, asn };
  } catch (e) {
    openError = e instanceof Error ? e.message : 'Failed to open GeoIP databases';
    cityReader = undefined;
    asnReader = undefined;
    console.warn('[geoip]', openError);
    return null;
  }
}

/** IPv4 / IPv6 check — MaxMind accepts these; we reject obviously invalid strings. */
function normalizeClientIp(raw: string | undefined): string | null {
  if (!raw) return null;
  const ip = raw.trim();
  if (!ip || ip.length > 45) return null;
  return ip;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * GET /api/geoip?ip=… — MaxMind GeoLite2 city + ASN for the given address.
 */
export function createGeoipMiddleware(): Connect.NextHandleFunction {
  return async function geoipMiddleware(req, res, next) {
    const url = req.url ?? '';
    if (!url.startsWith('/api/geoip')) {
      next();
      return;
    }
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end();
      return;
    }

    let ipParam: string | null = null;
    try {
      const u = new URL(url, 'http://localhost');
      ipParam = normalizeClientIp(u.searchParams.get('ip') ?? undefined);
    } catch {
      sendJson(res, 400, { error: 'Invalid URL' });
      return;
    }

    if (!ipParam) {
      sendJson(res, 400, { error: 'Missing or invalid ip query parameter' });
      return;
    }

    const readers = await getReaders();
    if (!readers) {
      const detail = dbPathsOk()
        ? openError ?? 'GeoIP unavailable'
        : 'GeoLite2 MMDB files missing under GeoIP/ (GeoLite2-City.mmdb, GeoLite2-ASN.mmdb)';
      sendJson(res, 503, { error: detail });
      return;
    }

    try {
      const city = readers.city.city(ipParam);
      let asnNum: number | undefined;
      let asnOrg: string | undefined;
      try {
        const asn = readers.asn.asn(ipParam);
        asnNum = asn.autonomousSystemNumber;
        asnOrg = asn.autonomousSystemOrganization;
      } catch {
        /* ASN DB may lack the network */
      }

      const cityName = city.city?.names.en?.trim() ?? '';
      const regionName = city.subdivisions?.[0]?.names.en?.trim() ?? '';
      const countryName = city.country?.names.en?.trim() ?? '';
      const countryCode = city.country?.isoCode?.trim() ?? '';

      const isp =
        asnOrg?.trim() ||
        city.traits?.autonomousSystemOrganization?.trim() ||
        'Unknown';

      const payload = {
        ip: ipParam,
        city: cityName || 'Unknown',
        region: regionName,
        country: countryName || countryCode || 'Unknown',
        countryCode: countryCode || undefined,
        isp,
        asn: asnNum,
        organization: asnOrg?.trim() || undefined,
        status: 'Verified' as const,
        source: 'GeoLite2 (local MMDB)',
      };

      sendJson(res, 200, payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lookup failed';
      sendJson(res, 404, { error: msg, ip: ipParam });
    }
  };
}

export type GeoipMiddleware = ReturnType<typeof createGeoipMiddleware>;
