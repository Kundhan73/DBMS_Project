'use client';
import { useState } from 'react';
import { useApi } from '@/lib/client';
import { Badge, Card, cx, Empty, ErrorBox, Loading, PageHeader, Table, Td, Th } from '@/components/ui';

const fmt = (v: unknown) => {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString('en-IN');
  return String(v);
};

export default function ReportsPage() {
  const list = useApi<any[]>('/api/reports');
  const [key, setKey] = useState('defaulters');
  const [showSql, setShowSql] = useState(false);
  const rep = useApi(`/api/reports?name=${key}`);
  const cols = rep.data?.rows?.[0] ? Object.keys(rep.data.rows[0]) : [];

  return (
    <>
      <PageHeader title="Reports" subtitle="Analytical queries over your complexes. Each report shows the SQL it runs." />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card pad={false}>
          {!list.data ? <Loading /> : (
            <nav className="p-1.5">
              {list.data.map((r) => (
                <button key={r.key} onClick={() => setKey(r.key)} className={cx('block w-full rounded-xl px-3 py-2 text-left text-[13px]', key === r.key ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-neutral-50')}>
                  {r.title}
                </button>
              ))}
            </nav>
          )}
        </Card>
        <div className="min-w-0 space-y-4">
          <ErrorBox message={rep.error} />
          {!rep.data ? <Loading /> : <>
            <Card title={rep.data.title} actions={<button className="text-[12px] text-brand-600 hover:underline" onClick={() => setShowSql((s) => !s)}>{showSql ? 'Hide SQL' : 'Show SQL'}</button>}>
              <p className="text-[13px] text-muted">{rep.data.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">{rep.data.concepts.map((c: string) => <Badge key={c} tone="blue">{c}</Badge>)}</div>
              {showSql && <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-900 p-3 font-mono text-[12px] leading-relaxed text-neutral-100">{rep.data.sql}</pre>}
              <div className="mt-2 text-[11px] text-faint">{rep.data.rows.length} rows · {rep.data.took_ms} ms</div>
            </Card>
            <Card pad={false}>
              {rep.data.rows.length === 0 ? <Empty>No rows.</Empty> : (
                <Table>
                  <thead><tr>{cols.map((c) => <Th key={c}>{c.replace(/_/g, ' ')}</Th>)}</tr></thead>
                  <tbody>{rep.data.rows.map((row: any, i: number) => (
                    <tr key={i} className={String(row.complex ?? '').startsWith('ALL') || row.invoice_type === 'SUBTOTAL' ? 'bg-neutral-50 font-medium' : ''}>
                      {cols.map((c) => <Td key={c} right={typeof row[c] === 'number'}>{fmt(row[c])}</Td>)}
                    </tr>))}</tbody>
                </Table>
              )}
            </Card>
          </>}
        </div>
      </div>
    </>
  );
}
