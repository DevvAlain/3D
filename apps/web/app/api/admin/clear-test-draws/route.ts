import { NextResponse } from 'next/server';
import { ClearTestDrawsRequestSchema } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:clear-test-draws', auth.actor.user.id, 15, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = ClearTestDrawsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ID sự kiện không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc('clear_test_draws', {
      p_event_id: parsed.data.event_id,
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
