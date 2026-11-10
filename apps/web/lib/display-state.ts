import {
  calculateValidTicketCount,
  type DisplayStatePayload,
  type Draw,
  type DrawNextResult,
  type Event,
  type Prize,
  type PrizeProgress,
} from '@church/shared';
import { createAdminSupabaseClient } from './supabase/admin';

export interface ComputeDisplayStateInput {
  event: Event | null;
  prizes: Prize[];
  draws: Draw[];
  excludedTickets: number[];
  /**
   * Optional precomputed count of remaining valid tickets (avoids transferring/scanning
   * large excluded_tickets tables on every `/api/display/state` poll).
   */
  validTicketsRemainingOverride?: number;
  isPreview?: boolean;
  serverTime?: string;
}

/**
 * Pure computation of the Display stage snapshot from Postgres rows.
 * Filters quota and pool calculations strictly by `event.test_mode`.
 */
export function computeDisplayStatePayload(input: ComputeDisplayStateInput): DisplayStatePayload {
  const {
    event,
    prizes,
    draws,
    excludedTickets,
    validTicketsRemainingOverride,
    isPreview = false,
    serverTime = new Date().toISOString(),
  } = input;

  if (!event) {
    return {
      event: null,
      prizes: [],
      activePrize: null,
      currentDraw: null,
      latestDraw: null,
      wonDraws: [],
      allDrawsCount: 0,
      validTicketsRemaining: 0,
      totalPoolSize: 0,
      isAllPrizesCompleted: false,
      isPreview,
      serverTime,
    };
  }

  const orderedPrizes = [...prizes].sort((a, b) => a.sort_order - b.sort_order);
  const modeDraws = [...draws]
    .filter((d) => d.is_test === event.test_mode)
    .sort((a, b) => a.seq - b.seq);

  const prizeMap = new Map<string, Prize>();
  for (const p of orderedPrizes) {
    if (p.id) prizeMap.set(p.id, p);
  }

  const prizeProgress: PrizeProgress[] = orderedPrizes.map((prize) => {
    let wonCount = 0;
    let revealingCount = 0;
    for (const d of modeDraws) {
      if (d.prize_id !== prize.id) continue;
      if (d.status === 'won') wonCount += 1;
      else if (d.status === 'revealing') revealingCount += 1;
    }
    const remaining = Math.max(0, prize.quantity - (wonCount + revealingCount));
    return {
      ...prize,
      won_count: wonCount,
      revealing_count: revealingCount,
      remaining_count: remaining,
    };
  });

  const activePrize = prizeProgress.find((p) => p.remaining_count > 0) ?? null;

  const rawRevealing = modeDraws.find((d) => d.status === 'revealing') ?? null;
  const currentDraw = rawRevealing
    ? { ...rawRevealing, prize: prizeMap.get(rawRevealing.prize_id) }
    : null;

  const rawLatest = modeDraws.length > 0 ? modeDraws[modeDraws.length - 1] : null;
  const latestDraw = rawLatest
    ? { ...rawLatest, prize: prizeMap.get(rawLatest.prize_id) }
    : null;

  const wonDraws = modeDraws
    .filter((d) => d.status === 'won')
    .reverse()
    .map((d) => {
      const p = prizeMap.get(d.prize_id);
      return {
        ...d,
        prize_name: p?.name,
        prize_reward: p?.reward,
      };
    });

  const claimedTickets = modeDraws
    .filter((d) => d.status === 'revealing' || d.status === 'won' || d.status === 'absent')
    .map((d) => d.ticket);

  const validTicketsRemaining =
    validTicketsRemainingOverride !== undefined
      ? Math.max(0, validTicketsRemainingOverride)
      : calculateValidTicketCount(
          event.range_from,
          event.range_to,
          excludedTickets,
          claimedTickets
        );

  const totalPoolSize =
    event.range_to >= event.range_from ? event.range_to - event.range_from + 1 : 0;

  const isAllPrizesCompleted =
    prizeProgress.length > 0 &&
    prizeProgress.every((p) => p.won_count >= p.quantity) &&
    currentDraw === null;

  return {
    event,
    prizes: prizeProgress,
    activePrize,
    currentDraw,
    latestDraw,
    wonDraws,
    allDrawsCount: modeDraws.length,
    validTicketsRemaining,
    totalPoolSize,
    isAllPrizesCompleted,
    isPreview,
    serverTime,
  };
}

export interface DrawNextClientTransition {
  shouldAnimateReveal: boolean;
  shouldRestoreOnly: boolean;
  noticeMessage: string | null;
}

/**
 * Determines how the Display client responds to `POST /api/draw/next`.
 * Crucially, an idempotent hit when the draw is already finalized ('won', 'void', or 'absent')
 * MUST restore state cleanly instead of replaying the reveal animation.
 */
