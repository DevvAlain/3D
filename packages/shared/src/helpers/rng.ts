import crypto from 'node:crypto';

/**
 * Generates a cryptographically secure random integer in [0, max) using rejection sampling.
 * Eliminates modulo bias completely.
 * Matches the PostgreSQL crypto_random_int implementation.
 */
export function cryptoRandomInt(max: number): number {
  if (max <= 0) {
    throw new Error(`cryptoRandomInt: max must be positive, got ${max}`);
  }
  if (max === 1) {
    return 0;
  }

  // 32-bit limit
  const cM = 0x100000000; // 4294967296 (2^32)
  const limit = cM - (cM % max);

  while (true) {
    const buffer = crypto.randomBytes(4);
    const rand = buffer.readUInt32BE(0);

    // Rejection sampling: discard values in the biased remainder tail
    if (rand < limit) {
      return rand % max;
    }
  }
}

/**
 * Simulates drawing the k-th valid ticket uniformly without modulo bias.
 */
export function pickRandomTicketFromPool(pool: readonly number[]): number {
  if (pool.length === 0) {
    throw new Error('Cannot pick from an empty ticket pool');
  }
  const index = cryptoRandomInt(pool.length);
  return pool[index];
}
