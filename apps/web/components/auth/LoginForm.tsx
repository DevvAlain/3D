'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck, Tv } from 'lucide-react';
import type { UserRole } from '@church/shared';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LoginFormProps {
  targetRole: UserRole;
}

export function LoginForm({ targetRole }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isAdmin = targetRole === 'admin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMsg('Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.');
        return;
      }

      const appRole = data.user.app_metadata?.role;
      if (!appRole) {
        await supabase.auth.signOut();
        setErrorMsg(
          'Tài khoản này chưa được cấp quyền (app_metadata.role). Vui lòng liên hệ quản trị viên hệ thống.'
        );
        return;
      }

      router.refresh();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể kết nối tới máy chủ xác thực.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(245,196,81,0.12),_transparent_50%)] p-4">
      <Card className="w-full max-w-md border-parish-gold/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-parish-gold/40 bg-parish-gold/10 text-parish-gold">
            {isAdmin ? <ShieldCheck className="h-7 w-7" /> : <Tv className="h-7 w-7" />}
          </div>
          <CardTitle className="text-2xl">
            {isAdmin ? 'Đăng Nhập Quản Trị (Admin)' : 'Đăng Nhập Sân Khấu (Presenter)'}
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Khu vực cấu hình sự kiện, giải thưởng và theo dõi kết quả hậu trường.'
              : 'Khu vực máy chiếu trình chiếu quay số trên sân khấu.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="auth-email">Email tài khoản</Label>
              <Input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                placeholder={isAdmin ? 'admin@giaoxu.vn' : 'presenter@giaoxu.vn'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-password">Mật khẩu</Label>
              <Input
                id="auth-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              <Lock className="h-4 w-4" />
              {loading ? 'Đang xác thực...' : 'Đăng nhập'}
            </Button>

            <div className="flex items-center justify-between pt-2 text-xs text-parish-cream/60">
              <Link href="/" className="hover:text-parish-goldLight">
                ← Trang chủ
              </Link>
              <span>Đăng ký công khai đã được tắt</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
