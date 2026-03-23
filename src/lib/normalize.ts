/**
 * Normalization layer: derives a stable NormalizedIdentity from raw scan data.
 * Isomorphic -- safe to run in both browser and Cloudflare Worker.
 */
import type {
  FingerprintData,
  NetworkInfo,
  NormalizedIdentity,
  NormalizedDevice,
  NormalizedNetwork,
  NormalizedBrowser,
  NormalizedEnvironment,
  ClientHintsData,
  NavigatorDeepDive,
} from '@/types';
import { detectBrowser, summarizeClientHints } from '@/lib/browser-detect';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function normalizeIdentity(
  fp: FingerprintData,
  net: NetworkInfo,
  timezone: string,
): NormalizedIdentity {
  return {
    device: normalizeDevice(fp),
    network: normalizeNetwork(net, timezone),
    browser: normalizeBrowser(fp.clientHints, fp.navigatorDeepDive),
    environment: normalizeEnvironment(fp),
  };
}

// ---------------------------------------------------------------------------
// DEVICE
// ---------------------------------------------------------------------------

function normalizeDevice(fp: FingerprintData): NormalizedDevice {
  return {
    osBucket: bucketOS(fp.clientHints, fp.navigatorDeepDive),
    cpuBucket: bucketCPU(fp.logicalProcessors),
    ramBucket: bucketRAM(fp.systemMemory),
    gpuBucket: bucketGPU(fp.gpu),
    screenClass: classifyScreen(fp),
  };
}

function bucketOS(
  ch: ClientHintsData | null | undefined,
  nav: NavigatorDeepDive | undefined,
): string {
  const he = ch?.highEntropy as Record<string, unknown> | null | undefined;
  const platform = ch?.platform ?? nav?.platform ?? '';
  const platformVersion =
    he && typeof he['platformVersion'] === 'string' ? he['platformVersion'] : '';

  const p = platform.toLowerCase();

  if (p === 'windows' || p.includes('win')) {
    if (platformVersion) {
      const major = parseInt(platformVersion.split('.')[0] ?? '', 10);
      if (Number.isFinite(major)) {
        if (major >= 13) return 'Windows 11';
        if (major >= 1) return 'Windows 10';
      }
    }
    return 'Windows';
  }
  if (p === 'macos' || p.includes('mac')) {
    if (platformVersion) {
      const major = platformVersion.split('.')[0];
      return `macOS ${major}`;
    }
    return 'macOS';
  }
  if (p === 'linux' || p.includes('linux')) return 'Linux';
  if (p === 'android') return 'Android';
  if (p === 'ios' || p.includes('iphone') || p.includes('ipad')) return 'iOS';
  if (p === 'chromeos' || p === 'chrome os') return 'ChromeOS';

  if (nav?.userAgent) {
    const ua = nav.userAgent;
    if (/Windows NT 10/i.test(ua)) return 'Windows 10';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X (\d+)[_.](\d+)/i.test(ua)) {
      const m = ua.match(/Mac OS X (\d+)/i);
      return m ? `macOS ${m[1]}` : 'macOS';
    }
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Linux/i.test(ua)) return 'Linux';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
  }

  return platform || 'Unknown';
}

function bucketCPU(cores: number | string): string {
  const n = typeof cores === 'number' ? cores : parseInt(String(cores), 10);
  if (!Number.isFinite(n) || n <= 0) return 'Unknown';
  if (n <= 2) return '1-2';
  if (n <= 4) return '3-4';
  if (n <= 8) return '5-8';
  return '9+';
}

function bucketRAM(mem: number | string): string {
  const n = typeof mem === 'number' ? mem : parseFloat(String(mem));
  if (!Number.isFinite(n) || n <= 0) return 'Unknown';
  if (n <= 4) return '4 GB';
  if (n <= 8) return '8 GB';
  if (n <= 16) return '16 GB';
  return '32 GB+';
}

