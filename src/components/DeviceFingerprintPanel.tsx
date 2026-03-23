import { useState } from 'react';
import { getPixelRatio, getTimezone } from '@/features/fingerprint/api/fingerprint';
import type { FingerprintData, NetworkInfo } from '@/types';

const EM = '\u2014';

function dash(v: unknown): string {
  if (v === null || v === undefined) return EM;
  if (typeof v === 'string' && v.trim() === '') return EM;
  if (typeof v === 'number' && !Number.isFinite(v)) return EM;
  return String(v);
}

function formatClientHints(ch: FingerprintData['clientHints']): string {
  if (!ch) return EM;
  try {
    return JSON.stringify({
      brands: ch.brands,
      mobile: ch.mobile,
      platform: ch.platform,
      highEntropy: ch.highEntropy,
    });
  } catch {
    return EM;
  }
}

function formatFonts(fonts: string[] | undefined): string {
  if (!fonts?.length) return EM;
  return fonts.join(', ');
}

function formatLocation(n: NetworkInfo | null): string {
  if (!n) return EM;
  const parts = [n.city, n.region].filter(Boolean);
  return parts.length ? parts.join(', ') : EM;
}

function formatJurisdiction(n: NetworkInfo | null): string {
  if (!n) return EM;
  const line =
    n.countryCode && n.countryCode !== n.country
      ? `${n.country} (${n.countryCode})`
      : n.country;
  return line || EM;
}

function formatAsn(n: NetworkInfo | null): string {
  if (!n || n.asn == null) return EM;
  return n.organization ? `${n.asn} (${n.organization})` : String(n.asn);
}

function screenResolution(fp: FingerprintData | null): string {
  const g = fp?.screenGeometry;
  if (g) return `${g.screenWidth} × ${g.screenHeight}`;
  if (typeof window !== 'undefined') return `${window.screen.width} × ${window.screen.height}`;
  return EM;
}

function getDeviceLabel(fp: FingerprintData | null): string {
  const touch =
    fp?.navigatorDeepDive?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);
  const mobileHint =
    fp?.clientHints?.mobile === true ||
    (typeof navigator !== 'undefined' && navigator.userAgentData?.mobile === true);
  if ((touch ?? 0) > 0 || mobileHint) return 'Mobile';
  return 'Computer';
}

function mapWindowsVersion(platformVersion: string): string | null {
  const parts = platformVersion.split('.');
  const major = Number.parseInt(parts[0] ?? '', 10);
  if (!Number.isFinite(major)) return null;
  if (major >= 13) return 'Windows 11';
  if (major >= 1) return 'Windows 10';
  const minor = Number.parseInt(parts[1] ?? '', 10);
  if (minor === 3) return 'Windows 8.1';
  if (minor === 2) return 'Windows 8';
  if (minor === 1) return 'Windows 7';
  return null;
}

function formatOS(fp: FingerprintData | null): string {
  if (!fp) return EM;
  const he = fp.clientHints?.highEntropy as Record<string, unknown> | undefined | null;
  const plat = fp.clientHints?.platform ?? fp.navigatorDeepDive?.platform;
  const pv = he && typeof he['platformVersion'] === 'string' ? he['platformVersion'] : '';
  if (plat === 'Windows' && pv) {
    const mapped = mapWindowsVersion(pv);
    if (mapped) return mapped;
  }
  if (plat && pv) return `${plat} ${pv}`.trim();
  if (plat) return plat;
  return dash(fp.navigatorDeepDive?.platform);
}

function formatEntropy(fp: FingerprintData | null): string {
  if (!fp) return EM;
  return `${fp.entropy.digestBits}-bit digest, ${fp.entropy.contributingSignals} signal groups`;
}

function pageLoadMs(fp: FingerprintData | null): string {
  const t = fp?.scanTimingsMs?.total;
  if (t == null || !Number.isFinite(t)) return EM;
  return `${t} ms`;
}

function formatRam(fp: FingerprintData | null): string {
  if (!fp) return EM;
  const m = fp.systemMemory;
  if (typeof m === 'number') return `~${m} GB`;
  return dash(m);
}

function pixelDensity(fp: FingerprintData | null): string {
  const d = fp?.screenGeometry?.devicePixelRatio;
  if (d != null && Number.isFinite(d)) return String(d);
  return String(getPixelRatio());
}

function viewportOuter(fp: FingerprintData | null): string {
  const g = fp?.screenGeometry;
  if (g) return `${g.outerWidth} × ${g.outerHeight}`;
  if (typeof window !== 'undefined') return `${window.outerWidth} × ${window.outerHeight}`;
  return EM;
}

function viewportInner(fp: FingerprintData | null): string {
  const g = fp?.screenGeometry;
  if (g) return `${g.innerWidth} × ${g.innerHeight}`;
  if (typeof window !== 'undefined') return `${window.innerWidth} × ${window.innerHeight}`;
  return EM;
}

function colorDepthLine(fp: FingerprintData | null): string {
  const d = fp?.screenGeometry?.colorDepth;
  if (d != null && Number.isFinite(d)) return `${d} bits`;
  if (typeof window !== 'undefined' && window.screen?.colorDepth != null) {
    return `${window.screen.colorDepth} bits`;
  }
  return EM;
}

function botDetection(fp: FingerprintData | null): string {
  if (!fp) return EM;
  return fp.automationFlag ? 'True' : 'False';
}

function touchscreenLine(fp: FingerprintData | null): string {
  const n = fp?.navigatorDeepDive?.maxTouchPoints ?? navigator.maxTouchPoints ?? 0;
  return n > 0 ? 'Yes' : 'No';
}

