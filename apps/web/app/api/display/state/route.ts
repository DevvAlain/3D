import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/supabase/auth';
import { fetchActiveDisplayState } from '@/lib/display-state';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const previewRequested = url.searchParams.get('preview') === '1';

  // Presenter always allowed. Admin allowed read-only preview ONLY with ?preview=1.
  const auth = await requireApiRole(['presenter', 'admin']);
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.actor.role === 'admin' && !previewRequested) {
    return NextResponse.json(
      {
        error: 'Tài khoản Admin chỉ được xem trước với ?preview=1. Vui lòng đăng nhập bằng tài khoản Presenter để điều khiển quay số.',
        code: 'PREVIEW_REQUIRED_FOR_ADMIN',
      },
      { status: 403 }
    );
  }

  try {
    const isPreview = auth.actor.role === 'admin';
    const state = await fetchActiveDisplayState(isPreview);
    return NextResponse.json(state, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi tải trạng thái sân khấu.';
    return NextResponse.json({ error: message, code: 'DISPLAY_STATE_ERROR' }, { status: 500 });
  }
}
