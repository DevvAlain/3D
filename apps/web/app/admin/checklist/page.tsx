import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, ExternalLink, ShieldAlert } from 'lucide-react';
import { getAuthenticatedActor } from '@/lib/supabase/auth';
import { hasPublicSupabaseEnv } from '@/lib/supabase/env';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { RehearsalChecklist } from '@/components/admin/RehearsalChecklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface AdminChecklistPageProps {
  searchParams: Promise<{ event_id?: string }>;
}

export default async function AdminChecklistPage({ searchParams }: AdminChecklistPageProps) {
  if (!hasPublicSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg border-amber-400/40">
          <CardHeader>
            <CardTitle>Chưa cấu hình biến môi trường Supabase</CardTitle>
            <CardDescription>
              Vui lòng sao chép <code>.env.example</code> thành <code>.env.local</code> và điền khóa Supabase của dự án trước khi sử dụng trang kiểm tra trước sự kiện.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const auth = await getAuthenticatedActor();

  if (auth.status === 'unauthenticated') {
    return <LoginForm targetRole="admin" />;
  }

  if (auth.status === 'missing_role' || auth.actor.role !== 'admin') {
    const isPresenter = auth.status === 'ok' && auth.actor.role === 'presenter';
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md border-red-400/40 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <CardTitle>Không có quyền Quản Trị (Admin)</CardTitle>
            <CardDescription>
              {isPresenter
                ? 'Bạn đang đăng nhập bằng tài khoản Sân Khấu (Presenter). Chỉ Quản trị viên mới có quyền truy cập trang kiểm tra trước sự kiện.'
                : 'Tài khoản của bạn chưa được gán quyền admin trong app_metadata.role.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap justify-center gap-3">
            {isPresenter ? (
              <Link href="/display">
                <Button variant="default">Đi tới Màn Hình Chiếu</Button>
              </Link>
            ) : null}
            <SignOutButton label="Đăng xuất để đổi tài khoản" />
          </CardContent>
        </Card>
      </main>
    );
  }

  const resolvedParams = await searchParams;
  const eventId =
    typeof resolvedParams.event_id === 'string' && resolvedParams.event_id.length > 0
      ? resolvedParams.event_id
      : undefined;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(245,196,81,0.1),_transparent_55%)] pb-14">
      <header className="sticky top-0 z-30 border-b border-parish-gold/25 bg-parish-navy/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-parish-gold" />
              <span className="font-title text-lg font-bold text-parish-goldLight sm:text-xl">
                Danh Sách Kiểm Tra Trước Sự Kiện
              </span>
              <Badge variant="default">Rehearsal &amp; Go-Live</Badge>
            </div>
            <p className="text-xs text-parish-cream/65">
              Đăng nhập: {auth.actor.user.email ?? 'Quản trị viên'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Bảng quản trị
              </Button>
            </Link>

            <a href="/display?preview=1" target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="h-4 w-4" />
                Preview (/display?preview=1)
              </Button>
            </a>

            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <RehearsalChecklist eventId={eventId} />
      </main>
    </div>
  );
}
