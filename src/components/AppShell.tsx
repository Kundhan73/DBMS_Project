'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiFetch, useApi } from '@/lib/client';
import { titleCase } from '@/lib/format';
import { SessionContext, type Me } from './session';
import { cx, Loading } from './ui';

type Item = { href: string; label: string; roles?: string[] };
const NAV: Item[] = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/complexes', label: 'Complexes', roles: ['ADMIN', 'MANAGER'] },
  { href: '/units', label: 'Units' },
  { href: '/leases', label: 'Leases' },
  { href: '/billing', label: 'Billing' },
  { href: '/parking', label: 'Parking' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/people', label: 'People', roles: ['ADMIN', 'MANAGER'] },
  { href: '/reports', label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
  { href: '/audit', label: 'Audit', roles: ['ADMIN'] },
];

/** Product mark: a stylised building, drawn here (no third-party logo). */
export function Mark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4 21V9.5L12 3l8 6.5V21h-5.5v-5.5h-5V21H4zm4.2-9.3h2.2V9.5H8.2v2.2zm5.4 0h2.2V9.5h-2.2v2.2z" />
    </svg>
  );
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { data: me, error } = useApi<Me>('/api/auth/me');
  const path = usePathname();
  const [menu, setMenu] = useState(false);     // mobile full-screen nav
  const [account, setAccount] = useState(false); // account popover
  const accRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (accRef.current && !accRef.current.contains(e.target as Node)) setAccount(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (error) return <div className="p-10 text-center text-sm text-muted">{error} <Link className="text-brand-600 underline" href="/login">Sign in</Link></div>;
  if (!me) return <Loading />;

  const items = NAV.filter((n) => !n.roles || n.roles.includes(me.user.role));
  const logout = async () => { await apiFetch('/api/auth/logout', { method: 'POST', body: {} }); window.location.href = '/login'; };
  const active = (href: string) => path === href || path.startsWith(href + '/');

  return (
    <SessionContext.Provider value={me}>
      <div className="min-h-screen">
        {/* top navigation bar: translucent material, 48px tall, small link text */}
        <header className="material sticky top-0 z-40 border-b border-black/[0.06]">
          <nav className="mx-auto flex h-12 max-w-[1180px] items-center gap-2 px-4 sm:px-6">
            <Link href="/dashboard" className="mr-3 flex items-center gap-2 text-ink/90 hover:text-ink" aria-label="AptManager home">
              <Mark />
              <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">AptManager</span>
            </Link>
            <div className="no-scrollbar hidden flex-1 items-center justify-center gap-1 overflow-x-auto md:flex">
              {items.map((n) => (
                <Link key={n.href} href={n.href}
                  className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] transition-colors',
                    active(n.href) ? 'text-ink' : 'text-ink/70 hover:text-ink')}>
                  <span className={cx(active(n.href) && 'border-b border-ink pb-[3px]')}>{n.label}</span>
                </Link>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <div className="relative" ref={accRef}>
                <button onClick={() => setAccount((a) => !a)} aria-label="Account"
                  className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#5e5ce6] to-[#0071e3] text-[11px] font-semibold text-white">
                  {initials(me.user.name)}
                </button>
                {account && (
                  <div className="rise absolute right-0 top-11 w-64 rounded-2xl bg-surface p-2 shadow-lift ring-1 ring-black/5">
                    <div className="px-3 py-2.5">
                      <div className="truncate text-14px font-semibold">{me.user.name}</div>
                      <div className="truncate text-[12px] text-muted">{me.user.email}</div>
                      <div className="mt-1 text-[12px] text-faint">{titleCase(me.user.role)}{me.user.role === 'MANAGER' && ` · ${me.complexes.length} complex${me.complexes.length === 1 ? '' : 'es'}`}</div>
                    </div>
                    <div className="my-1 h-px bg-hair" />
                    <button onClick={logout} className="w-full rounded-xl px-3 py-2 text-left text-14px text-brand-600 hover:bg-neutral-50">Sign out</button>
                  </div>
                )}
              </div>
              <button onClick={() => setMenu((m) => !m)} className="grid h-8 w-8 place-items-center rounded-full text-ink md:hidden" aria-label="Menu">
                <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  {menu ? <path d="M4 4l10 10M14 4L4 14" /> : <path d="M2 6h14M2 12h14" />}
                </svg>
              </button>
            </div>
          </nav>
          {menu && (
            <div className="rise border-t border-black/[0.06] px-6 pb-6 pt-2 md:hidden">
              {items.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMenu(false)}
                  className={cx('block py-2.5 text-24px font-semibold tracking-tight', active(n.href) ? 'text-ink' : 'text-ink/60')}>{n.label}</Link>
              ))}
            </div>
          )}
        </header>
        <main className="mx-auto max-w-[1180px] px-4 pb-20 pt-10 sm:px-6">{children}</main>
        <footer className="border-t border-hair bg-bg">
          <div className="mx-auto max-w-[1180px] px-4 py-6 text-[12px] text-faint sm:px-6">
            AptManager · Multi-complex apartment management · PostgreSQL + pgvector · DBMS Level 3 project
          </div>
        </footer>
      </div>
    </SessionContext.Provider>
  );
}
