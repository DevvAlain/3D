import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DrawStatusSchema, type Draw, type Event, type Prize } from '@church/shared';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { buildDrawsCsv } from '@/lib/csv';
import { rpcErrorResponse } from '@/lib/rpc-errors';

export const dynamic = 'force-dynamic';

const ExportQuerySchema = z.object({
  event_id: z.string().uuid('ID sự kiện không hợp lệ'),
  mode: z.enum(['all', 'real', 'test']).default('all'),
  prize_id: z.string().uuid().optional(),
  status: DrawStatusSchema.optional(),
});

export async function GET(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const parsed = ExportQuerySchema.safeParse({
      event_id: url.searchParams.get('event_id'),
      mode: url.searchParams.get('mode') || 'all',
      prize_id: url.searchParams.get('prize_id') || undefined,
      status: url.searchParams.get('status') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Tham số xuất CSV không hợp lệ.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { event_id, mode, prize_id, status } = parsed.data;
    const admin = createAdminSupabaseClient();

    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, title, digits')
      .eq('id', event_id)
      .maybeSingle<Pick<Event, 'id' | 'title' | 'digits'>>();

    if (eventErr) return rpcErrorResponse(eventErr);
    if (!event) {
      return NextResponse.json({ error: 'Không tìm thấy sự kiện.' }, { status: 404 });
    }

    const { data: prizesData, error: prizesErr } = await admin
      .from('prizes')
      .select('*')
      .eq('event_id', event_id);

    if (prizesErr) return rpcErrorResponse(prizesErr);

    let drawsQuery = admin
      .from('draws')
      .select('*')
      .eq('event_id', event_id)
      .order('is_test', { ascending: true })
      .order('seq', { ascending: true });

    if (mode === 'real') {
      drawsQuery = drawsQuery.eq('is_test', false);
    } else if (mode === 'test') {
      drawsQuery = drawsQuery.eq('is_test', true);
    }

    if (prize_id) {
      drawsQuery = drawsQuery.eq('prize_id', prize_id);
    }
    if (status) {
      drawsQuery = drawsQuery.eq('status', status);
    }

    const { data: drawsData, error: drawsErr } = await drawsQuery;
    if (drawsErr) return rpcErrorResponse(drawsErr);

    const prizeMap = new Map<string, Prize>();
    for (const p of (prizesData ?? []) as Prize[]) {
      if (p.id) prizeMap.set(p.id, p);
    }

    const rows = ((drawsData ?? []) as Draw[]).map((d) => ({
      ...d,
      prize: prizeMap.get(d.prize_id),
    }));

    const csvContent = buildDrawsCsv(rows, event.digits);
    const asciiSlug = event.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'su-kien';
    const fileName = `ket-qua-${asciiSlug}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
