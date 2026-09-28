export const ROLES = ['standard_user', 'super_user', 'admin', 'auditor'] as const;
export type Role = (typeof ROLES)[number];
export type UserType = 'internal' | 'external';

/** GET /auth/me and POST /auth/dev-login response. */
export interface SessionUser {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  user_type: UserType;
  groups: { group_id: string; name: string }[];
}
