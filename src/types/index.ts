// Network Intelligence Types
export interface NetworkInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  status: 'Verified' | 'Partial (Fallback)' | 'Restricted';
  source: string;
  /** ISO 3166-1 alpha-2 when known (e.g. GeoLite2) */
  countryCode?: string;
  /** BGP ASN when known */
  asn?: number;
  organization?: string;
}

export interface ScreenWindowDifference {
  widthDiff: number;
  heightDiff: number;
}

/** Window / screen geometry used for fingerprint display */
export interface ScreenGeometry {
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  pixelDepth: number;
  devicePixelRatio: number;
  screenX: number;
  screenY: number;
  windowDifference: ScreenWindowDifference;
}

export interface MediaCapabilities {
  videoCodecs: string[];
  audioCodecs: string[];
  mediaSourceSupported?: boolean;
}

export interface NavigatorDeepDive {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number | undefined;
  deviceMemory: number | undefined;
  maxTouchPoints: number | undefined;
  vendor: string;
  language: string;
  languages: string[];
  onLine: boolean;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  plugins: string[];
}

/** User-Agent Client Hints (high-entropy may be omitted in strict mode) */
export interface ClientHintsData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
  highEntropy?: Record<string, unknown> | null;
}

export interface EntropyMetadata {
  /** Bits in the SHA-256 digest */
  digestBits: number;
  /** Number of signal groups merged into the digest */
  contributingSignals: number;
  /** Honest note about population uniqueness */
  cohortNote: string;
}

export interface ScanTimingsMs {
  network?: number;
  syncSignals?: number;
  /** Parallel async bundle (audio, media, WebRTC, client hints) */
  parallelAsync?: number;
  total?: number;
}

// Fingerprint Types
export interface FingerprintData {
  primaryId: string;
  legacyDisplayHash: string;
  environmentHash: string | number;
  audioSignature: string | number;
  gpu: string;
  logicalProcessors: number | string;
  systemMemory: number | string;
  automationFlag: boolean;
  entropy: EntropyMetadata;
  advancedCanvasHash?: string | number;
  canvasExtendedProbe?: string | number;
  advancedWebGLHash?: string | number;
  detectedFonts?: string[];
  enhancedAudioHash?: string | number;
  automationFlags?: Record<string, boolean>;
  screenGeometry?: ScreenGeometry;
  mediaCapabilities?: MediaCapabilities;
  webrtcIps?: string[];
  navigatorDeepDive?: NavigatorDeepDive;
  clientHints?: ClientHintsData | null;
  /** Scan timings (total used for Page Load in UI) */
  scanTimingsMs?: ScanTimingsMs;
  /** Storage quota label from `navigator.storage.estimate` */
  storageEstimate?: string;
}

// Combined Application State
export interface AppState {
  network: NetworkInfo | null;
  fingerprint: FingerprintData | null;
  loadingNetwork: boolean;
  loadingFingerprint: boolean;
  error: string | null;
}

export interface ScanOptions {
  /** Skip WebRTC and high-entropy client hints */
  strict?: boolean;
}
