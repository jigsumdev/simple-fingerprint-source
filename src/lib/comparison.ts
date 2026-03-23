/**
 * Weighted comparison engine.
 *
 * Compares a new NormalizedIdentity against a prior one and returns
 * a composite score, per-section scores, and a classification.
 */
import type {
  NormalizedIdentity,
  NormalizedDevice,
  NormalizedNetwork,
  NormalizedBrowser,
  NormalizedEnvironment,
  Classification,
  MatchResult,
} from '@/types';

// ---------------------------------------------------------------------------
// Section weights (must sum to 1.0)
// ---------------------------------------------------------------------------
const W_DEVICE = 0.40;
const W_NETWORK = 0.20;
const W_BROWSER = 0.20;
const W_ENVIRONMENT = 0.20;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const DEVICE_HIGH = 0.70;
const BROWSER_HIGH = 0.60;
const NETWORK_OK = 0.30;
const ENVIRONMENT_MOSTLY = 0.55;
const ENVIRONMENT_PARTIAL = 0.30;
const OVERALL_MATCH = 0.55;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SectionScores {
  device: number;
  network: number;
  browser: number;
  environment: number;
  overall: number;
}

export interface ComparisonResult {
  scores: SectionScores;
  classification: Classification;
  confidence: 'high' | 'medium' | 'low';
  changedFields: string[];
  unchangedFields: string[];
}

export function compareIdentities(
  current: NormalizedIdentity,
  prior: NormalizedIdentity,
): ComparisonResult {
  const deviceResult = scoreDevice(current.device, prior.device);
  const networkResult = scoreNetwork(current.network, prior.network);
  const browserResult = scoreBrowser(current.browser, prior.browser);
  const envResult = scoreEnvironment(current.environment, prior.environment);

  const overall =
    deviceResult.score * W_DEVICE +
    networkResult.score * W_NETWORK +
    browserResult.score * W_BROWSER +
    envResult.score * W_ENVIRONMENT;

  const changedFields = [
    ...deviceResult.changed,
    ...networkResult.changed,
    ...browserResult.changed,
    ...envResult.changed,
  ];
  const unchangedFields = [
    ...deviceResult.unchanged,
    ...networkResult.unchanged,
    ...browserResult.unchanged,
    ...envResult.unchanged,
  ];

  const classification = classify(
    deviceResult.score,
    networkResult.score,
    browserResult.score,
    envResult.score,
    current.browser.family !== prior.browser.family,
  );

  const confidence = overall >= 0.75 ? 'high' : overall >= OVERALL_MATCH ? 'medium' : 'low';

  return {
    scores: {
      device: deviceResult.score,
      network: networkResult.score,
      browser: browserResult.score,
      environment: envResult.score,
      overall,
    },
    classification,
    confidence,
    changedFields,
    unchangedFields,
  };
}

/**
 * Build a full MatchResult from the comparison against the best prior cluster.
 */
