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
  isPreview?: boolean;
  serverTime?: string;
}

/**
 * Pure computation of the Display stage snapshot from Postgres rows.
 * Filters quota and pool calculations strictly by `event.test_mode`.
 */
export function computeDisplayStatePayload(input: ComputeDisplayStateInput): DisplayStatePayload {
  const { event, prizes, draws, excludedTickets, isPreview = false, serverTime = new Date().toISOString() } = input;

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

  const validTicketsRemaining = calculateValidTicketCount(
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

  const [prizesRes, drawsRes, excludedRes] = await Promise.all([
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
      .select('ticket')
      .eq('event_id', activeEvent.id),
  ]);

  if (prizesRes.error) {
    throw new Error(`Không thể tải danh sách giải thưởng: ${prizesRes.error.message}`);
  }
  if (drawsRes.error) {
    throw new Error(`Không thể tải lịch sử lượt quay: ${drawsRes.error.message}`);
  }
  if (excludedRes.error) {
    throw new Error(`Không thể tải danh sách vé loại trừ: ${excludedRes.error.message}`);
  }

  const excludedTickets = (excludedRes.data ?? []).map((row: { ticket: number }) => row.ticket);

  return computeDisplayStatePayload({
    event: activeEvent,
    prizes: (prizesRes.data ?? []) as Prize[],
    draws: (drawsRes.data ?? []) as Draw[],
    excludedTickets,
    isPreview,
  });
}