function ipLabel(ip: string | undefined): string {
  if (!ip) return 'IP Address';
  return ip.includes(':') ? 'IP Address (IPv6)' : 'IP Address (IPv4)';
}

interface DeviceFingerprintPanelProps {
  network: NetworkInfo | null;
  fingerprint: FingerprintData | null;
  loadingNetwork: boolean;
  loadingFingerprint: boolean;
}

export function DeviceFingerprintPanel({
  network,
  fingerprint,
  loadingNetwork,
  loadingFingerprint,
}: DeviceFingerprintPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const fpReady = !loadingFingerprint && fingerprint != null;
  const netReady = !loadingNetwork && network != null;

  if (!expanded) {
    return (
      <div className="fingerprint-panel">
        <div>
          <button type="button" onClick={() => setExpanded(true)}>
            Expand
          </button>
        </div>

        <div><strong>Fingerprint:</strong> {fpReady ? dash(fingerprint!.legacyDisplayHash) : EM}</div>
        <div><strong>{ipLabel(network?.ip)}:</strong> {netReady ? dash(network!.ip) : EM}</div>
        <div><strong>City:</strong> {formatLocation(network)}</div>
        <div><strong>Country:</strong> {formatJurisdiction(network)}</div>
        <div><strong>Internet Provider:</strong> {netReady ? dash(network!.isp) : EM}</div>
        <div><strong>Graphics Card:</strong> {fpReady ? dash(fingerprint!.gpu) : EM}</div>
        <div><strong>Screen Resolution:</strong> {screenResolution(fingerprint)}</div>
        <div><strong>Operating System:</strong> {formatOS(fingerprint)}</div>
        <div><strong>Timezone:</strong> {getTimezone()}</div>
        <div><strong>Touchscreen:</strong> {fpReady ? touchscreenLine(fingerprint) : EM}</div>
        <div><strong>Languages:</strong> {fingerprint?.navigatorDeepDive?.languages?.length ? fingerprint.navigatorDeepDive.languages.join(', ') : EM}</div>
      </div>
    );
  }

  const fp = fingerprint;

  return (
    <div className="fingerprint-panel fingerprint-panel--expanded">
      <div>
        <button type="button" onClick={() => setExpanded(false)}>
          Collapse
        </button>
      </div>

      <div><strong>Fingerprint:</strong> {fpReady ? dash(fp!.legacyDisplayHash) : EM}</div>
      <div><strong>Device ID (SHA-256):</strong> {fpReady ? dash(fp!.primaryId) : EM}</div>
      <div><strong>Audio Signature:</strong> {fpReady ? dash(fp!.audioSignature) : EM}</div>
      <div><strong>Bot Detection:</strong> {botDetection(fp)}</div>
      <div><strong>Entropy:</strong> {formatEntropy(fp)}</div>
      <div><strong>Page Load:</strong> {pageLoadMs(fp)}</div>

      <div><strong>{ipLabel(network?.ip)}:</strong> {netReady ? dash(network!.ip) : EM}</div>
      <div><strong>City:</strong> {formatLocation(network)}</div>
      <div><strong>Country:</strong> {formatJurisdiction(network)}</div>
      <div><strong>Internet Provider:</strong> {netReady ? dash(network!.isp) : EM}</div>
      <div><strong>Network ID (ASN):</strong> {formatAsn(network)}</div>

      <div><strong>Graphics Card:</strong> {fpReady ? dash(fp!.gpu) : EM}</div>
      <div><strong>GPU Fingerprint:</strong> {fpReady ? dash(fp!.advancedWebGLHash) : EM}</div>
      <div><strong>CPU Cores:</strong> {fpReady ? dash(fp!.logicalProcessors) : EM}</div>
      <div><strong>RAM:</strong> {formatRam(fp)}</div>
      <div><strong>Screen Resolution:</strong> {screenResolution(fp)}</div>
      <div><strong>Pixel Density:</strong> {fpReady ? pixelDensity(fp) : EM}</div>
      <div><strong>Viewport (Outer):</strong> {viewportOuter(fp)}</div>
      <div><strong>Viewport (Inner):</strong> {viewportInner(fp)}</div>
      <div><strong>Color Depth:</strong> {colorDepthLine(fp)}</div>

      <div><strong>Canvas Signature:</strong> {fpReady ? dash(fp!.environmentHash) : EM}</div>
      <div><strong>WebGL Hash:</strong> {fpReady ? dash(fp!.advancedWebGLHash) : EM}</div>
      <div><strong>Extended Canvas Probe:</strong> {fpReady ? dash(fp!.canvasExtendedProbe) : EM}</div>
      <div><strong>Audio Fingerprint:</strong> {fpReady ? dash(fp!.audioSignature) : EM}</div>
      <div><strong>Enhanced Audio Hash:</strong> {fpReady ? dash(fp!.enhancedAudioHash) : EM}</div>
      <div><strong>Operating System:</strong> {formatOS(fp)}</div>
      <div><strong>Timezone:</strong> {getTimezone()}</div>
      <div><strong>Storage:</strong> {fpReady ? dash(fp!.storageEstimate) : EM}</div>
      <div><strong>Touchscreen:</strong> {fpReady ? touchscreenLine(fp) : EM}</div>
      <div>
        <strong>Languages:</strong>{' '}
        {fp?.navigatorDeepDive?.languages?.length ? fp.navigatorDeepDive.languages.join(', ') : EM}
      </div>
      <div><strong>Client Hints:</strong> {formatClientHints(fp?.clientHints ?? null)}</div>
      <div><strong>Installed Fonts:</strong> {formatFonts(fp?.detectedFonts)}</div>
      <div><strong>User Agent:</strong> {fp?.navigatorDeepDive?.userAgent ? fp.navigatorDeepDive.userAgent : EM}</div>
    </div>
  );
}
