import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env';

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Privileged server-ONLY Supabase client authenticated with Service Role Key.
 * Never exposed to client bundles. Only invoked AFTER `requireApiRole(...)` verifies
 * user identity via `supabase.auth.getUser()` and `app_metadata.role`.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY_VIOLATION: createAdminSupabaseClient chỉ được gọi ở server');
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedAdminClient;
}
