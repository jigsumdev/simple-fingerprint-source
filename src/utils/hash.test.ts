import { describe, expect, it } from 'vitest';
import { canonicalize, generateFingerprintId, sha256Hex } from '@/utils/hash';

describe('canonicalize', () => {
  it('sorts object keys for stable serialization', () => {
    const a = canonicalize({ z: 1, a: { y: 2, b: 3 } });
    expect(a).toEqual({ a: { b: 3, y: 2 }, z: 1 });
  });
});

describe('sha256Hex', () => {
  it('matches known empty digest', async () => {
    const hex = await sha256Hex('');
    expect(hex).toBe('E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
  });
});

describe('generateFingerprintId', () => {
  it('is stable for the same inputs', async () => {
    const payload = { a: 1, b: 'x' };
    const first = await generateFingerprintId('v', payload);
    const second = await generateFingerprintId('v', payload);
    expect(first.primaryId).toBe(second.primaryId);
    expect(first.legacyDisplayHash).toBe(second.legacyDisplayHash);
  });

  it('differs when key order changes in raw object but matches after canonicalize', async () => {
    const id1 = await generateFingerprintId({ a: 1, b: 2 });
    const id2 = await generateFingerprintId({ b: 2, a: 1 });
    expect(id1.primaryId).toBe(id2.primaryId);
  });
});
