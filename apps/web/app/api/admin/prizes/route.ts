import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PrizeCreateSchema, PrizeUpdateSchema, type Prize } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

function isMissingSpeedModeColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    (error.code === '42703' || error.code === 'PGRST204') &&
    typeof error.message === 'string' &&
    error.message.includes('speed_mode')
  );
}

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:prizes:create', auth.actor.user.id, 40, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = PrizeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Thông tin giải thưởng không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    let { data, error } = await admin
      .from('prizes')
      .insert(parsed.data)
      .select('*')
      .single<Prize>();

    if (isMissingSpeedModeColumnError(error)) {
      const legacyPayload = { ...parsed.data };
      delete legacyPayload.speed_mode;
      const retry = await admin
        .from('prizes')
        .insert(legacyPayload)
        .select('*')
        .single<Prize>();
      data = retry.data;
      error = retry.error;
    }

    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ prize: data }, { status: 201 });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

const ReorderPrizesSchema = z.object({
  event_id: z.string().uuid(),
  orders: z
    .array(
      z.object({
        id: z.string().uuid(),
        sort_order: z.number().int().min(0),
      })
    )
    .min(1),
});

const SinglePrizePatchSchema = PrizeUpdateSchema.extend({
  id: z.string().uuid(),
});

export async function PATCH(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:prizes:update', auth.actor.user.id, 60, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const admin = createAdminSupabaseClient();

    // Branch 1: Bulk reorder
    const reorderParsed = ReorderPrizesSchema.safeParse(body);
    if (reorderParsed.success) {
      const nowIso = new Date().toISOString();
      for (const item of reorderParsed.data.orders) {
        const { error } = await admin
          .from('prizes')
          .update({ sort_order: item.sort_order, updated_at: nowIso })
          .eq('id', item.id)
          .eq('event_id', reorderParsed.data.event_id);

        if (error) return rpcErrorResponse(error);
      }
      return NextResponse.json({ success: true });
    }

    // Branch 2: Single prize edit
    const singleParsed = SinglePrizePatchSchema.safeParse(body);
    if (!singleParsed.success) {
      return NextResponse.json(
        { error: 'Dữ liệu cập nhật giải thưởng không hợp lệ.', details: singleParsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updates } = singleParsed.data;
    let { data, error } = await admin
      .from('prizes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single<Prize>();

    if (isMissingSpeedModeColumnError(error)) {
      const legacyUpdates = { ...updates };
      delete legacyUpdates.speed_mode;
      const retry = await admin
        .from('prizes')
        .update({ ...legacyUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single<Prize>();
      data = retry.data;
      error = retry.error;
    }

    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ prize: data });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:prizes:delete', auth.actor.user.id, 40, 60_000);
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const idParse = z.string().uuid().safeParse(url.searchParams.get('id'));
    if (!idParse.success) {
      return NextResponse.json({ error: 'ID giải thưởng không hợp lệ.' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('prizes').delete().eq('id', idParse.data);

    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ success: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
