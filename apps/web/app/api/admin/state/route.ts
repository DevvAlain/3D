import { NextResponse } from 'next/server';
import {
  calculateValidTicketCount,
  type AuditLog,
  type Draw,
  type Event,
  type ExcludedTicket,
  type Prize,
} from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { AdminPrizeWithStats, AdminStatePayload } from '@/lib/admin-types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const url = new URL(req.url);
    const requestedEventId = url.searchParams.get('event_id');
    const admin = createAdminSupabaseClient();

    const { data: eventsData, error: eventsErr } = await admin
      .from('events')
      .select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });

    if (eventsErr) {
      return NextResponse.json({ error: eventsErr.message }, { status: 500 });
    }

    const events = (eventsData ?? []) as Event[];
    const selectedEvent =
      (requestedEventId ? events.find((e) => e.id === requestedEventId) : null) ??
      events.find((e) => e.is_active) ??
      events[0] ??
      null;

    if (!selectedEvent?.id) {
      const emptyPayload: AdminStatePayload = {
        events,
        selectedEvent: null,
        prizes: [],
        excludedTickets: [],
        draws: [],
        auditLogs: [],
        locks: { hasRealDraws: false, realDrawsCount: 0, testDrawsCount: 0 },
        poolStats: {
          totalPoolSize: 0,
          excludedInRangeCount: 0,
          validTicketsRemaining: 0,
          totalPrizeQuantity: 0,
          quotaExceedsPool: false,
        },
      };
      return NextResponse.json(emptyPayload, { headers: { 'Cache-Control': 'no-store' } });
    }

    const [prizesRes, excludedRes, drawsRes, logsRes] = await Promise.all([
      admin
        .from('prizes')
        .select('*')
        .eq('event_id', selectedEvent.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      admin
        .from('excluded_tickets')
        .select('*')
        .eq('event_id', selectedEvent.id)
        .order('ticket', { ascending: true }),
      admin
        .from('draws')
        .select('*')
        .eq('event_id', selectedEvent.id)
        .order('seq', { ascending: false }),
      admin
        .from('audit_logs')
        .select('*')
        .eq('event_id', selectedEvent.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (prizesRes.error || excludedRes.error || drawsRes.error || logsRes.error) {
      const msg =
        prizesRes.error?.message ||
        excludedRes.error?.message ||
        drawsRes.error?.message ||
        logsRes.error?.message ||
        'Lỗi tải dữ liệu sự kiện.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rawPrizes = (prizesRes.data ?? []) as Prize[];
    const excludedTickets = (excludedRes.data ?? []) as ExcludedTicket[];
    const rawDraws = (drawsRes.data ?? []) as Draw[];
    const auditLogs = (logsRes.data ?? []) as AuditLog[];

    const prizeMap = new Map<string, Prize>();
    for (const p of rawPrizes) {
      if (p.id) prizeMap.set(p.id, p);
    }

    const draws = rawDraws.map((d) => ({
      ...d,
      prize: prizeMap.get(d.prize_id),
    }));

    let realDrawsCount = 0;
    let testDrawsCount = 0;
    for (const d of rawDraws) {
      if (d.is_test) testDrawsCount += 1;
      else realDrawsCount += 1;
    }

    const prizes: AdminPrizeWithStats[] = rawPrizes.map((p) => {
      let nonVoidReal = 0;
      let nonVoidMode = 0;
      let wonMode = 0;
      let totalForPrize = 0;
      for (const d of rawDraws) {
        if (d.prize_id !== p.id) continue;
        totalForPrize += 1;
        if (!d.is_test && d.status !== 'void') nonVoidReal += 1;
        if (d.is_test === selectedEvent.test_mode && d.status !== 'void') nonVoidMode += 1;
        if (d.is_test === selectedEvent.test_mode && d.status === 'won') wonMode += 1;
      }
      return {
        ...p,
        non_void_real_count: nonVoidReal,
        non_void_mode_count: nonVoidMode,
        min_allowed_quantity: Math.max(nonVoidReal, nonVoidMode, 1),
        won_mode_count: wonMode,
        total_draws_count: totalForPrize,
      };
    });

    const excludedInRange = excludedTickets
      .map((et) => et.ticket)
      .filter((t) => t >= selectedEvent.range_from && t <= selectedEvent.range_to);

    const usedInCurrentMode = rawDraws
      .filter(
        (d) =>
          d.is_test === selectedEvent.test_mode &&
          (d.status === 'revealing' || d.status === 'won' || d.status === 'absent')
      )
      .map((d) => d.ticket);

    const totalPoolSize =
      selectedEvent.range_to >= selectedEvent.range_from
        ? selectedEvent.range_to - selectedEvent.range_from + 1
        : 0;

    const validTicketsRemaining = calculateValidTicketCount(
      selectedEvent.range_from,
      selectedEvent.range_to,
      excludedInRange,
      usedInCurrentMode
    );

    const totalPrizeQuantity = rawPrizes.reduce((acc, p) => acc + p.quantity, 0);
    // Note: available capacity for prizes before any draws = totalPoolSize - excludedInRange.length
    const totalInitialValidPool = Math.max(0, totalPoolSize - new Set(excludedInRange).size);

    const payload: AdminStatePayload = {
      events,
      selectedEvent,
      prizes,
      excludedTickets,
      draws,
      auditLogs,
      locks: {
        hasRealDraws: realDrawsCount > 0,
        realDrawsCount,
        testDrawsCount,
      },
      poolStats: {
        totalPoolSize,
        excludedInRangeCount: excludedInRange.length,
        validTicketsRemaining,
        totalPrizeQuantity,
        quotaExceedsPool: totalPrizeQuantity > totalInitialValidPool,
      },
    };

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
