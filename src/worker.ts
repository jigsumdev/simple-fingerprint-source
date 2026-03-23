import { normalizeIdentity } from '@/lib/normalize';
import { generateCoreFingerprint, generateExtendedFingerprint } from '@/lib/identity-fingerprint';
import { compareIdentities, buildMatchResult } from '@/lib/comparison';
import type {
  FingerprintData,
  NetworkInfo,
  NormalizedIdentity,
  ObservationPayload,
  ObservationResponse,
  Classification,
} from '@/types';

interface Env {
  DB: D1Database;
}

interface CfProperties {
  city?: string;
  region?: string;
  regionCode?: string;
  country?: string;
  asn?: number;
  asOrganization?: string;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// GeoIP handler (unchanged from original)
// ---------------------------------------------------------------------------

function countryName(code: string | undefined): string {
  if (!code) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function handleGeoip(request: Request): Response {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'Unknown';

  const cf = (request as unknown as { cf?: CfProperties }).cf;
  const code = cf?.country;

  return Response.json({
    ip,
    city: cf?.city || 'Unknown',
    region: cf?.region || '',
    country: countryName(code),
    countryCode: code || undefined,
    isp: cf?.asOrganization || 'Unknown',
    asn: cf?.asn,
    organization: cf?.asOrganization || undefined,
    status: 'Verified',
    source: 'Cloudflare (edge)',
  }, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ---------------------------------------------------------------------------
// Observation API
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function jsonHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}

async function handlePostObservation(request: Request, env: Env): Promise<Response> {
  let payload: ObservationPayload;
  try {
    payload = await request.json() as ObservationPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: jsonHeaders() });
  }

  if (!payload.fingerprint || !payload.network) {
    return new Response(JSON.stringify({ error: 'Missing fingerprint or network data' }), { status: 400, headers: jsonHeaders() });
  }

  const fp = payload.fingerprint as FingerprintData;
  const net = payload.network as NetworkInfo;
  const timezone = payload.timezone || '';

  const normalized = normalizeIdentity(fp, net, timezone);
  const [coreFP, extendedFP] = await Promise.all([
    generateCoreFingerprint(normalized),
    generateExtendedFingerprint(normalized),
  ]);

  const observationId = uuid();
  const createdAt = nowISO();

  const rawJson = JSON.stringify({ fingerprint: fp, network: net, timezone });
  const normalizedJson = JSON.stringify(normalized);

  // --- Cluster matching ---
  const matchResult = await matchAndCluster(env.DB, normalized, coreFP, observationId, createdAt, normalizedJson);

  // --- Store observation ---
  await env.DB.prepare(
    `INSERT INTO observations (observation_id, created_at, raw_json, normalized_json, core_fingerprint, extended_fingerprint, matched_cluster_id, comparison_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    observationId,
    createdAt,
    rawJson,
    normalizedJson,
    coreFP,
    extendedFP,
    matchResult.matchedClusterId,
    JSON.stringify(matchResult),
  ).run();

  const response: ObservationResponse = {
    observationId,
    normalized,
    coreFingerprint: coreFP,
    extendedFingerprint: extendedFP,
    match: matchResult,
  };

  return new Response(JSON.stringify(response), { status: 201, headers: jsonHeaders() });
}

// ---------------------------------------------------------------------------
// Cluster matching + management
// ---------------------------------------------------------------------------

interface ClusterRow {
  cluster_id: string;
  first_seen_at: string;
  last_seen_at: string;
  latest_core_fingerprint: string;
  representative_normalized_json: string;
  observation_count: number;
  confidence_level: string;
}

async function matchAndCluster(
  db: D1Database,
  normalized: NormalizedIdentity,
  coreFP: string,
  observationId: string,
  createdAt: string,
  normalizedJson: string,
): Promise<ReturnType<typeof buildMatchResult>> {

  // 1. Exact core fingerprint match
  const exactRows = await db.prepare(
    `SELECT * FROM identity_clusters WHERE latest_core_fingerprint = ? ORDER BY last_seen_at DESC LIMIT 5`
  ).bind(coreFP).all<ClusterRow>();

  if (exactRows.results.length > 0) {
    const cluster = exactRows.results[0]!;
    const priorNorm = JSON.parse(cluster.representative_normalized_json) as NormalizedIdentity;
    const comparison = compareIdentities(normalized, priorNorm);

    await updateCluster(db, cluster.cluster_id, observationId, coreFP, normalizedJson, createdAt, comparison.scores.overall, comparison.classification);

    return buildMatchResult(
      comparison,
      cluster.cluster_id,
      cluster.last_seen_at,
      cluster.observation_count + 1,
    );
  }

  // 2. Near-match: search recent clusters and compare
  const recentRows = await db.prepare(
    `SELECT * FROM identity_clusters ORDER BY last_seen_at DESC LIMIT 50`
  ).all<ClusterRow>();

  let bestMatch: { cluster: ClusterRow; comparison: ReturnType<typeof compareIdentities> } | null = null;
  let bestScore = 0;

  for (const cluster of recentRows.results) {
    const priorNorm = JSON.parse(cluster.representative_normalized_json) as NormalizedIdentity;
    const comparison = compareIdentities(normalized, priorNorm);
    if (comparison.scores.overall > bestScore && comparison.scores.overall >= 0.45) {
      bestScore = comparison.scores.overall;
      bestMatch = { cluster, comparison };
    }
  }

  if (bestMatch) {
    const { cluster, comparison } = bestMatch;
    await updateCluster(db, cluster.cluster_id, observationId, coreFP, normalizedJson, createdAt, comparison.scores.overall, comparison.classification);

    return buildMatchResult(
      comparison,
      cluster.cluster_id,
      cluster.last_seen_at,
      cluster.observation_count + 1,
    );
  }

  // 3. No match -- create new cluster
  const clusterId = uuid();
  await db.prepare(
    `INSERT INTO identity_clusters (cluster_id, first_seen_at, last_seen_at, latest_core_fingerprint, representative_normalized_json, observation_count, confidence_level)
     VALUES (?, ?, ?, ?, ?, 1, 'low')`
  ).bind(clusterId, createdAt, createdAt, coreFP, normalizedJson).run();

  await db.prepare(
    `INSERT INTO cluster_membership (cluster_id, observation_id, match_score, classification)
     VALUES (?, ?, ?, ?)`
  ).bind(clusterId, observationId, 1.0, 'initial baseline' satisfies Classification).run();

  return buildMatchResult(null, clusterId, null, 1);
}

async function updateCluster(
  db: D1Database,
  clusterId: string,
  observationId: string,
  coreFP: string,
  normalizedJson: string,
  createdAt: string,
  matchScore: number,
  classification: Classification,
): Promise<void> {
  const newConfidence = matchScore >= 0.75 ? 'high' : matchScore >= 0.55 ? 'medium' : 'low';

  await db.batch([
    db.prepare(
      `UPDATE identity_clusters
       SET last_seen_at = ?, latest_core_fingerprint = ?, representative_normalized_json = ?,
           observation_count = observation_count + 1, confidence_level = ?
       WHERE cluster_id = ?`
    ).bind(createdAt, coreFP, normalizedJson, newConfidence, clusterId),
    db.prepare(
      `INSERT INTO cluster_membership (cluster_id, observation_id, match_score, classification)
       VALUES (?, ?, ?, ?)`
    ).bind(clusterId, observationId, matchScore, classification),
  ]);
}

// ---------------------------------------------------------------------------
// GET endpoints
// ---------------------------------------------------------------------------

async function handleGetObservation(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT * FROM observations WHERE observation_id = ?`
  ).bind(id).first();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders() });
  }

  return new Response(JSON.stringify(row), { headers: jsonHeaders() });
}

