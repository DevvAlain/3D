import { NextResponse } from 'next/server';
import { MarkAbsentRequestSchema } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['presenter']);
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimitRes = enforceApiRateLimit(req, 'draw:absent', auth.actor.user.id, 30, 10_000);
  if (rateLimitRes) {
    return rateLimitRes;
  }

  try {
    const body: unknown = await req.json();
    const parsed = MarkAbsentRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ID lượt quay không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc('mark_absent', {
      p_draw_id: parsed.data.draw_id,
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
