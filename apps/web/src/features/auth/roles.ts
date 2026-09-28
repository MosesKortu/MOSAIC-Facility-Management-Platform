import type { Role, UserType } from '@mosaic/contracts';

export const ROLE_LABEL: Record<Role, string> = {
  standard_user: 'Researcher',
  super_user: 'Super User',
  admin: 'Administrator',
  auditor: 'Auditor',
};

export const USER_TYPE_LABEL: Record<UserType, string> = { internal: 'Internal', external: 'External collaborator' };

/** Roles that use the researcher application (staff also book instruments for their own work). */
export const RESEARCHER_ROLES: readonly Role[] = ['standard_user', 'super_user', 'admin'];

/** Super users and admins: operations, proxy booking and status override (09 §3). */
export const STAFF_ROLES: readonly Role[] = ['super_user', 'admin'];
