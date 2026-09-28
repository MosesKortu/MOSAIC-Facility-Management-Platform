import type { Role } from '@mosaic/contracts';
import { Activity, BadgeCheck, CalendarDays, Euro, GraduationCap, History, Home, Microscope, Receipt, UsersRound, UserRound, Wrench, type LucideIcon } from 'lucide-react';
import { RESEARCHER_ROLES } from '../features/auth/roles.ts';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  /** Eyebrow shown above the group; omitted for the first, primary group. */
  label?: string;
  roles: readonly Role[];
  items: NavItem[];
}

/**
 * Navigation per role (04_DESIGN_SYSTEM.md §3). Only routes that exist are listed; each delivery
 * slice adds its items here together with its routes.
 */
export const NAV: NavSection[] = [
  { roles: ['auditor'], items: [{ to: '/', label: 'Home', icon: Home }] },
  {
    roles: RESEARCHER_ROLES,
    items: [
      { to: '/', label: 'Home', icon: Home },
      { to: '/equipment', label: 'Equipment', icon: Microscope },
      { to: '/bookings', label: 'My Bookings', icon: CalendarDays },
      { to: '/training', label: 'Training', icon: GraduationCap },
    ],
  },
  {
    label: 'Operations',
    roles: ['super_user', 'admin'],
    items: [
      { to: '/operations/certifications', label: 'Certification Queue', icon: BadgeCheck },
      { to: '/operations/equipment', label: 'Equipment Status', icon: Activity },
      { to: '/operations/bookings', label: 'All Bookings', icon: CalendarDays },
    ],
  },
  {
    label: 'Administration',
    roles: ['admin'],
    items: [
      { to: '/admin/people', label: 'People', icon: UserRound },
      { to: '/admin/groups', label: 'Groups', icon: UsersRound },
      { to: '/admin/grants', label: 'Grants & Funding', icon: Euro },
      { to: '/admin/equipment', label: 'Equipment', icon: Wrench },
      { to: '/admin/tariffs', label: 'Tariffs', icon: Receipt },
      { to: '/admin/audit', label: 'Audit', icon: History },
    ],
  },
];

export function navFor(role: Role): NavSection[] {
  return NAV.filter((section) => section.roles.includes(role));
}
