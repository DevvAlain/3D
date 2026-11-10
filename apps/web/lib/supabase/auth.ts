import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { UserRoleSchema, type UserRole } from '@church/shared';
import { createServerSupabaseClient } from './server';

export interface AuthenticatedActor {
  user: User;
  role: UserRole;
}

export type RoleGuardResult =
  | { ok: true; actor: AuthenticatedActor }
  | { ok: false; response: NextResponse };

/**
 * Extracts and validates the trusted role strictly from `user.app_metadata.role`.
 * NEVER reads `user.user_metadata`, which is user-editable.
 */
export function extractRoleFromAppMetadata(user: Pick<User, 'app_metadata'> | null | undefined): UserRole | null {
  if (!user || !user.app_metadata || typeof user.app_metadata !== 'object') {
    return null;
  }
  const rawRole = (user.app_metadata as Record<string, unknown>).role;
  const parsed = UserRoleSchema.safeParse(rawRole);
  return parsed.success ? parsed.data : null;
}

/**
 * Verifies the caller via `supabase.auth.getUser()` (ALWAYS revalidates JWT with Auth server;
 * NEVER uses `getSession()`). Returns null if unauthenticated or role missing/invalid.
 */
export async function getAuthenticatedActor(): Promise<
  | { status: 'ok'; actor: AuthenticatedActor }
  | { status: 'unauthenticated' }
  | { status: 'missing_role'; user: User }
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { status: 'unauthenticated' };
  }

  const role = extractRoleFromAppMetadata(data.user);
  if (!role) {
    return { status: 'missing_role', user: data.user };
  }

  return {
    status: 'ok',
    actor: { user: data.user, role },
  };
}

/**
 * Route Handler role guard. Always authenticates with `getUser()` and verifies
 * `app_metadata.role` is included in `allowedRoles`.
 */
export async function requireApiRole(allowedRoles: readonly UserRole[]): Promise<RoleGuardResult> {
  const result = await getAuthenticatedActor();

  if (result.status === 'unauthenticated') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    };
  }

  if (result.status === 'missing_role' || !allowedRoles.includes(result.actor.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    actor: result.actor,
  };
}

/**
 * Helper for Server Actions or Server Components requiring a specific role.
 */
export async function assertServerRole(allowedRoles: readonly UserRole[]): Promise<AuthenticatedActor> {
  const result = await getAuthenticatedActor();
  if (result.status === 'unauthenticated') {
    throw new Error('UNAUTHORIZED: Vui lòng đăng nhập');
  }
  if (result.status === 'missing_role' || !allowedRoles.includes(result.actor.role)) {
    throw new Error('FORBIDDEN: Không đủ quyền truy cập');
  }
  return result.actor;
}
