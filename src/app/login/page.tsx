'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/client';
import { Mark } from '@/components/AppShell';
import { ErrorBox } from '@/components/ui';

const DEMO = [
  { label: 'Admin', email: 'admin@aptmgr.in', password: 'Admin@123' },
  { label: 'Manager', email: 'ravi.manager@aptmgr.in', password: 'Password@123' },
  { label: 'Owner', email: 'owner@example.com', password: 'Password@123' },
  { label: 'Tenant', email: 'tenant@example.com', password: 'Password@123' },
];

const field = 'peer h-14 w-full rounded-xl border border-line bg-surface px-4 pt-4 text-17px text-ink outline-none transition-shadow focus:border-action focus:ring-4 focus:ring-action/15';
const floatLabel = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-17px text-faint transition-all peer-focus:top-[14px] peer-focus:text-[12px] peer-[:not(:placeholder-shown)]:top-[14px] peer-[:not(:placeholder-shown)]:text-[12px]';

function LoginForm() {
  const next = useSearchParams().get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
      window.location.href = next.startsWith('/') ? next : '/dashboard';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="material sticky top-0 z-10 border-b border-black/[0.06]">
        <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-2 px-6 text-ink/90">
          <Mark /><span className="text-[13px] font-semibold tracking-tight">AptManager</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-16 pt-14 sm:pt-20">
        <div className="rise text-center">
          <div className="eyebrow">Multi-complex apartment management</div>
          <h1 className="headline mx-auto mt-3 max-w-2xl text-40px sm:text-48px">Every flat. Every lease.<br />Every rupee. One place.</h1>
          <p className="mx-auto mt-4 max-w-xl text-19px leading-snug text-muted">
            Occupancy and collections at a glance, a portal for owners and tenants, and maintenance search that understands what residents mean.
          </p>
        </div>

        <div className="rise mt-12 w-full max-w-[420px]" style={{ animationDelay: '80ms' }}>
          <h2 className="headline text-center text-28px">Sign in</h2>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="relative block">
              <input type="email" autoComplete="username" placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} required className={field} />
              <span className={floatLabel}>Email</span>
            </label>
            <label className="relative block">
              <input type="password" autoComplete="current-password" placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} required className={field} />
              <span className={floatLabel}>Password</span>
            </label>
            <ErrorBox message={error} />
            <button type="submit" disabled={busy}
              className="h-12 w-full rounded-xl bg-action text-17px text-white transition-colors hover:bg-action-hover disabled:opacity-50">
              {busy ? 'Signing in…' : 'Continue'}
            </button>
          </form>

          <div className="mt-10 rounded-tile bg-surface p-5 shadow-tile">
            <div className="text-[13px] font-semibold">Try a demo account</div>
            <div className="mt-0.5 text-[12px] text-faint">Fills in the seed-data credentials.</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="rounded-xl bg-neutral-50 px-3 py-2.5 text-left transition-colors hover:bg-brand-50">
                  <div className="text-[13px] font-medium">{d.label}</div>
                  <div className="truncate text-[11px] text-faint">{d.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-hair">
        <div className="mx-auto max-w-[1180px] px-6 py-5 text-[12px] text-faint">DBMS Level 3 project · PostgreSQL + pgvector · Next.js</div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
