import { NavLink } from 'react-router';
import { cn } from '../../lib/cn.ts';

export interface TabLink {
  to: string;
  label: string;
  /** Match the full location (path + search) instead of the path only. */
  active?: boolean;
}

/** Peer views as links, so each tab is deep-linkable (04_DESIGN_SYSTEM.md §4 Tabs, underline style). */
export function TabLinks({ label, tabs }: { label: string; tabs: TabLink[] }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end
          className={({ isActive }) => {
            const active = tab.active ?? isActive;
            return cn('-mb-px border-b-2 px-4 py-2.5 text-body font-semibold whitespace-nowrap',
              active ? 'border-pix-blue text-pix-blue' : 'border-transparent text-ink-muted hover:text-ink');
          }}
          aria-current={tab.active === undefined ? undefined : tab.active ? 'page' : undefined}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
