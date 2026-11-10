'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button, type ButtonProps } from '@/components/ui/button';

interface SignOutButtonProps extends Omit<ButtonProps, 'onClick'> {
  label?: string;
}

export function SignOutButton({ label = 'Đăng xuất', variant = 'outline', size = 'sm', ...props }: SignOutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      if (typeof window !== 'undefined') {
        if ('caches' in window) {
          void caches.delete('church-display-doc-v1').catch(() => undefined);
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_DOC_CACHE' });
        }
      }
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={handleSignOut} disabled={loading} {...props}>
      <LogOut className="h-4 w-4" />
      {loading ? 'Đang thoát...' : label}
    </Button>
  );
}
