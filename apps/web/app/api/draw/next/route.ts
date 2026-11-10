import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { DrawNextRequestSchema, DrawNextResultSchema } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['presenter']);
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimitRes = enforceApiRateLimit(req, 'draw:next', auth.actor.user.id, 25, 10_000);
  if (rateLimitRes) {
    return rateLimitRes;
  }

  try {
    const body: unknown = await req.json();
    const parsed = DrawNextRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dữ liệu yêu cầu quay số không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const idempotencyKey = parsed.data.idempotency_key ?? crypto.randomUUID();
    const admin = createAdminSupabaseClient();

    const { data, error } = await admin.rpc('draw_next', {
      p_event_id: parsed.data.event_id,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      return rpcErrorResponse(error);
    }

    const validated = DrawNextResultSchema.safeParse(data);
    if (!validated.success) {
      return NextResponse.json(data);
    }

    return NextResponse.json(validated.data);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
    }
    return rpcErrorResponse(err);
  }
}
