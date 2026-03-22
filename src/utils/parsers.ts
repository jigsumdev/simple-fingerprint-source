/**
 * Parse Cloudflare cdn-cgi/trace body into key/value pairs (exported for tests).
 */
export function parseCloudflareTrace(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Extract host / IPv4 / IPv6 from an ICE candidate string (exported for tests).
 */
export function extractAddressesFromIceCandidate(candidate: string): string[] {
  const found: string[] = [];

  // IPv4
  const v4 = candidate.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g);
  if (v4) {
    for (const ip of v4) {
      if (ip !== '0.0.0.0') found.push(ip);
    }
  }

  // IPv6 (simplified — bracketed and unbracketed in candidate lines)
  const v6Bracket = candidate.match(/\[([0-9a-fA-F:]+)\]/g);
  if (v6Bracket) {
    for (const b of v6Bracket) {
      const inner = b.slice(1, -1);
      if (inner) found.push(inner);
    }
  }

  // typ host ... candidate:... <ip> ... (hostnames for mDNS)
  const hostMatch = candidate.match(/\s+host\s+([^\s]+)/i);
  if (hostMatch?.[1] && !hostMatch[1].includes(':')) {
    found.push(hostMatch[1]);
  }

  return [...new Set(found)];
}
