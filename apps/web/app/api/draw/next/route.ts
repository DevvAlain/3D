import { NextResponse } from 'next/server';
import { DrawNextRequestSchema } from '@church/shared';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = DrawNextRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dữ liệu không hợp lệ', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // In Phase 2, this calls supabase server client with service_role RPC draw_next
    return NextResponse.json({
      message: 'API Route Ready for Supabase RPC call',
      payload: parsed.data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
