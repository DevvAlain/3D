import { NextResponse } from 'next/server';
import { ResetEventRequestSchema, type Event } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:reset-event', auth.actor.user.id, 5, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = ResetEventRequestSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Dữ liệu xác nhận reset không hợp lệ.';
      return NextResponse.json(
        { error: firstIssue, details: parsed.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();

    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, title')
      .eq('id', parsed.data.event_id)
      .maybeSingle<Pick<Event, 'id' | 'title'>>();

    if (eventErr) return rpcErrorResponse(eventErr);
    if (!event) {
      return NextResponse.json(
        { error: 'Không tìm thấy sự kiện.', code: 'EVENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (parsed.data.confirm_title.trim() !== event.title.trim()) {
      return NextResponse.json(
        {
          error: `Tên xác nhận không khớp. Vui lòng nhập chính xác "${event.title}".`,
          code: 'CONFIRM_TITLE_MISMATCH',
        },
        { status: 400 }
      );
    }

    const { data, error } = await admin.rpc('reset_event', {
      p_event_id: parsed.data.event_id,
      p_actor_id: auth.actor.user.id,
      p_actor_email: auth.actor.user.email ?? null,
    });

    if (error) return rpcErrorResponse(error);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 });
    }
    return rpcErrorResponse(err);
  }
}
