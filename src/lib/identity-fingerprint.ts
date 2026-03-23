/**
 * Generates two fingerprint tiers from a NormalizedIdentity:
 *   - core: stable anchor (device + browser + selected network/env)
 *   - extended: full environment detail on top of core
 *
 * Isomorphic -- uses Web Crypto (available in browser and Cloudflare Workers).
 */
import type { NormalizedIdentity } from '@/types';

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function sortedJSON(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}

/**
 * Core fingerprint: identity anchor built from stable, low-drift fields.
 *
 * Inputs (from the plan):
 *   DEVICE:   osBucket, cpuBucket, ramBucket, gpuBucket
 *   BROWSER:  family, engine, majorVersionBucket
 *   NETWORK:  asn, countryRegion, timezoneConsistency
 *   ENV:      languageSet, storageQuotaBucket
 */
export async function generateCoreFingerprint(n: NormalizedIdentity): Promise<string> {
  const payload = sortedJSON({
    os: n.device.osBucket,
    cpu: n.device.cpuBucket,
    ram: n.device.ramBucket,
    gpu: n.device.gpuBucket,
    browserFamily: n.browser.family,
    engine: n.browser.engine,
    majorVersion: n.browser.majorVersionBucket,
    asn: n.network.asn,
    countryRegion: n.network.countryRegion,
    tzConsistency: n.network.timezoneConsistency,
    languages: n.environment.languageSet,
    storage: n.environment.storageQuotaBucket,
  });
  return sha256(`core-v1:${payload}`);
}

/**
 * Extended fingerprint: core fields + volatile environment signals.
 *
 * Additional inputs:
 *   screenClass, viewportBucket, dprBucket, canvasHash, webglHash,
 *   audioHash, clientHintsSummary
 */
export async function generateExtendedFingerprint(n: NormalizedIdentity): Promise<string> {
  const payload = sortedJSON({
    os: n.device.osBucket,
    cpu: n.device.cpuBucket,
    ram: n.device.ramBucket,
    gpu: n.device.gpuBucket,
    screenClass: n.device.screenClass,
    browserFamily: n.browser.family,
    engine: n.browser.engine,
    majorVersion: n.browser.majorVersionBucket,
    clientHints: n.browser.clientHintsSummary,
    asn: n.network.asn,
    countryRegion: n.network.countryRegion,
    tzConsistency: n.network.timezoneConsistency,
    viewport: n.environment.viewportBucket,
    dpr: n.environment.dprBucket,
    canvas: n.environment.canvasHash,
    webgl: n.environment.webglHash,
    audio: n.environment.audioHash,
    languages: n.environment.languageSet,
    storage: n.environment.storageQuotaBucket,
  });
  return sha256(`extended-v1:${payload}`);
}
