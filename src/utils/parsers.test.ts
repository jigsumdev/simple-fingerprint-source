import { describe, expect, it } from 'vitest';
import { extractAddressesFromIceCandidate, parseCloudflareTrace } from '@/utils/parsers';

describe('parseCloudflareTrace', () => {
  it('parses key=value lines', () => {
    const text = `ip=203.0.113.1\nloc=US\n`;
    const m = parseCloudflareTrace(text);
    expect(m['ip']).toBe('203.0.113.1');
    expect(m['loc']).toBe('US');
  });
});

describe('extractAddressesFromIceCandidate', () => {
  it('extracts IPv4 from candidate string', () => {
    const c =
      'candidate:842163049 1 udp 2122260223 192.168.1.10 54321 typ host generation 0 ufrag abc';
    expect(extractAddressesFromIceCandidate(c)).toContain('192.168.1.10');
  });

  it('extracts bracketed IPv6', () => {
    const c = 'candidate:1 1 udp 1 [2001:db8::1] 1234 typ host';
    expect(extractAddressesFromIceCandidate(c)).toContain('2001:db8::1');
  });
});
