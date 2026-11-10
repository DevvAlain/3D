import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BatchExcludedTicketsSchema, parsePastedTickets, type Event } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:excluded:add', auth.actor.user.id, 30, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = BatchExcludedTicketsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dữ liệu vé loại trừ không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const tickets = parsePastedTickets(parsed.data.raw_input);
    if (tickets.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy số vé hợp lệ nào trong nội dung đã dán.' },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, range_from, range_to')
      .eq('id', parsed.data.event_id)
      .maybeSingle<Pick<Event, 'id' | 'range_from' | 'range_to'>>();

    if (eventErr) return rpcErrorResponse(eventErr);
    if (!event) {
      return NextResponse.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
    }

    const inRangeTickets = tickets.filter((t) => t >= event.range_from && t <= event.range_to);
    const outOfRangeTickets = tickets.filter((t) => t < event.range_from || t > event.range_to);

    if (inRangeTickets.length === 0) {
      return NextResponse.json(
        {
          error: `Tất cả số vé nhập vào đều nằm ngoài dải số hợp lệ (${event.range_from} - ${event.range_to}).`,
          outOfRangeTickets,
        },
        { status: 400 }
      );
    }

    const { data: existingRows } = await admin
      .from('excluded_tickets')
      .select('ticket')
      .eq('event_id', parsed.data.event_id)
      .in('ticket', inRangeTickets);

    const existingSet = new Set((existingRows ?? []).map((r: { ticket: number }) => r.ticket));
    const toInsert = inRangeTickets
      .filter((t) => !existingSet.has(t))
      .map((ticket) => ({
        event_id: parsed.data.event_id,
        ticket,
        reason: parsed.data.reason || null,
      }));

    if (toInsert.length > 0) {
      const { error: insertErr } = await admin
        .from('excluded_tickets')
        .upsert(toInsert, { onConflict: 'event_id,ticket', ignoreDuplicates: true });

      if (insertErr) return rpcErrorResponse(insertErr);
    }

    return NextResponse.json({
      success: true,
      addedCount: toInsert.length,
      skippedDuplicates: existingSet.size,
      outOfRangeTickets,
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

const DeleteExcludedSchema = z.union([
  z.object({ id: z.string().uuid('ID vé loại trừ không hợp lệ') }),
  z.object({ event_id: z.string().uuid(), clear_all: z.literal(true) }),
]);

export async function DELETE(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:excluded:del', auth.actor.user.id, 60, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = DeleteExcludedSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Yêu cầu xóa không hợp lệ.' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    if ('id' in parsed.data) {
      const { error } = await admin.from('excluded_tickets').delete().eq('id', parsed.data.id);
      if (error) return rpcErrorResponse(error);
    } else {
      const { error } = await admin
        .from('excluded_tickets')
        .delete()
        .eq('event_id', parsed.data.event_id);
      if (error) return rpcErrorResponse(error);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
