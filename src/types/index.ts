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

export interface ScanOptions {
  /** Skip WebRTC and high-entropy client hints */
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// Normalized identity layer
// ---------------------------------------------------------------------------

export interface NormalizedDevice {
  osBucket: string;
  cpuBucket: string;
  ramBucket: string;
  gpuBucket: string;
  screenClass: string;
}

export interface NormalizedNetwork {
  ipVersion: string;
  asn: string;
  isp: string;
  countryRegion: string;
  timezoneConsistency: string;
}

export interface NormalizedBrowser {
  family: string;
  engine: string;
  majorVersionBucket: string;
  clientHintsSummary: string;
}

export interface NormalizedEnvironment {
  viewportBucket: string;
  dprBucket: string;
  canvasHash: string;
  webglHash: string;
  audioHash: string;
  languageSet: string;
  storageQuotaBucket: string;
}

export interface NormalizedIdentity {
  device: NormalizedDevice;
  network: NormalizedNetwork;
  browser: NormalizedBrowser;
  environment: NormalizedEnvironment;
}

// ---------------------------------------------------------------------------
// Classification / matching
// ---------------------------------------------------------------------------

export type Classification =
  | 'same device, same browser'
  | 'same device, same browser, environment changed'
  | 'same device, different browser'
  | 'same device likely, network changed'
  | 'insufficient confidence'
  | 'different device likely'
  | 'initial baseline';

export interface MatchResult {
  classification: Classification;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchedClusterId: string | null;
  matchScore: number;
  lastSeen: string | null;
  observationCount: number;
  changedFields: string[];
  unchangedFields: string[];
}

// ---------------------------------------------------------------------------
// Observation / cluster persistence records
// ---------------------------------------------------------------------------

export interface ObservationRecord {
  observationId: string;
  createdAt: string;
  rawJson: string;
  normalizedJson: string;
  coreFingerprint: string;
  extendedFingerprint: string;
  matchedClusterId: string | null;
  comparisonJson: string | null;
}

export interface IdentityCluster {
  clusterId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  latestCoreFingerprint: string;
  representativeNormalizedJson: string;
  observationCount: number;
  confidenceLevel: string;
}

export interface ClusterMembership {
  clusterId: string;
  observationId: string;
  matchScore: number;
  classification: Classification;
}

/** Payload the client POSTs to /api/observations */
export interface ObservationPayload {
  fingerprint: FingerprintData;
  network: NetworkInfo;
  timezone: string;
}

/** Response from POST /api/observations */
export interface ObservationResponse {
  observationId: string;
  normalized: NormalizedIdentity;
  coreFingerprint: string;
  extendedFingerprint: string;
  match: MatchResult;
}

// Combined Application State (extended)
export interface AppState {
  network: NetworkInfo | null;
  fingerprint: FingerprintData | null;
  normalized: NormalizedIdentity | null;
  matchResult: MatchResult | null;
  observationId: string | null;
  coreFingerprint: string | null;
  extendedFingerprint: string | null;
  loadingNetwork: boolean;
  loadingFingerprint: boolean;
  error: string | null;
}
