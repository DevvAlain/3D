import { z } from 'zod';

/**
 * Application roles stored in Supabase Auth app_metadata.role
 * - admin: Backstage administrator (full config, results, danger zone). Never triggers draws.
 * - presenter: Stage operator on /display (triggers draws, confirms/absents/voids).
 */
export const UserRoleSchema = z.enum(['admin', 'presenter']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export function isAdminRole(role: unknown): boolean {
  return role === 'admin';
}

export function isPresenterRole(role: unknown): boolean {
  return role === 'presenter';
}