async function handleGetObservationsByFingerprint(coreFP: string, env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT observation_id, created_at, core_fingerprint, extended_fingerprint, matched_cluster_id
     FROM observations WHERE core_fingerprint = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(coreFP).all();

  return new Response(JSON.stringify(rows.results), { headers: jsonHeaders() });
}

async function handleGetCluster(id: string, env: Env): Promise<Response> {
  const cluster = await env.DB.prepare(
    `SELECT * FROM identity_clusters WHERE cluster_id = ?`
  ).bind(id).first();

  if (!cluster) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders() });
  }

  const members = await env.DB.prepare(
    `SELECT cm.observation_id, cm.match_score, cm.classification, o.created_at
     FROM cluster_membership cm
     JOIN observations o ON o.observation_id = cm.observation_id
     WHERE cm.cluster_id = ?
     ORDER BY o.created_at DESC LIMIT 100`
  ).bind(id).all();

  return new Response(JSON.stringify({ cluster, observations: members.results }), { headers: jsonHeaders() });
}

// ---------------------------------------------------------------------------
// Privacy / retention
// ---------------------------------------------------------------------------

async function handleGetPrivacy(): Promise<Response> {
  return new Response(JSON.stringify({
    stored: [
      'Raw scan signals (fingerprint, network, timezone)',
      'Normalized identity summary',
      'Core and extended fingerprint hashes (SHA-256)',
      'Cluster membership and match scores',
    ],
    retention: {
      raw_observations: '90 days',
      normalized_records: 'rolling, tied to cluster lifetime',
      ip_addresses: 'Hashed after 30 days in raw storage',
    },
    comparison: 'Weighted scoring across device (40%), network (20%), browser (20%), environment (20%) signals',
    note: 'Fingerprints are deterministic hashes of normalized signals; they are environment-sensitive and may change with browser updates, viewport changes, or hardware swaps.',
  }), { headers: jsonHeaders() });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/api/geoip' && method === 'GET') {
      return handleGeoip(request);
    }

    if (path === '/api/observations' && method === 'POST') {
      return handlePostObservation(request, env);
    }

    if (path === '/api/observations' && method === 'GET') {
      const coreFP = url.searchParams.get('core_fingerprint');
      if (coreFP) {
        return handleGetObservationsByFingerprint(coreFP, env);
      }
      return new Response(JSON.stringify({ error: 'Missing core_fingerprint query param' }), { status: 400, headers: jsonHeaders() });
    }

    if (path.startsWith('/api/observations/') && method === 'GET') {
      const id = path.slice('/api/observations/'.length);
      return handleGetObservation(id, env);
    }

    if (path.startsWith('/api/clusters/') && method === 'GET') {
      const id = path.slice('/api/clusters/'.length);
      return handleGetCluster(id, env);
    }

    if (path === '/api/privacy' && method === 'GET') {
      return handleGetPrivacy();
    }

    return new Response(null, { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runRetentionCleanup(env.DB);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Retention cleanup (runs daily via Cron Trigger)
// ---------------------------------------------------------------------------

async function hashIPInPayload(rawJson: string): Promise<string> {
  try {
    const data = JSON.parse(rawJson) as { network?: { ip?: string } };
    if (data.network?.ip && !data.network.ip.startsWith('sha256:')) {
      const enc = new TextEncoder().encode(data.network.ip);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      data.network.ip = `sha256:${hex}`;
      return JSON.stringify(data);
    }
  } catch {
    /* leave unchanged if parse fails */
  }
  return rawJson;
}

async function runRetentionCleanup(db: D1Database): Promise<void> {
  const now = new Date();

  // 1. Hash IPs older than 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ipRows = await db.prepare(
    `SELECT observation_id, raw_json FROM observations WHERE created_at < ? LIMIT 200`
  ).bind(thirtyDaysAgo).all<{ observation_id: string; raw_json: string }>();

  for (const row of ipRows.results) {
    const updated = await hashIPInPayload(row.raw_json);
    if (updated !== row.raw_json) {
      await db.prepare(
        `UPDATE observations SET raw_json = ? WHERE observation_id = ?`
      ).bind(updated, row.observation_id).run();
    }
  }

  // 2. Delete raw observations older than 90 days
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    `DELETE FROM cluster_membership WHERE observation_id IN (
       SELECT observation_id FROM observations WHERE created_at < ?
     )`
  ).bind(ninetyDaysAgo).run();

  await db.prepare(
    `DELETE FROM observations WHERE created_at < ?`
  ).bind(ninetyDaysAgo).run();

  // 3. Clean up orphaned clusters (no remaining members)
  await db.prepare(
    `DELETE FROM identity_clusters WHERE cluster_id NOT IN (
       SELECT DISTINCT cluster_id FROM cluster_membership
     )`
  ).run();
}
