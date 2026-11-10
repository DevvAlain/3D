/**
 * Generates a cryptographically secure random integer in [0, max) using rejection sampling.
 * Eliminates modulo bias completely.
 * Matches the PostgreSQL crypto_random_int implementation and works across Node & Web runtimes.
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
  const buf = new Uint32Array(1);

  while (true) {
    globalThis.crypto.getRandomValues(buf);
    const rand = buf[0]!;

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
