import { NextResponse } from 'next/server';
import { z } from 'zod';
import { EventBaseSchema, EventCreateSchema, EventSchema, type Event } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { rpcErrorResponse } from '@/lib/rpc-errors';

const PatchEventPayloadSchema = EventBaseSchema.partial()
  .omit({ id: true, created_at: true, updated_at: true })
  .extend({
    id: z.string().uuid('ID sự kiện không hợp lệ'),
  });

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:events:create', auth.actor.user.id, 20, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = EventCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Thông tin sự kiện không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();

    if (parsed.data.is_active) {
      await admin.from('events').update({ is_active: false }).eq('is_active', true);
    }

    const { data, error } = await admin
      .from('events')
      .insert(parsed.data)
      .select('*')
      .single<Event>();

    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ event: data }, { status: 201 });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:events:update', auth.actor.user.id, 60, 60_000);
  if (limited) return limited;

  try {
    const body: unknown = await req.json();
    const parsed = PatchEventPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Thông tin cập nhật sự kiện không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const admin = createAdminSupabaseClient();

    const { data: existing, error: fetchErr } = await admin
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle<Event>();

    if (fetchErr) return rpcErrorResponse(fetchErr);
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
    }

    // Validate combined invariants (digits vs range_to, range_from vs range_to)
    const mergedValidation = EventSchema.safeParse({
      ...existing,
      ...updates,
    });
    if (!mergedValidation.success) {
      const firstIssue = mergedValidation.error.issues[0]?.message ?? 'Cấu hình dải số không hợp lệ.';
      return NextResponse.json(
        { error: firstIssue, details: mergedValidation.error.format() },
        { status: 400 }
      );
    }

    if (updates.is_active === true && !existing.is_active) {
      await admin.from('events').update({ is_active: false }).eq('is_active', true).neq('id', id);
    }

    const { data: updated, error: updateErr } = await admin
      .from('events')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single<Event>();

    if (updateErr) return rpcErrorResponse(updateErr);
    return NextResponse.json({ event: updated });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:events:delete', auth.actor.user.id, 15, 60_000);
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const idParse = z.string().uuid().safeParse(url.searchParams.get('id'));
    if (!idParse.success) {
      return NextResponse.json({ error: 'ID sự kiện không hợp lệ.' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('events').delete().eq('id', idParse.data);

    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ success: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
