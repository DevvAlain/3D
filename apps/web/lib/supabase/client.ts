'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublishableKey, getSupabaseUrl } from './env';

let browserClient: SupabaseClient | null = null;

/**
 * Browser Supabase client using public publishable/anon key ONLY.
 * Used for:
 *  - Email + password authentication on /admin and /display login gates
 *  - Admin Realtime live updates (protected by admin SELECT RLS)
 *  - Admin event-assets Storage uploads (protected by storage is_admin() RLS)
 *
 * NEVER used on /display for Realtime or direct table reads.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
  }
  return browserClient;
}
