import { useState } from 'react';
import { getPixelRatio, getTimezone } from '@/features/fingerprint/api/fingerprint';
import type { FingerprintData, NetworkInfo, NormalizedIdentity, MatchResult } from '@/types';

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeviceFingerprintPanelProps {
  network: NetworkInfo | null;
  fingerprint: FingerprintData | null;
  normalized: NormalizedIdentity | null;
  matchResult: MatchResult | null;
  loadingNetwork: boolean;
  loadingFingerprint: boolean;
}

// ---------------------------------------------------------------------------
// Match summary component
// ---------------------------------------------------------------------------

function MatchSummary({ match }: { match: MatchResult | null }) {
  if (!match) return null;

  return (
    <div className="match-summary">
      <h3>Match Summary</h3>
      <div><strong>Classification:</strong> {match.classification}</div>
      <div><strong>Confidence:</strong> {match.confidence}</div>
      {match.lastSeen && (
        <div><strong>Last seen:</strong> {match.lastSeen}</div>
      )}
      <div><strong>Observations in cluster:</strong> {match.observationCount}</div>
      {match.matchScore > 0 && (
        <div><strong>Match score:</strong> {(match.matchScore * 100).toFixed(1)}%</div>
      )}
      {match.changedFields.length > 0 && (
        <div><strong>Changed:</strong> {match.changedFields.join(', ')}</div>
      )}
      {match.unchangedFields.length > 0 && (
        <div><strong>Unchanged:</strong> {match.unchangedFields.join(', ')}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Normalized sections
// ---------------------------------------------------------------------------

function NormalizedView({ norm, fp }: { norm: NormalizedIdentity; fp: FingerprintData | null }) {
  return (
    <>
      <div className="section-block">
        <h3>Device</h3>
        <div><strong>OS:</strong> {norm.device.osBucket}</div>
        <div><strong>CPU Cores:</strong> {norm.device.cpuBucket}</div>
        <div><strong>RAM:</strong> {norm.device.ramBucket}</div>
        <div><strong>GPU:</strong> {norm.device.gpuBucket}</div>
        <div><strong>Screen Class:</strong> {norm.device.screenClass}</div>
      </div>

      <div className="section-block">
        <h3>Network</h3>
        <div><strong>IP Version:</strong> {norm.network.ipVersion}</div>
        <div><strong>ASN:</strong> {norm.network.asn}</div>
        <div><strong>ISP:</strong> {norm.network.isp}</div>
        <div><strong>Country/Region:</strong> {norm.network.countryRegion}</div>
        <div><strong>Timezone Consistency:</strong> {norm.network.timezoneConsistency}</div>
      </div>

      <div className="section-block">
        <h3>Browser</h3>
        <div><strong>Family:</strong> {norm.browser.family}</div>
        <div><strong>Engine:</strong> {norm.browser.engine}</div>
        <div><strong>Major Version:</strong> {norm.browser.majorVersionBucket}</div>
        <div><strong>Client Hints:</strong> {norm.browser.clientHintsSummary}</div>
      </div>

      <div className="section-block">
        <h3>Environment</h3>
        <div><strong>Viewport:</strong> {norm.environment.viewportBucket}</div>
        <div><strong>DPR:</strong> {norm.environment.dprBucket}</div>
        <div><strong>Canvas Hash:</strong> {norm.environment.canvasHash}</div>
        <div><strong>WebGL Hash:</strong> {norm.environment.webglHash}</div>
        <div><strong>Audio Hash:</strong> {norm.environment.audioHash}</div>
        <div><strong>Languages:</strong> {norm.environment.languageSet}</div>
        <div><strong>Storage Quota:</strong> {norm.environment.storageQuotaBucket}</div>
      </div>

      <div className="section-block">
        <h3>Fingerprint Metadata</h3>
        <div><strong>Hash algorithm:</strong> SHA-256</div>
        <div><strong>Signal groups:</strong> {fp?.entropy.contributingSignals ?? EM}</div>
        <div><strong>Estimated stability:</strong> medium-high</div>
        <div><strong>Estimated uniqueness:</strong> high</div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Expanded raw view (all original fields preserved)
// ---------------------------------------------------------------------------

function RawView({
  fp,
  network,
  fpReady,
  netReady,
}: {
  fp: FingerprintData | null;
  network: NetworkInfo | null;
  fpReady: boolean;
  netReady: boolean;
}) {
  return (
    <>
      <div><strong>Fingerprint:</strong> {fpReady ? dash(fp!.legacyDisplayHash) : EM}</div>
      <div><strong>Device ID (SHA-256):</strong> {fpReady ? dash(fp!.primaryId) : EM}</div>
      <div><strong>Audio Signature:</strong> {fpReady ? dash(fp!.audioSignature) : EM}</div>
      <div><strong>Bot Detection:</strong> {botDetection(fp)}</div>
      <div><strong>Entropy:</strong> {fp ? `${fp.entropy.digestBits}-bit digest, ${fp.entropy.contributingSignals} signal groups` : EM}</div>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function DeviceFingerprintPanel({
  network,
  fingerprint,
  normalized,
  matchResult,
  loadingNetwork,
  loadingFingerprint,
}: DeviceFingerprintPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const fpReady = !loadingFingerprint && fingerprint != null;
  const netReady = !loadingNetwork && network != null;

  if (!expanded) {
    return (
      <div className="fingerprint-panel">
        <div className="panel-controls">
          <button type="button" onClick={() => setExpanded(true)}>
            Expand raw data
          </button>
        </div>

        <MatchSummary match={matchResult} />

        {normalized ? (
          <NormalizedView norm={normalized} fp={fingerprint} />
        ) : (
          /* Fallback while waiting for backend response */
          <>
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
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fingerprint-panel fingerprint-panel--expanded">
      <div className="panel-controls">
        <button type="button" onClick={() => setExpanded(false)}>
          Collapse
        </button>
      </div>

      <MatchSummary match={matchResult} />

      <RawView fp={fingerprint} network={network} fpReady={fpReady} netReady={netReady} />
    </div>
  );
}
