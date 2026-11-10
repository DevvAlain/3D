/**
 * Supabase environment variable helpers.
 * Uses literal `process.env.NEXT_PUBLIC_*` accesses so Next.js compiler can
 * inline public variables cleanly into the browser bundle while keeping
 * secret keys strictly server-only.
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_URL');
  }
  return url;
}

export function getSupabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error(
      'Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  return key;
}

export function hasPublicSupabaseEnv(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY)
  );
}

/**
 * Server-ONLY Service Role / Secret Key.
 * Throws immediately if accidentally invoked in a browser environment.
 */
export function getSupabaseServiceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY_VIOLATION: SUPABASE_SERVICE_ROLE_KEY không được phép truy cập ở client');
  }

  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      'Thiếu biến môi trường server SUPABASE_SERVICE_ROLE_KEY hoặc SUPABASE_SECRET_KEY'
    );
  }
  return secretKey;
}