function bucketGPU(gpu: string): string {
  if (!gpu || gpu === 'Blocked' || gpu === 'Generic / Virtual') return gpu || 'Unknown';

  const families: Array<[RegExp, string]> = [
    [/Apple\s+M\d/i, 'Apple M-series GPU'],
    [/Apple\s+GPU/i, 'Apple GPU'],
    [/NVIDIA\s+GeForce\s+((?:RTX|GTX)\s+\d{3,4}\s*\w*)/i, '$1'],
    [/GeForce\s+((?:RTX|GTX)\s+\d{3,4}\s*\w*)/i, '$1'],
    [/Radeon\s+(RX\s+\d{3,4}\s*\w*)/i, 'Radeon $1'],
    [/Radeon\s+([^\s(]+(?:\s+[^\s(]+)?)/i, 'Radeon $1'],
    [/Intel.*?UHD\s+(\d+)/i, 'Intel UHD $1'],
    [/Intel.*?Iris\s+(Xe|Plus|Pro)?\s*(\d*)/i, 'Intel Iris $1 $2'],
    [/Intel.*?HD\s+Graphics\s+(\d+)/i, 'Intel HD $1'],
    [/Intel.*?Arc\s+(\w+\d+)/i, 'Intel Arc $1'],
    [/Mali-(\w+)/i, 'Mali-$1'],
    [/Adreno.*?(\d+)/i, 'Adreno $1'],
    [/PowerVR\s+(\w+)/i, 'PowerVR $1'],
  ];

  for (const [re, rep] of families) {
    if (re.test(gpu)) {
      return gpu.replace(re, rep).replace(/\s{2,}/g, ' ').trim();
    }
  }

  return gpu.length > 60 ? gpu.slice(0, 60).trim() : gpu;
}

function classifyScreen(fp: FingerprintData): string {
  const g = fp.screenGeometry;
  const touch =
    fp.navigatorDeepDive?.maxTouchPoints ??
    0;
  const mobile = fp.clientHints?.mobile === true;
  const w = g?.screenWidth ?? 0;
  const h = g?.screenHeight ?? 0;
  const dpr = g?.devicePixelRatio ?? 1;
  const longer = Math.max(w, h);
  const shorter = Math.min(w, h);

  if (mobile || (touch > 0 && longer <= 900)) {
    return dpr >= 2.5 ? 'mobile-high-dpr' : 'mobile';
  }

  if (touch > 0 && longer > 900 && longer <= 1400) {
    return 'tablet';
  }

  if (touch > 0 && longer > 1400) {
    return 'laptop-touch';
  }

  if (shorter >= 1440 || longer >= 2560) return 'desktop-large';
  if (shorter >= 900) return 'desktop-mid';
  return 'desktop-mid / scaled';
}

// ---------------------------------------------------------------------------
// NETWORK
// ---------------------------------------------------------------------------

function normalizeNetwork(net: NetworkInfo, timezone: string): NormalizedNetwork {
  return {
    ipVersion: net.ip.includes(':') ? 'IPv6' : 'IPv4',
    asn: net.asn != null ? `${net.asn}${net.organization ? ` (${net.organization})` : ''}` : 'Unknown',
    isp: net.isp || 'Unknown',
    countryRegion: formatCountryRegion(net),
    timezoneConsistency: assessTimezoneConsistency(timezone, net),
  };
}

function formatCountryRegion(net: NetworkInfo): string {
  const code = net.countryCode ?? '';
  const region = net.region ?? '';
  if (code && region) return `${code}/${region}`;
  if (code) return code;
  if (net.country && net.country !== 'Unknown') return net.country;
  return 'Unknown';
}

const TIMEZONE_COUNTRY_MAP: Record<string, string[]> = {
  US: ['America/'],
  CA: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Montreal'],
  GB: ['Europe/London'],
  DE: ['Europe/Berlin'],
  FR: ['Europe/Paris'],
  JP: ['Asia/Tokyo'],
  AU: ['Australia/'],
  IN: ['Asia/Kolkata', 'Asia/Calcutta'],
  BR: ['America/Sao_Paulo', 'America/Fortaleza', 'America/Manaus'],
  CN: ['Asia/Shanghai', 'Asia/Chongqing'],
};

function assessTimezoneConsistency(timezone: string, net: NetworkInfo): string {
  if (!timezone || !net.countryCode) return 'unknown';

  const code = net.countryCode.toUpperCase();
  const prefixes = TIMEZONE_COUNTRY_MAP[code];

  if (!prefixes) return 'plausible';

  for (const p of prefixes) {
    if (timezone.startsWith(p) || timezone === p) return 'consistent';
  }

  const continent = timezone.split('/')[0];
  const countryContinent = prefixes[0]?.split('/')[0];
  if (continent && countryContinent && continent === countryContinent) return 'plausible';

  return 'inconsistent';
}

// ---------------------------------------------------------------------------
// BROWSER
// ---------------------------------------------------------------------------

function normalizeBrowser(
  ch: ClientHintsData | null | undefined,
  nav: NavigatorDeepDive | undefined,
): NormalizedBrowser {
  const info = detectBrowser(ch, nav);
  return {
    family: info.family,
    engine: info.engine,
    majorVersionBucket: info.majorVersion,
    clientHintsSummary: summarizeClientHints(ch, nav),
  };
}

// ---------------------------------------------------------------------------
// ENVIRONMENT
// ---------------------------------------------------------------------------

function normalizeEnvironment(fp: FingerprintData): NormalizedEnvironment {
  return {
    viewportBucket: bucketViewport(fp),
    dprBucket: bucketDPR(fp),
    canvasHash: String(fp.advancedCanvasHash ?? fp.environmentHash ?? 'Unknown'),
    webglHash: String(fp.advancedWebGLHash ?? 'Unknown'),
    audioHash: String(fp.enhancedAudioHash ?? fp.audioSignature ?? 'Unknown'),
    languageSet: normalizeLanguages(fp.navigatorDeepDive?.languages),
    storageQuotaBucket: bucketStorage(fp.storageEstimate),
  };
}

function bucketViewport(fp: FingerprintData): string {
  const g = fp.screenGeometry;
  if (!g) return 'Unknown';
  const w = roundTo(g.innerWidth, 16);
  const h = roundTo(g.innerHeight, 16);
  return `${w} × ${h}`;
}

function bucketDPR(fp: FingerprintData): string {
  const d = fp.screenGeometry?.devicePixelRatio;
  if (d == null || !Number.isFinite(d)) return 'Unknown';
  return (Math.round(d * 10) / 10).toFixed(1);
}

function normalizeLanguages(langs: string[] | undefined): string {
  if (!langs?.length) return 'Unknown';
  return [...new Set(langs)].join(', ');
}

function bucketStorage(estimate: string | undefined): string {
  if (!estimate || estimate === '—') return 'Unknown';
  const m = estimate.match(/([\d.]+)\s*GiB/i);
  if (!m) return estimate;
  const gb = parseFloat(m[1]!);
  if (!Number.isFinite(gb)) return estimate;
  if (gb <= 5) return '5 GiB';
  if (gb <= 10) return '10 GiB';
  if (gb <= 20) return '20 GiB';
  return '20 GiB+';
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
