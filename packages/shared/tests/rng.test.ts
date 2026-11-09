import { describe, it, expect } from 'vitest';
import { cryptoRandomInt, pickRandomTicketFromPool } from '../src/helpers/rng';

describe('CSPRNG with Rejection Sampling (cryptoRandomInt)', () => {
  it('returns 0 when max is 1', () => {
    expect(cryptoRandomInt(1)).toBe(0);
  });

  it('throws an error if max is <= 0', () => {
    expect(() => cryptoRandomInt(0)).toThrowError(/must be positive/);
    expect(() => cryptoRandomInt(-5)).toThrowError(/must be positive/);
  });

  it('always produces values strictly in range [0, max)', () => {
    const max = 17;
    for (let i = 0; i < 500; i++) {
      const val = cryptoRandomInt(max);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(max);
    }
  });

  it('demonstrates uniform distribution across buckets without modulo bias', () => {
    const buckets = 5;
    const samples = 10000;
    const counts = new Array<number>(buckets).fill(0);

    for (let i = 0; i < samples; i++) {
      const val = cryptoRandomInt(buckets);
      counts[val]++;
    }

    const expected = samples / buckets; // 2000 per bucket
    // Every bucket should be within 15% of expected in 10,000 samples (p < 0.0001 under uniform RNG)
    for (let i = 0; i < buckets; i++) {
      const diff = Math.abs(counts[i] - expected);
      expect(diff).toBeLessThan(expected * 0.15);
    }
  });

  it('picks random tickets exclusively from the given pool', () => {
    const pool = [101, 202, 303, 404, 505];
    const poolSet = new Set(pool);

    for (let i = 0; i < 100; i++) {
      const ticket = pickRandomTicketFromPool(pool);
      expect(poolSet.has(ticket)).toBe(true);
    }
  });

  it('throws when attempting to pick from an empty pool', () => {
    expect(() => pickRandomTicketFromPool([])).toThrowError(/empty ticket pool/);
  });
});
