import { NextResponse } from 'next/server';
import { EventConfigImportSchema, type Event } from '@church/shared';
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
      const firstIssue = parsed.error.issues[0]?.message ?? 'Tệp cấu hình JSON không đúng định dạng.';
      return NextResponse.json(
        { error: firstIssue, details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { target_event_id, event: eventData, prizes, excluded_tickets } = parsed.data;
    const admin = createAdminSupabaseClient();

    // Deduplicate and range-filter excluded tickets
    const uniqueTicketsMap = new Map<number, string | null>();
    for (const item of excluded_tickets) {
      if (item.ticket >= eventData.range_from && item.ticket <= eventData.range_to) {
        if (!uniqueTicketsMap.has(item.ticket)) {
          uniqueTicketsMap.set(item.ticket, item.reason ?? null);
        }
      }
    }

    // Branch A: Importing over an existing event -> strictly reject when ANY real (is_test=false) draw exists
    if (target_event_id) {
      const { data: targetEvent, error: targetErr } = await admin
        .from('events')
        .select('id, is_active')
        .eq('id', target_event_id)
        .maybeSingle<Pick<Event, 'id' | 'is_active'>>();

      if (targetErr) return rpcErrorResponse(targetErr);
      if (!targetEvent) {
        return NextResponse.json({ error: 'Không tìm thấy sự kiện đích để nhập cấu hình.' }, { status: 404 });
      }

      const { count: realDrawsCount, error: realCheckErr } = await admin
        .from('draws')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', target_event_id)
        .eq('is_test', false);

      if (realCheckErr) return rpcErrorResponse(realCheckErr);
      if ((realDrawsCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              'Sự kiện đã có lượt quay chính thức (is_test = false), không thể nhập đè cấu hình.',
            code: 'REAL_DRAWS_EXIST',
          },
          { status: 409 }
        );
      }

      // Replacing prizes also requires zero leftover test draws due to ON DELETE RESTRICT FK
      const { count: testDrawsCount, error: testCheckErr } = await admin
        .from('draws')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', target_event_id)
        .eq('is_test', true);

      if (testCheckErr) return rpcErrorResponse(testCheckErr);
      if ((testDrawsCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              'Vui lòng xóa toàn bộ lượt quay thử (clear_test_draws) trước khi nhập đè cơ cấu giải vào sự kiện hiện tại.',
            code: 'TEST_DRAWS_EXIST',
          },
          { status: 409 }
        );
      }

      const { data: updatedEvent, error: updateErr } = await admin
        .from('events')
        .update({
          title: eventData.title,
          parish_name: eventData.parish_name,
          digits: eventData.digits,
          range_from: eventData.range_from,
          range_to: eventData.range_to,
          theme: eventData.theme,
          primary_color: eventData.primary_color,
          test_mode: eventData.test_mode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', target_event_id)
        .select('*')
        .single<Event>();

      if (updateErr || !updatedEvent) {
        return rpcErrorResponse(updateErr ?? new Error('Không thể cập nhật sự kiện.'));
      }

      const { error: delPrizesErr } = await admin.from('prizes').delete().eq('event_id', target_event_id);
      if (delPrizesErr) return rpcErrorResponse(delPrizesErr);

      const { error: delExclErr } = await admin
        .from('excluded_tickets')
        .delete()
        .eq('event_id', target_event_id);
      if (delExclErr) return rpcErrorResponse(delExclErr);

      if (prizes.length > 0) {
        const prizeRows = prizes.map((p) => ({
          event_id: target_event_id,
          name: p.name,
          reward: p.reward,
          quantity: p.quantity,
          sort_order: p.sort_order,
          ...(p.speed_mode ? { speed_mode: p.speed_mode } : {}),
        }));
        const { error: prizeErr } = await admin.from('prizes').insert(prizeRows);
        if (prizeErr) return rpcErrorResponse(prizeErr);
      }

      const excludedRows = Array.from(uniqueTicketsMap.entries()).map(([ticket, reason]) => ({
        event_id: target_event_id,
        ticket,
        reason,
      }));
      if (excludedRows.length > 0) {
        const { error: excErr } = await admin.from('excluded_tickets').insert(excludedRows);
        if (excErr) return rpcErrorResponse(excErr);
      }

      return NextResponse.json(
        {
          success: true,
          mode: 'updated_existing',
          event: updatedEvent,
          importedPrizes: prizes.length,
          importedExcludedTickets: excludedRows.length,
        },
        { status: 200 }
      );
    }

    // Branch B: Create a separate inactive draft event so live events remain completely untouched.
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
          ...(p.speed_mode ? { speed_mode: p.speed_mode } : {}),
        }));
        const { error: prizeErr } = await admin.from('prizes').insert(prizeRows);
        if (prizeErr) throw prizeErr;
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
          mode: 'created_draft',
          event: createdEvent,
          importedPrizes: prizes.length,
          importedExcludedTickets: excludedRows.length,
        },
        { status: 201 }
      );
    } catch (nestedErr) {
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
