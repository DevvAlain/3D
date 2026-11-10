import Link from 'next/link';
import { Eye, ShieldAlert } from 'lucide-react';
import { getAuthenticatedActor } from '@/lib/supabase/auth';
import { hasPublicSupabaseEnv } from '@/lib/supabase/env';
import { fetchActiveDisplayState } from '@/lib/display-state';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { DisplayStage2D } from '@/components/display/DisplayStage2D';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface DisplayPageProps {
  searchParams: Promise<{ preview?: string }>;
}

export default async function DisplayPage({ searchParams }: DisplayPageProps) {
  if (!hasPublicSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg border-amber-400/40">
          <CardHeader>
            <CardTitle>Chưa cấu hình biến môi trường Supabase</CardTitle>
            <CardDescription>
              Vui lòng cấu hình <code>.env.local</code> theo mẫu <code>.env.example</code> để kích hoạt màn hình trình chiếu.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const resolvedParams = await searchParams;
  const previewRequested = resolvedParams.preview === '1';

  const auth = await getAuthenticatedActor();

  if (auth.status === 'unauthenticated') {
    return <LoginForm targetRole="presenter" />;
  }

  if (auth.status === 'missing_role') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md border-red-400/40 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <CardTitle>Tài khoản chưa được phân quyền</CardTitle>
            <CardDescription>
              Vui lòng yêu cầu Quản trị viên gán quyền presenter hoặc admin trong Supabase app_metadata.role.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <SignOutButton />
          </CardContent>
        </Card>
      </main>
    );
  }

  // Admin without ?preview=1 must choose between read-only preview or switching to Presenter account
  if (auth.actor.role === 'admin' && !previewRequested) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-lg border-parish-gold/35 text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-parish-gold/15 text-parish-gold">
              <Eye className="h-6 w-6" />
            </div>
            <CardTitle>Tài khoản Admin đang đăng nhập</CardTitle>
            <CardDescription>
              Để bảo đảm tách biệt vai trò vận hành, tài khoản Quản trị (Admin) không được phép kích hoạt lượt quay số trực tiếp. Bạn có thể mở chế độ Xem trước chỉ đọc hoặc đăng xuất để đăng nhập tài khoản Presenter.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap justify-center gap-3">
            <Link href="/display?preview=1">
              <Button variant="default">
                <Eye className="h-4 w-4" /> Mở Xem Trước Chỉ Đọc (?preview=1)
              </Button>
            </Link>
            <Link href="/admin">
              <Button variant="secondary">Quay lại trang Admin</Button>
            </Link>
            <SignOutButton label="Đăng xuất" />
          </CardContent>
        </Card>
      </main>
    );
  }

  const isPreview = auth.actor.role === 'admin';

  try {
    const initialState = await fetchActiveDisplayState(isPreview);
    return (
      <DisplayStage2D
        initialState={initialState}
        isPreview={isPreview}
        actorEmail={auth.actor.user.email ?? auth.actor.role}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Không thể tải dữ liệu sân khấu.';
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-lg border-red-400/40 text-center">
          <CardHeader>
            <CardTitle>Không thể tải dữ liệu Sân Khấu</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <SignOutButton />
          </CardContent>
        </Card>
      </main>
    );
  }
}
