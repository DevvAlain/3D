import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublishableKey, getSupabaseUrl, hasPublicSupabaseEnv } from './lib/supabase/env';

/**
 * Refreshes Supabase SSR session cookies on page & API requests using `getUser()`
 * (NEVER `getSession()`), without touching any remote database when env vars are unconfigured.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  if (!hasPublicSupabaseEnv()) {
    return response;
  }

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request,
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh auth token with Supabase Auth server
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/display/:path*', '/api/admin/:path*', '/api/draw/:path*', '/api/display/:path*'],
};
