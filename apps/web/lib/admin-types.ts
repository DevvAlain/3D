import type { AuditLog, Draw, Event, ExcludedTicket, Prize } from '@church/shared';

export interface AdminPrizeWithStats extends Prize {
  non_void_real_count: number;
  non_void_mode_count: number;
  min_allowed_quantity: number;
  won_mode_count: number;
  total_draws_count: number;
}

export interface AdminStatePayload {
  events: Event[];
  selectedEvent: Event | null;
  prizes: AdminPrizeWithStats[];
  excludedTickets: ExcludedTicket[];
  draws: Array<Draw & { prize?: Prize }>;
  auditLogs: AuditLog[];
  locks: {
    hasRealDraws: boolean;
    realDrawsCount: number;
    testDrawsCount: number;
  };
  poolStats: {
    totalPoolSize: number;
    excludedInRangeCount: number;
    validTicketsRemaining: number;
    totalPrizeQuantity: number;
    quotaExceedsPool: boolean;
  };
}
