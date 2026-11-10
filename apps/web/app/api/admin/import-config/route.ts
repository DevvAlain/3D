import { NextResponse } from 'next/server';
import { EventConfigImportSchema, EventSchema, type Event } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:import-config', auth.actor.user.id, 10, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = EventConfigImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Tệp cấu hình JSON không đúng định dạng.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { event: eventData, prizes, excluded_tickets } = parsed.data;

    // Validate cross-field invariants (digits vs range_to, range_from vs range_to)
    const eventValidation = EventSchema.safeParse({
      ...eventData,
      is_active: false,
      status: 'draft',
    });
    if (!eventValidation.success) {
      const firstIssue = eventValidation.error.issues[0]?.message ?? 'Thông số dải số không hợp lệ.';
      return NextResponse.json(
        { error: firstIssue, details: eventValidation.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();

    // Always import as an inactive draft event so live events are never disrupted automatically.
    const { data: createdEvent, error: createErr } = await admin
      .from('events')
      .insert({
        title: eventData.title,
        parish_name: eventData.parish_name,
        digits: eventData.digits,
        range_from: eventData.range_from,
        range_to: eventData.range_to,
        theme: eventData.theme,
        primary_color: eventData.primary_color,
        test_mode: true,
        is_active: false,
        status: 'draft',
      })
      .select('*')
      .single<Event>();

    if (createErr || !createdEvent?.id) {
      return rpcErrorResponse(createErr ?? new Error('Không thể tạo sự kiện mới từ cấu hình.'));
    }

    const newEventId = createdEvent.id;

    try {
      if (prizes.length > 0) {
        const prizeRows = prizes.map((p) => ({
          event_id: newEventId,
          name: p.name,
          reward: p.reward,
          quantity: p.quantity,
          sort_order: p.sort_order,
        }));
        const { error: prizeErr } = await admin.from('prizes').insert(prizeRows);
        if (prizeErr) throw prizeErr;
      }

      const uniqueTicketsMap = new Map<number, string | null>();
      for (const item of excluded_tickets) {
        if (item.ticket >= eventData.range_from && item.ticket <= eventData.range_to) {
          if (!uniqueTicketsMap.has(item.ticket)) {
            uniqueTicketsMap.set(item.ticket, item.reason ?? null);
          }
        }
      }

      const excludedRows = Array.from(uniqueTicketsMap.entries()).map(([ticket, reason]) => ({
        event_id: newEventId,
        ticket,
        reason,
      }));

      if (excludedRows.length > 0) {
        const { error: excErr } = await admin.from('excluded_tickets').insert(excludedRows);
        if (excErr) throw excErr;
      }

      return NextResponse.json(
        {
          success: true,
          event: createdEvent,
          importedPrizes: prizes.length,
          importedExcludedTickets: excludedRows.length,
        },
        { status: 201 }
      );
    } catch (nestedErr) {
      // Roll back created draft event if child rows fail
      await admin.from('events').delete().eq('id', newEventId);
      return rpcErrorResponse(nestedErr);
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Nội dung JSON không hợp lệ.' }, { status: 400 });
    }
    return rpcErrorResponse(err);
  }
}