export function buildMatchResult(
  comparison: ComparisonResult | null,
  clusterId: string | null,
  lastSeen: string | null,
  observationCount: number,
): MatchResult {
  if (!comparison) {
    return {
      classification: 'initial baseline',
      confidence: 'none',
      matchedClusterId: null,
      matchScore: 0,
      lastSeen: null,
      observationCount: 0,
      changedFields: [],
      unchangedFields: [],
    };
  }
  return {
    classification: comparison.classification,
    confidence: comparison.confidence,
    matchedClusterId: clusterId,
    matchScore: comparison.scores.overall,
    lastSeen,
    observationCount,
    changedFields: comparison.changedFields,
    unchangedFields: comparison.unchangedFields,
  };
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

function classify(
  deviceScore: number,
  networkScore: number,
  browserScore: number,
  envScore: number,
  browserFamilyDiffers: boolean,
): Classification {
  const deviceHigh = deviceScore >= DEVICE_HIGH;
  const browserHigh = browserScore >= BROWSER_HIGH;
  const networkNotBad = networkScore >= NETWORK_OK;
  const envHigh = envScore >= ENVIRONMENT_MOSTLY;
  const envPartial = envScore >= ENVIRONMENT_PARTIAL;

  if (deviceHigh && browserFamilyDiffers && networkNotBad) {
    return 'same device, different browser';
  }

  if (deviceHigh && browserHigh && envHigh && networkNotBad) {
    return 'same device, same browser';
  }

  if (deviceHigh && browserHigh && envPartial) {
    return 'same device, same browser, environment changed';
  }

  if (deviceHigh && browserHigh && !networkNotBad) {
    return 'same device likely, network changed';
  }

  if (deviceHigh && !browserHigh && networkNotBad) {
    return 'same device, different browser';
  }

  if (!deviceHigh) {
    return 'different device likely';
  }

  return 'insufficient confidence';
}

// ---------------------------------------------------------------------------
// Section scoring helpers
// ---------------------------------------------------------------------------

interface SectionResult {
  score: number;
  changed: string[];
  unchanged: string[];
}

function eq(a: string, b: string, label: string, out: SectionResult): number {
  if (a === b) {
    out.unchanged.push(label);
    return 1;
  }
  out.changed.push(label);
  return 0;
}

function scoreDevice(a: NormalizedDevice, b: NormalizedDevice): SectionResult {
  const r: SectionResult = { score: 0, changed: [], unchanged: [] };
  const fields = [
    eq(a.osBucket, b.osBucket, 'OS', r),
    eq(a.cpuBucket, b.cpuBucket, 'CPU cores', r),
    eq(a.ramBucket, b.ramBucket, 'RAM', r),
    eq(a.gpuBucket, b.gpuBucket, 'GPU', r),
    eq(a.screenClass, b.screenClass, 'screen class', r),
  ];
  r.score = fields.reduce((s, v) => s + v, 0) / fields.length;
  return r;
}

function scoreNetwork(a: NormalizedNetwork, b: NormalizedNetwork): SectionResult {
  const r: SectionResult = { score: 0, changed: [], unchanged: [] };
  const fields = [
    eq(a.ipVersion, b.ipVersion, 'IP version', r),
    eq(a.asn, b.asn, 'ASN', r),
    eq(a.isp, b.isp, 'ISP', r),
    eq(a.countryRegion, b.countryRegion, 'country/region', r),
    eq(a.timezoneConsistency, b.timezoneConsistency, 'timezone consistency', r),
  ];
  r.score = fields.reduce((s, v) => s + v, 0) / fields.length;
  return r;
}

function scoreBrowser(a: NormalizedBrowser, b: NormalizedBrowser): SectionResult {
  const r: SectionResult = { score: 0, changed: [], unchanged: [] };
  const fields = [
    eq(a.family, b.family, 'browser family', r),
    eq(a.engine, b.engine, 'engine', r),
    eq(a.majorVersionBucket, b.majorVersionBucket, 'browser version', r),
    eq(a.clientHintsSummary, b.clientHintsSummary, 'client hints summary', r),
  ];
  r.score = fields.reduce((s, v) => s + v, 0) / fields.length;
  return r;
}

function scoreEnvironment(a: NormalizedEnvironment, b: NormalizedEnvironment): SectionResult {
  const r: SectionResult = { score: 0, changed: [], unchanged: [] };
  const fields = [
    eq(a.viewportBucket, b.viewportBucket, 'viewport', r),
    eq(a.dprBucket, b.dprBucket, 'DPR', r),
    eq(a.canvasHash, b.canvasHash, 'canvas hash', r),
    eq(a.webglHash, b.webglHash, 'WebGL hash', r),
    eq(a.audioHash, b.audioHash, 'audio hash', r),
    eq(a.languageSet, b.languageSet, 'languages', r),
    eq(a.storageQuotaBucket, b.storageQuotaBucket, 'storage quota', r),
  ];
  r.score = fields.reduce((s, v) => s + v, 0) / fields.length;
  return r;
}
