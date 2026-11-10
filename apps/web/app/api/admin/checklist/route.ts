import { NextResponse } from 'next/server';
import { calculateValidTicketCount, type Draw, type Event, type Prize } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { ChecklistPresenterAccount, ChecklistServerData } from '@/lib/checklist';

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

    const [{ data: eventsData, error: eventsErr }, usersRes] = await Promise.all([
      admin
        .from('events')
        .select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false }),
      admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
    ]);

    if (eventsErr) {
      return NextResponse.json({ error: eventsErr.message }, { status: 500 });
    }

    const events = (eventsData ?? []) as Event[];
    const activeEvent = events.find((e) => e.is_active) ?? null;
    const targetEvent =
      (requestedEventId ? events.find((e) => e.id === requestedEventId) : null) ??
      activeEvent ??
      events[0] ??
      null;

    const presenterUsers: ChecklistPresenterAccount[] = (usersRes.data?.users ?? [])
      .filter((u) => u.app_metadata?.role === 'presenter')
      .map((u) => ({
        id: u.id,
        email: u.email ?? '(không có email)',
        last_sign_in_at: u.last_sign_in_at ?? null,
      }));

    if (!targetEvent?.id) {
      const emptyPayload: ChecklistServerData = {
        generatedAt: new Date().toISOString(),
        activeEvent,
        targetEvent: null,
        prizes: [],
        totalPoolSize: 0,
        excludedInRangeCount: 0,
        validInitialPool: 0,
        totalPrizeQuantity: 0,
        quotaExceedsPool: false,
        testDrawsCount: 0,
        realDrawsCount: 0,
        presenterUsers,
      };
      return NextResponse.json(emptyPayload, { headers: { 'Cache-Control': 'no-store' } });
    }

    const [prizesRes, excludedRes, drawsRes] = await Promise.all([
      admin
        .from('prizes')
        .select('*')
        .eq('event_id', targetEvent.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      admin
        .from('excluded_tickets')
        .select('ticket')
        .eq('event_id', targetEvent.id)
        .gte('ticket', targetEvent.range_from)
        .lte('ticket', targetEvent.range_to),
      admin
        .from('draws')
        .select('id, is_test, status')
        .eq('event_id', targetEvent.id),
    ]);

    if (prizesRes.error || excludedRes.error || drawsRes.error) {
      const msg =
        prizesRes.error?.message ||
        excludedRes.error?.message ||
        drawsRes.error?.message ||
        'Không thể tải dữ liệu kiểm tra trước sự kiện.';
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const prizes = (prizesRes.data ?? []) as Prize[];
    const excludedInRange = (excludedRes.data ?? []).map((row) => Number(row.ticket));
    const draws = (drawsRes.data ?? []) as Pick<Draw, 'id' | 'is_test' | 'status'>[];

    const testDrawsCount = draws.filter((d) => d.is_test).length;
    const realDrawsCount = draws.filter((d) => !d.is_test).length;

    const totalPoolSize =
      targetEvent.range_to >= targetEvent.range_from
        ? targetEvent.range_to - targetEvent.range_from + 1
        : 0;
    const validInitialPool = calculateValidTicketCount(
      targetEvent.range_from,
      targetEvent.range_to,
      excludedInRange,
      []
    );
    const totalPrizeQuantity = prizes.reduce((acc, p) => acc + p.quantity, 0);

    const payload: ChecklistServerData = {
      generatedAt: new Date().toISOString(),
      activeEvent,
      targetEvent,
      prizes,
      totalPoolSize,
      excludedInRangeCount: excludedInRange.length,
      validInitialPool,
      totalPrizeQuantity,
      quotaExceedsPool: totalPrizeQuantity > validInitialPool,
      testDrawsCount,
      realDrawsCount,
      presenterUsers,
    };

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
