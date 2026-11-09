import { describe, it, expect } from 'vitest';
import {
  formatTicket,
  parsePastedTickets,
  calculateValidTicketCount,
  getValidTicketPool,
} from '../src/helpers';

describe('Ticket Formatting Helpers', () => {
  it('pads numbers with leading zeros up to the configured digits', () => {
    expect(formatTicket(5, 5)).toBe('00005');
    expect(formatTicket(42, 5)).toBe('00042');
    expect(formatTicket(1234, 5)).toBe('01234');
    expect(formatTicket(12345, 5)).toBe('12345');
    expect(formatTicket(7, 3)).toBe('007');
    expect(formatTicket(999, 3)).toBe('999');
    expect(formatTicket(0, 4)).toBe('0000');
  });

  it('throws an error for negative tickets', () => {
    expect(() => formatTicket(-1, 5)).toThrowError(/negative/);
  });
});

describe('parsePastedTickets', () => {
  it('parses comma-separated numbers', () => {
    const input = '101, 202, 303, 404';
    expect(parsePastedTickets(input)).toEqual([101, 202, 303, 404]);
  });

  it('parses newline-separated numbers with whitespace and tabs', () => {
    const input = `
      100
      200
      \t 300\t
      400
    `;
    expect(parsePastedTickets(input)).toEqual([100, 200, 300, 400]);
  });

  it('deduplicates and sorts parsed tickets', () => {
    const input = '50, 10, 50, 30, 10, 20';
    expect(parsePastedTickets(input)).toEqual([10, 20, 30, 50]);
  });

  it('ignores invalid non-numeric strings and empty entries', () => {
    const input = '10, abc, 20, #!$, 30, ,,, , 40';
    expect(parsePastedTickets(input)).toEqual([10, 20, 30, 40]);
  });

  it('handles empty or blank input', () => {
    expect(parsePastedTickets('')).toEqual([]);
    expect(parsePastedTickets('   ')).toEqual([]);
  });
});

describe('calculateValidTicketCount & getValidTicketPool', () => {
  it('calculates valid ticket count accurately', () => {
    const rangeFrom = 1;
    const rangeTo = 100; // total 100 tickets
    const excluded = [10, 20, 30]; // 3 tickets
    const used = [25, 50, 75]; // 3 tickets

    const count = calculateValidTicketCount(rangeFrom, rangeTo, excluded, used);
    expect(count).toBe(100 - 6); // 94 valid
  });

  it('ignores excluded numbers outside the range', () => {
    const rangeFrom = 10;
    const rangeTo = 20; // 11 tickets (10..20)
    const excluded = [5, 15, 25]; // only 15 is inside range
    const used = [12]; // 1 inside range

    const count = calculateValidTicketCount(rangeFrom, rangeTo, excluded, used);
    expect(count).toBe(11 - 2); // 9 valid
  });

  it('handles overlapping excluded and used tickets without double counting', () => {
    const rangeFrom = 1;
    const rangeTo = 10; // 10 tickets
    const excluded = [5];
    const used = [5, 6];

    const count = calculateValidTicketCount(rangeFrom, rangeTo, excluded, used);
    expect(count).toBe(10 - 2); // 5 and 6 excluded -> 8
  });

  it('returns valid ticket pool array correctly', () => {
    const rangeFrom = 1;
    const rangeTo = 5;
    const excluded = [2];
    const used = [4];

    const pool = getValidTicketPool(rangeFrom, rangeTo, excluded, used);
    expect(pool).toEqual([1, 3, 5]);
  });
});
