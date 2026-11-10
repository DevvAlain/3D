import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getAuthenticatedActor } from '@/lib/supabase/auth';
import { hasPublicSupabaseEnv } from '@/lib/supabase/env';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!hasPublicSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg border-amber-400/40">
          <CardHeader>
            <CardTitle>Chưa cấu hình biến môi trường Supabase</CardTitle>
            <CardDescription>
              Vui lòng sao chép <code>.env.example</code> thành <code>.env.local</code> và điền khóa Supabase của dự án trước khi sử dụng trang Quản trị.
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
                ? 'Bạn đang đăng nhập bằng tài khoản Sân Khấu (Presenter). Tài khoản này không được phép truy cập cấu hình hậu trường.'
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

  return <AdminDashboard userEmail={auth.actor.user.email ?? 'Quản trị viên'} />;
}
