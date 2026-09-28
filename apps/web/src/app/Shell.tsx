import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useMatches, useNavigate } from 'react-router';
import { Logo } from '../brand/Logo.tsx';
import { useLogout, useSession } from '../features/auth/api.ts';
import { ROLE_LABEL } from '../features/auth/roles.ts';
import { NotificationBell } from '../features/notifications/NotificationBell.tsx';
import { cn } from '../lib/cn.ts';
import { navFor } from './nav.ts';

/**
 * Routes declare `handle: { title }`. The matched titles form the top-bar breadcrumb
 * (e.g. Administration › People); the deepest one also names the browser tab.
 */
function useBreadcrumb(): string[] {
  const matches = useMatches();
  const crumbs = matches.map((m) => (m.handle as { title?: string } | undefined)?.title).filter((t): t is string => Boolean(t));
  const page = crumbs.at(-1);
  useEffect(() => {
    document.title = page ? `${page} · MOSAIC` : 'MOSAIC';
  }, [page]);
  return crumbs;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('');
}

/** Navy sidebar + top bar application shell (04_DESIGN_SYSTEM.md §3). Requires a session. */
export function Shell() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const crumbs = useBreadcrumb();
  if (!user) return null; // RequireSession guarantees a user; this narrows the type.

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col bg-pix-blue text-white">
      {/* Brand board: horizontal logo, inverse (all white) on Mosaic Blue. */}
      <Link to="/" aria-label="MOSAIC home" className="mx-3 mb-4 flex h-14 items-center rounded-lg px-2">
        <Logo layout="horizontal" tone="inverse" size="sm" />
      </Link>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3">
        {navFor(user.role).map((section, index) => (
          <div key={section.label ?? index} className="flex flex-col gap-0.5">
            {section.label && <p className="px-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-white/50 uppercase">{section.label}</p>}
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-body transition-colors',
                  isActive ? 'border-pix-yellow bg-white/14 font-semibold text-white' : 'border-transparent text-white/70 hover:bg-white/8 hover:text-white',
                )}>
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="m-3 flex flex-col gap-3 rounded-lg border border-white/10 bg-white/7 p-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-pix-yellow text-caption font-bold text-pix-blue">{initials(user.full_name)}</span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-semibold">{user.full_name}</span>
            <span className="text-caption text-white/60">{ROLE_LABEL[user.role]}</span>
          </div>
        </div>
        <button type="button" disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })}
          className="flex items-center gap-2 text-caption text-white/70 hover:text-white">
          <LogOut aria-hidden className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 md:block">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-64">{sidebar}</div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:px-6">
          <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="rounded-lg p-2 md:hidden" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
          </button>
          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-body text-ink-muted">
                {crumbs.map((crumb, i) => (
                  <li key={`${crumb}-${i}`} className="flex items-center gap-2" {...(i === crumbs.length - 1 && { 'aria-current': 'page' })}>
                    {i > 0 && <span aria-hidden>›</span>}
                    <span className={i === crumbs.length - 1 ? 'font-semibold text-ink' : undefined}>{crumb}</span>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {/* Auditors receive no notifications (D19). */}
          {user.role !== 'auditor' && <div className="ml-auto"><NotificationBell /></div>}
        </header>
        <main id="main" className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
