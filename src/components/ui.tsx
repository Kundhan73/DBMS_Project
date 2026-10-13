'use client';
import { useEffect, type ReactNode } from 'react';
import { titleCase } from '@/lib/format';

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

/** Large Apple-style page headline with an optional eyebrow and sub-headline. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="headline text-[32px] text-ink sm:text-40px">{title}</h1>
        {subtitle && <p className="mt-2 text-17px leading-snug text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2.5">{actions}</div>}
    </div>
  );
}

/** White tile with large radius; headers are quiet, content breathes. */
export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('rise min-w-0 overflow-hidden rounded-tile bg-surface shadow-tile', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-6 pb-1 pt-5">
          <h2 className="text-17px font-semibold tracking-tight text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? 'px-6 pb-6 pt-4' : 'pt-2'}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rise rounded-tile bg-surface px-5 py-5 shadow-tile">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={cx('mt-2 text-28px font-semibold tabular leading-none tracking-tight',
        tone === 'good' && 'text-[#1d8a3a]', tone === 'warn' && 'text-orange', tone === 'bad' && 'text-[#d70015]', !tone && 'text-ink')}>{value}</div>
      {hint && <div className="mt-2 text-[12px] leading-snug text-faint">{hint}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-[#e3f5e6] text-[#1b6e2f]',
  amber: 'bg-secondary-50 text-secondary-700',
  red: 'bg-[#fde8ea] text-[#b0000f]',
  blue: 'bg-brand-50 text-brand-700',
  violet: 'bg-[#efebff] text-[#5b3fd6]',
  gray: 'bg-fill text-neutral-700',
};
const STATUS_TONE: Record<string, keyof typeof TONES> = {
  ACTIVE: 'green', PAID: 'green', RESOLVED: 'green', CLOSED: 'gray', LEASED: 'green',
  PENDING: 'blue', ASSIGNED: 'blue', OWNER_OCCUPIED: 'blue', PARTIAL: 'amber', IN_PROGRESS: 'violet',
  OPEN: 'amber', UNPAID: 'red', VACANT: 'amber', UNDER_MAINTENANCE: 'violet', TERMINATED: 'red',
  ENDED: 'gray', VOID: 'gray', CANCELLED: 'gray', URGENT: 'red', HIGH: 'amber', MEDIUM: 'blue', LOW: 'gray',
  ADMIN: 'violet', MANAGER: 'blue', OWNER: 'green', TENANT: 'amber',
};

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-medium leading-none', TONES[tone])}>{children}</span>;
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <Badge tone={STATUS_TONE[value] ?? 'gray'}>{titleCase(value)}</Badge>;
}

/** Pill buttons: blue primary, grey secondary, text-link ghost. */
export function Button({ children, variant = 'primary', size = 'md', className, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={cx('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-normal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/30 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 px-3 text-[12px]' : 'h-9 px-[18px] text-14px',
        variant === 'primary' && 'bg-action text-white hover:bg-action-hover',
        variant === 'secondary' && 'bg-fill text-ink hover:bg-neutral-200',
        variant === 'danger' && 'bg-[#e30000] text-white hover:bg-[#c60000]',
        variant === 'ghost' && 'px-1.5 text-brand-600 hover:underline',
        className)}
    >{children}</button>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-snug text-faint">{hint}</span>}
    </label>
  );
}

// width utilities passed by the caller replace the default w-full
const withWidth = (base: string, extra?: string) => (extra && /(^|\s)w-/.test(extra) ? base.replace('w-full ', '') : base);
const inputCls = 'h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-14px text-ink outline-none transition-shadow placeholder:text-faint focus:border-action focus:ring-4 focus:ring-action/15';
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(withWidth(inputCls, props.className), props.className)} />;
}
export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(withWidth(inputCls, props.className), 'appearance-none bg-[length:10px] bg-[right_14px_center] bg-no-repeat pr-9', props.className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%236e6e73' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", ...props.style }}>{children}</select>;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'h-auto min-h-28 py-2.5 leading-relaxed', props.className)} />;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[9vh] backdrop-blur-[6px]" onMouseDown={onClose}>
      <div className={cx('rise w-full rounded-[22px] bg-surface shadow-lift', wide ? 'max-w-2xl' : 'max-w-md')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-7 pb-2 pt-6">
          <h3 className="headline text-24px">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-fill text-[13px] text-muted hover:bg-neutral-200 hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="px-7 pb-7 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-[13px]">{children}</table></div>;
}
export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cx('whitespace-nowrap border-b border-hair px-4 pb-2.5 pt-3 text-[12px] font-medium text-faint first:pl-6 last:pr-6', right && 'text-right', className)}>{children}</th>;
}
export function Td({ children, right, className, mono }: { children?: ReactNode; right?: boolean; className?: string; mono?: boolean }) {
  return <td className={cx('border-b border-hair px-4 py-3 align-top first:pl-6 last:pr-6', right && 'text-right tabular', mono && 'font-mono text-[12px] text-muted', className)}>{children}</td>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-6 py-4 text-[12px] text-muted">
      <span>{total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="rounded-xl bg-[#fde8ea] px-4 py-3 text-[13px] text-[#9d000d]" role="alert">{message}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="rise rounded-xl bg-brand-50 px-4 py-3 text-[13px] text-brand-800">{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 px-3 py-14 text-[13px] text-faint">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-500" />{label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-14px text-faint">{children}</div>;
}

/** iOS-style segmented control. */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full bg-fill p-[3px]">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx('rounded-full px-3.5 py-[6px] text-[12px] font-medium transition-all duration-200',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)]' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Toolbar row that sits at the top of a table card. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5 px-6 pb-4 pt-5">{children}</div>;
}
