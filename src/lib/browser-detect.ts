import type { ClientHintsData, NavigatorDeepDive } from '@/types';

export interface BrowserInfo {
  family: string;
  engine: string;
  majorVersion: string;
}

const CHROMIUM_BRAND_FILTER = new Set([
  'Not A;Brand',
  'Not A(Brand',
  'Not)A;Brand',
  'Not/A)Brand',
  'Not_A Brand',
  'Chromium',
]);

/**
 * Detect browser family, engine, and major version from client hints + UA.
 * Client hints are preferred when available because they are explicit;
 * UA string parsing is the fallback.
 */
export function detectBrowser(
  clientHints: ClientHintsData | null | undefined,
  nav: NavigatorDeepDive | undefined,
): BrowserInfo {
  const fromHints = detectFromClientHints(clientHints);
  if (fromHints) return fromHints;
  return detectFromUA(nav?.userAgent ?? '');
}

function detectFromClientHints(ch: ClientHintsData | null | undefined): BrowserInfo | null {
  if (!ch?.brands?.length) return null;

  const real = ch.brands.filter((b) => !CHROMIUM_BRAND_FILTER.has(b.brand));
  if (!real.length) return null;

  for (const b of real) {
    const name = b.brand.toLowerCase();
    const major = parseMajor(b.version);

    if (name.includes('edge') || name.includes('edg')) {
      return { family: 'Edge', engine: 'Chromium', majorVersion: major };
    }
    if (name.includes('opera') || name.includes('opr')) {
      return { family: 'Opera', engine: 'Chromium', majorVersion: major };
    }
    if (name.includes('brave')) {
      return { family: 'Brave', engine: 'Chromium', majorVersion: major };
    }
    if (name.includes('vivaldi')) {
      return { family: 'Vivaldi', engine: 'Chromium', majorVersion: major };
    }
    if (name.includes('samsung')) {
      return { family: 'Samsung Internet', engine: 'Chromium', majorVersion: major };
    }
    if (name.includes('chrome') || name === 'google chrome') {
      return { family: 'Chrome', engine: 'Chromium', majorVersion: major };
    }
  }

  const first = real[0]!;
  return { family: first.brand, engine: 'Chromium', majorVersion: parseMajor(first.version) };
}

function detectFromUA(ua: string): BrowserInfo {
  if (!ua) return { family: 'Unknown', engine: 'Unknown', majorVersion: 'Unknown' };

  if (/\bEdg(?:e|A|iOS)?\/(\d+)/i.test(ua)) {
    return { family: 'Edge', engine: 'Chromium', majorVersion: RegExp.$1 };
  }
  if (/\bOPR\/(\d+)/i.test(ua)) {
    return { family: 'Opera', engine: 'Chromium', majorVersion: RegExp.$1 };
  }
  if (/\bBrave\b/i.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/);
    return { family: 'Brave', engine: 'Chromium', majorVersion: m?.[1] ?? 'Unknown' };
  }
  if (/\bVivaldi\/(\d+)/i.test(ua)) {
    return { family: 'Vivaldi', engine: 'Chromium', majorVersion: RegExp.$1 };
  }
  if (/\bSamsungBrowser\/(\d+)/i.test(ua)) {
    return { family: 'Samsung Internet', engine: 'Chromium', majorVersion: RegExp.$1 };
  }
  if (/\bFirefox\/(\d+)/i.test(ua)) {
    return { family: 'Firefox', engine: 'Gecko', majorVersion: RegExp.$1 };
  }
  if (/\bSafari\/[\d.]+/i.test(ua) && !/Chrome/i.test(ua)) {
    const m = ua.match(/Version\/(\d+)/i);
    return { family: 'Safari', engine: 'WebKit', majorVersion: m?.[1] ?? 'Unknown' };
  }
  if (/\bChrome\/(\d+)/i.test(ua)) {
    return { family: 'Chrome', engine: 'Chromium', majorVersion: RegExp.$1 };
  }

  return { family: 'Unknown', engine: 'Unknown', majorVersion: 'Unknown' };
}

function parseMajor(v: string): string {
  const n = v.split('.')[0];
  return n && /^\d+$/.test(n) ? n : 'Unknown';
}

/** Short client-hints summary for the normalized identity layer. */
export function summarizeClientHints(
  ch: ClientHintsData | null | undefined,
  nav: NavigatorDeepDive | undefined,
): string {
  if (!ch) return 'unavailable';

  const parts: string[] = [];

  const platform = ch.platform ?? nav?.platform ?? '';
  if (platform) parts.push(platform);

  const he = ch.highEntropy as Record<string, unknown> | null | undefined;
  if (he) {
    if (he['architecture']) parts.push(String(he['architecture']));
    if (he['bitness']) parts.push(`${he['bitness']}bit`);
  }

  if (ch.mobile === true) {
    parts.push('mobile');
  } else if (ch.mobile === false) {
    parts.push('desktop');
  }

  if (he && he['wow64'] === true) {
    parts.push('wow64');
  }

  return parts.length ? parts.join(' ') : 'minimal';
}