export function resolveDrawNextClientTransition(result: DrawNextResult): DrawNextClientTransition {
  if (result.is_idempotent && result.draw.status !== 'revealing') {
    const statusMessage =
      result.draw.status === 'won'
        ? 'Lượt quay này đã được xác nhận trúng thưởng trước đó — đã đồng bộ lại trạng thái.'
        : result.draw.status === 'void'
          ? 'Lượt quay này đã được hủy trước đó — đã đồng bộ lại trạng thái.'
          : 'Lượt quay này đã được đánh dấu vắng mặt trước đó — đã đồng bộ lại trạng thái.';

    return {
      shouldAnimateReveal: false,
      shouldRestoreOnly: true,
      noticeMessage: statusMessage,
    };
  }

  return {
    shouldAnimateReveal: true,
    shouldRestoreOnly: false,
    noticeMessage: result.is_idempotent ? 'Khôi phục lượt quay đang mở.' : null,
  };
}

/**
 * Loads the active event and full display payload using service_role on the server.
 * Presenter has zero direct DB privileges and obtains everything through this helper.
 *
 * Computes `validTicketsRemaining` using lightweight integer count queries
 * (`COUNT(*)` on `excluded_tickets` + claimed draws count), avoiding scanning
 * `generate_series` or transferring full `excluded_tickets` lists on every poll.
 */
export async function fetchActiveDisplayState(isPreview: boolean = false): Promise<DisplayStatePayload> {
  const admin = createAdminSupabaseClient();

  const { data: activeEvent, error: eventErr } = await admin
    .from('events')
    .select('*')
    .eq('is_active', true)
    .maybeSingle<Event>();

  if (eventErr) {
    throw new Error(`Không thể tải sự kiện đang kích hoạt: ${eventErr.message}`);
  }

  if (!activeEvent) {
    return computeDisplayStatePayload({
      event: null,
      prizes: [],
      draws: [],
      excludedTickets: [],
      isPreview,
    });
  }

  const [prizesRes, drawsRes, excludedCountRes] = await Promise.all([
    admin
      .from('prizes')
      .select('*')
      .eq('event_id', activeEvent.id)
      .order('sort_order', { ascending: true }),
    admin
      .from('draws')
      .select('*')
      .eq('event_id', activeEvent.id)
      .eq('is_test', activeEvent.test_mode)
      .order('seq', { ascending: true }),
    admin
      .from('excluded_tickets')
      .select('ticket', { count: 'exact', head: true })
      .eq('event_id', activeEvent.id)
      .gte('ticket', activeEvent.range_from)
      .lte('ticket', activeEvent.range_to),
  ]);

  if (prizesRes.error) {
    throw new Error(`Không thể tải danh sách giải thưởng: ${prizesRes.error.message}`);
  }
  if (drawsRes.error) {
    throw new Error(`Không thể tải lịch sử lượt quay: ${drawsRes.error.message}`);
  }
  if (excludedCountRes.error) {
    throw new Error(`Không thể đếm vé loại trừ: ${excludedCountRes.error.message}`);
  }

  const draws = (drawsRes.data ?? []) as Draw[];
  const claimedInRange = Array.from(
    new Set(
      draws
        .filter(
          (d) =>
            (d.status === 'revealing' || d.status === 'won' || d.status === 'absent') &&
            d.ticket >= activeEvent.range_from &&
            d.ticket <= activeEvent.range_to
        )
        .map((d) => d.ticket)
    )
  );

  // Usually 0 overlap because excluded tickets aren't drawn; subtract any post-draw exclusions safely.
  let overlapExcludedCount = 0;
  for (let i = 0; i < claimedInRange.length; i += 500) {
    const chunk = claimedInRange.slice(i, i + 500);
    const { count: overlapCount, error: overlapErr } = await admin
      .from('excluded_tickets')
      .select('ticket', { count: 'exact', head: true })
      .eq('event_id', activeEvent.id)
      .in('ticket', chunk);

    if (overlapErr) {
      throw new Error(`Không thể kiểm tra vé loại trừ trùng lặp: ${overlapErr.message}`);
    }
    overlapExcludedCount += overlapCount ?? 0;
  }

  const totalPoolSize =
    activeEvent.range_to >= activeEvent.range_from
      ? activeEvent.range_to - activeEvent.range_from + 1
      : 0;
  const excludedCount = excludedCountRes.count ?? 0;
  const validTicketsRemaining = Math.max(
    0,
    totalPoolSize - excludedCount - (claimedInRange.length - overlapExcludedCount)
  );

  return computeDisplayStatePayload({
    event: activeEvent,
    prizes: (prizesRes.data ?? []) as Prize[],
    draws,
    excludedTickets: [],
    validTicketsRemainingOverride: validTicketsRemaining,
    isPreview,
  });
}
