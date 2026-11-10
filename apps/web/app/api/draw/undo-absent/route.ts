import { NextResponse } from 'next/server';
import { UndoAbsentRequestSchema } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['presenter']);
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimitRes = enforceApiRateLimit(req, 'draw:undo-absent', auth.actor.user.id, 20, 10_000);
  if (rateLimitRes) {
    return rateLimitRes;
  }

  try {
    const body: unknown = await req.json();
    const parsed = UndoAbsentRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ID sự kiện không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc('undo_absent', {
      p_event_id: parsed.data.event_id,
    });

    if (error) {
      return rpcErrorResponse(error);
    }

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
    }
    return rpcErrorResponse(err);
  }
}
