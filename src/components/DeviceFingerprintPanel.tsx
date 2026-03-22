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

function formatOS(fp: FingerprintData | null): string {
  if (!fp) return EM;
  const he = fp.clientHints?.highEntropy as Record<string, unknown> | undefined | null;
  const plat = fp.clientHints?.platform ?? fp.navigatorDeepDive?.platform;
  const pv = he && typeof he['platformVersion'] === 'string' ? he['platformVersion'] : '';
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

  const defaultFingerprint = fpReady ? dash(fingerprint!.legacyDisplayHash) : EM;
  const defaultIp = netReady ? dash(network!.ip) : EM;
  const defaultGpu = fpReady ? dash(fingerprint!.gpu) : EM;
  const defaultResolution = screenResolution(fingerprint);
  const defaultTz = getTimezone();
  const defaultDevice = getDeviceLabel(fingerprint);

  if (!expanded) {
    return (
      <div className="fingerprint-panel">
        <div>Fingerprint: {defaultFingerprint}</div>
        <div>IP Address: {defaultIp}</div>
        <div>Graphics Card: {defaultGpu}</div>
        <div>Screen Resolution: {defaultResolution}</div>
        <div>Timezone: {defaultTz}</div>
        <div>Device: {defaultDevice}</div>
        <div>
          <button type="button" onClick={() => setExpanded(true)}>
            Expand Details
          </button>
        </div>
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

      <div>Endpoint Integrity Profile</div>
      <div>Discover how your device is seen by the web.</div>

      <div>Unique Fingerprint: {fpReady ? dash(fp!.legacyDisplayHash) : EM}</div>
      <div>Device ID (SHA-256): {fpReady ? dash(fp!.primaryId) : EM}</div>
      <div>Audio Signature: {fpReady ? dash(fp!.audioSignature) : EM}</div>
      <div>Bot Detection: {botDetection(fp)}</div>
      <div>Entropy: {formatEntropy(fp)}</div>
      <div>Page Load: {pageLoadMs(fp)}</div>

      <div className="fingerprint-panel__section">Network</div>
      <div>IP Address: {netReady ? dash(network!.ip) : EM}</div>
      <div>Location: {formatLocation(network)}</div>
      <div>Jurisdiction: {formatJurisdiction(network)}</div>
      <div>Internet Provider: {netReady ? dash(network!.isp) : EM}</div>
      <div>Network ID (ASN): {formatAsn(network)}</div>
      <div>Location Source: {netReady ? dash(network!.source) : EM}</div>

      <div className="fingerprint-panel__section">Hardware</div>
      <div>Graphics Card: {fpReady ? dash(fp!.gpu) : EM}</div>
      <div>GPU Fingerprint: {fpReady ? dash(fp!.advancedWebGLHash) : EM}</div>
      <div>CPU Cores: {fpReady ? dash(fp!.logicalProcessors) : EM}</div>
      <div>RAM: {formatRam(fp)}</div>
      <div>Screen Resolution: {screenResolution(fp)}</div>
      <div>Pixel Density: {fpReady ? pixelDensity(fp) : EM}</div>
      <div>Viewport (Outer): {viewportOuter(fp)}</div>
      <div>Viewport (Inner): {viewportInner(fp)}</div>
      <div>Color Depth: {colorDepthLine(fp)}</div>

      <div className="fingerprint-panel__section">Browser & Environment</div>
      <div>Canvas Signature: {fpReady ? dash(fp!.environmentHash) : EM}</div>
      <div>WebGL Hash: {fpReady ? dash(fp!.advancedWebGLHash) : EM}</div>
      <div>Extended Canvas Probe: {fpReady ? dash(fp!.canvasExtendedProbe) : EM}</div>
      <div>Audio Fingerprint: {fpReady ? dash(fp!.audioSignature) : EM}</div>
      <div>Enhanced Audio Hash: {fpReady ? dash(fp!.enhancedAudioHash) : EM}</div>
      <div>Operating System: {formatOS(fp)}</div>
      <div>Timezone: {getTimezone()}</div>
      <div>Storage: {fpReady ? dash(fp!.storageEstimate) : EM}</div>
      <div>Touchscreen: {fpReady ? touchscreenLine(fp) : EM}</div>
      <div>Languages: {fp?.navigatorDeepDive?.languages?.length ? fp.navigatorDeepDive.languages.join(', ') : EM}</div>
      <div>Client Hints: {formatClientHints(fp?.clientHints ?? null)}</div>
      <div>Installed Fonts: {formatFonts(fp?.detectedFonts)}</div>
      <div>User Agent: {fp?.navigatorDeepDive?.userAgent ? fp.navigatorDeepDive.userAgent : EM}</div>

      <div>
        <button type="button" onClick={() => setExpanded(false)}>
          Collapse
        </button>
      </div>
    </div>
  );
}
