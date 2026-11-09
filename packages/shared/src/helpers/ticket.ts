/**
 * Formats a numeric ticket into a zero-padded string according to digits setting.
 * E.g., ticket 42 with 5 digits -> "00042"
 */
export function formatTicket(ticket: number, digits: number): string {
  if (ticket < 0) {
    throw new Error(`Ticket number cannot be negative: ${ticket}`);
  }
  return String(ticket).padStart(digits, '0');
}

/**
 * Parses raw text input pasted by admin (comma, space, newline, semicolon separated)
 * into a clean, deduplicated, sorted array of non-negative integer ticket numbers.
 */
export function parsePastedTickets(rawText: string): number[] {
  if (!rawText || typeof rawText !== 'string') {
    return [];
  }

  // Split by any non-digit character (commas, newlines, spaces, tabs, semicolons)
  const tokens = rawText.split(/[,\s;\n\r\t]+/);
  const resultSet = new Set<number>();

  for (const token of tokens) {
    const trimmed = token.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (!Number.isNaN(num) && num >= 0 && num <= Number.MAX_SAFE_INTEGER) {
        resultSet.add(num);
      }
    }
  }

  return Array.from(resultSet).sort((a, b) => a - b);
}

/**
 * Calculates the exact number of valid, drawable tickets in [rangeFrom, rangeTo],
 * excluding both cancelled tickets and already-drawn tickets.
 */
export function calculateValidTicketCount(
  rangeFrom: number,
  rangeTo: number,
  excludedTickets: Iterable<number>,
  usedTickets: Iterable<number>
): number {
  if (rangeFrom > rangeTo) {
    return 0;
  }

  const excludedSet = new Set<number>();
  for (const t of excludedTickets) {
    if (t >= rangeFrom && t <= rangeTo) {
      excludedSet.add(t);
    }
  }
  for (const t of usedTickets) {
    if (t >= rangeFrom && t <= rangeTo) {
      excludedSet.add(t);
    }
  }

  const totalRangeCount = rangeTo - rangeFrom + 1;
  return Math.max(0, totalRangeCount - excludedSet.size);
}

/**
 * Returns an array of valid drawable tickets (for client-side preview / simulation / test verification).
 */
export function getValidTicketPool(
  rangeFrom: number,
  rangeTo: number,
  excludedTickets: Iterable<number>,
  usedTickets: Iterable<number>
): number[] {
  if (rangeFrom > rangeTo) {
    return [];
  }

  const blocked = new Set<number>([...excludedTickets, ...usedTickets]);
  const pool: number[] = [];

  for (let num = rangeFrom; num <= rangeTo; num++) {
    if (!blocked.has(num)) {
      pool.push(num);
    }
  }

  return pool;
}
