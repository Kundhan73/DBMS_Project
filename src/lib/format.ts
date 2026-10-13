const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export const inr = (n: number | null | undefined) => (n == null ? '—' : inrFmt.format(Number(n)));

/** ₹12.4L / ₹1.2Cr style for dashboards */
export function inrShort(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e7) return `₹${inrCompact.format(v / 1e7)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${inrCompact.format(v / 1e5)}L`;
  if (Math.abs(v) >= 1e3) return `₹${inrCompact.format(v / 1e3)}K`;
  return inr(v);
}

export function date(d: string | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function monthLabel(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export const titleCase = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUpi\b/, 'UPI').replace(/\bEv\b/, 'EV');

export function hoursLabel(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export const todayISO = () => new Date().toLocaleDateString('en-CA');
