'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, qs, useApi } from '@/lib/client';
import { INVOICE_TYPES } from '@/lib/constants';
import { date, dateTime, inr, monthLabel, titleCase } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Pagination, Select, Stat, StatusBadge, Table, Td, Tabs, Th } from '@/components/ui';

export default function BillingPage() {
  return <Suspense><Billing /></Suspense>;
}

function Billing() {
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const sp = useSearchParams();
  const [view, setView] = useState<'invoices' | 'payments'>('invoices');
  const [f, setF] = useState({ status: 'OPEN', type: '', complexId: '', month: '', overdue: sp.get('overdue') ?? '', q: '', page: 1 });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? Number(v) : 1 }));
  const inv = useApi(view === 'invoices' ? `/api/invoices${qs(f)}` : null);
  const pays = useApi<any[]>(view === 'payments' ? '/api/payments' : null);
  const [paying, setPaying] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lateFees = async () => {
    setErr(null);
    try { const r = await apiFetch<any>('/api/invoices/late-fees', { method: 'POST', body: {} }); setNotice(`${r.lateFeesCreated} late-fee invoice(s) created.`); inv.reload(); }
    catch (e) { setErr((e as Error).message); }
  };
  const reverse = async (p: any) => {
    if (!confirm(`Reverse payment ${p.reference_no} of ${inr(p.amount)}? The invoice balance will be restored.`)) return;
    try { const r = await apiFetch<any>(`/api/payments/${p.payment_id}`, { method: 'DELETE' }); setNotice(`Payment reversed. Invoice #${r.invoice.invoice_id} is now ${r.invoice.status.toLowerCase()}.`); pays.reload(); }
    catch (e) { setErr((e as Error).message); }
  };
  const t = inv.data?.totals;

  return (
    <>
      <PageHeader title="Billing" subtitle={staff ? 'Invoices and payments for your complexes' : 'Your invoices and payments'}
        actions={<>
          <Tabs value={view} onChange={setView} options={[{ value: 'invoices', label: 'Invoices' }, { value: 'payments', label: 'Recent payments' }]} />
          {me.user.role === 'ADMIN' && <><Button variant="secondary" onClick={lateFees}>Apply late fees</Button><Button onClick={() => setGenOpen(true)}>Run monthly billing</Button></>}
        </>} />
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      <div className="mb-4"><ErrorBox message={err} /></div>

      {view === 'invoices' && <>
        {t && <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Billed (filtered)" value={inr(t.billed)} />
          <Stat label="Paid" value={inr(t.paid)} tone="good" />
          <Stat label="Outstanding" value={inr(t.outstanding)} tone={t.outstanding > 0 ? 'bad' : 'good'} />
          <Stat label="Overdue invoices" value={t.overdue} tone={t.overdue ? 'warn' : 'good'} />
        </div>}
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 px-6 pb-4 pt-5">
            <Tabs value={f.status} onChange={(v) => set('status', v)} options={[{ value: 'OPEN', label: 'Open' }, { value: 'PAID', label: 'Paid' }, { value: 'VOID', label: 'Void' }, { value: '', label: 'All' }]} />
            <Select value={f.type} onChange={(e) => set('type', e.target.value)} className="w-40"><option value="">All types</option>{INVOICE_TYPES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
            {staff && <Select value={f.complexId} onChange={(e) => set('complexId', e.target.value)} className="w-48"><option value="">All complexes</option>
              {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}</Select>}
            <Input type="month" value={f.month} onChange={(e) => set('month', e.target.value)} className="w-40" />
            <label className="flex items-center gap-1.5 text-[12px] text-muted"><input type="checkbox" checked={f.overdue === '1'} onChange={(e) => set('overdue', e.target.checked ? '1' : '')} />Overdue only</label>
            {staff && <Input placeholder="Resident, unit or #id…" value={f.q} onChange={(e) => set('q', e.target.value)} className="w-48" />}
          </div>
          <ErrorBox message={inv.error} />
          {inv.loading && !inv.data ? <Loading /> : (
            <>
              <Table>
                <thead><tr><Th>#</Th><Th>Month</Th><Th>Type</Th>{staff && <Th>Billed to</Th>}<Th>Unit</Th><Th right>Amount</Th><Th right>Paid</Th><Th right>Balance</Th><Th>Due</Th><Th>Status</Th><Th></Th></tr></thead>
                <tbody>
                  {(inv.data?.rows ?? []).map((r: any) => (
                    <tr key={r.invoice_id}>
                      <Td mono>{r.invoice_id}</Td>
                      <Td className="whitespace-nowrap">{monthLabel(r.billing_month)}</Td>
                      <Td>{titleCase(r.invoice_type)}{r.notes && <div className="max-w-56 truncate text-[11px] text-faint" title={r.notes}>{r.notes}</div>}</Td>
                      {staff && <Td>{r.billed_to_name}<div className="text-[11px] text-faint">{titleCase(r.billed_to_role)}</div></Td>}
                      <Td>{r.block_name}-{r.unit_number}<div className="text-[11px] text-faint">{r.complex_name}</div></Td>
                      <Td right>{inr(r.amount)}</Td>
                      <Td right>{inr(r.amount_paid)}</Td>
                      <Td right className={r.balance > 0 && r.status !== 'VOID' ? 'font-medium' : 'text-faint'}>{inr(r.balance)}</Td>
                      <Td className="whitespace-nowrap">{date(r.due_date)}{r.days_overdue > 0 && <div className="text-[11px] text-red-700">{r.days_overdue}d overdue</div>}</Td>
                      <Td><StatusBadge value={r.status} /></Td>
                      <Td>{['UNPAID', 'PARTIAL'].includes(r.status) && <Button size="sm" onClick={() => setPaying(r)}>{staff ? 'Record' : 'Pay'}</Button>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {inv.data && <Pagination page={inv.data.page} pageSize={inv.data.pageSize} total={inv.data.total} onPage={(p) => set('page', p)} />}
            </>
          )}
        </Card>
      </>}

      {view === 'payments' && (
        <Card pad={false} title="Latest 50 payments">
          {!pays.data ? <Loading /> : (
            <Table>
              <thead><tr><Th>Paid at</Th><Th>Reference</Th><Th>Method</Th><Th>Invoice</Th>{staff && <Th>Payer</Th>}<Th>Unit</Th><Th right>Amount</Th><Th>Recorded by</Th>{me.user.role === 'ADMIN' && <Th></Th>}</tr></thead>
              <tbody>{pays.data.map((p) => (
                <tr key={p.payment_id}>
                  <Td className="whitespace-nowrap">{dateTime(p.paid_at)}</Td><Td mono>{p.reference_no}</Td><Td>{titleCase(p.method)}</Td>
                  <Td>#{p.invoice_id} · {titleCase(p.invoice_type)} {monthLabel(p.billing_month)}</Td>
                  {staff && <Td>{p.billed_to_name}</Td>}
                  <Td>{p.block_name}-{p.unit_number}</Td><Td right>{inr(p.amount)}</Td><Td>{p.recorded_by_name ?? '—'}</Td>
                  {me.user.role === 'ADMIN' && <Td><Button size="sm" variant="ghost" onClick={() => reverse(p)}>Reverse</Button></Td>}
                </tr>))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {paying && <PayModal invoice={paying} staff={staff} onClose={() => setPaying(null)} onDone={(m) => { setPaying(null); setNotice(m); inv.reload(); }} />}
      {genOpen && <GenerateModal onClose={() => setGenOpen(false)} onDone={(m) => { setGenOpen(false); setNotice(m); inv.reload(); }} />}
    </>
  );
}

function PayModal({ invoice, staff, onClose, onDone }: { invoice: any; staff: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState(String(invoice.balance));
  const [method, setMethod] = useState(staff ? 'CASH' : 'UPI');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const p = await apiFetch<any>('/api/payments', { method: 'POST', body: { invoice_id: invoice.invoice_id, amount: Number(amount), method, reference_no: ref || undefined } });
      onDone(`Payment ${p.reference_no} of ${inr(p.amount)} recorded. Invoice #${invoice.invoice_id} is now ${p.invoice_status.toLowerCase()}.`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const methods = staff ? ['CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'CARD'] : ['UPI', 'CARD', 'BANK_TRANSFER'];
  return (
    <Modal open onClose={onClose} title={`${staff ? 'Record payment' : 'Pay'} · invoice #${invoice.invoice_id}`}>
      <div className="mb-3 rounded-xl bg-neutral-50 p-3 text-[13px]">
        {titleCase(invoice.invoice_type)} for {monthLabel(invoice.billing_month)} · {invoice.block_name}-{invoice.unit_number}<br />
        Amount {inr(invoice.amount)} · paid {inr(invoice.amount_paid)} · <b>balance {inr(invoice.balance)}</b>
      </div>
      <div className="space-y-3">
        <Field label="Amount (₹)" hint="Part payments are allowed; paying more than the balance is rejected by the database."><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</Select></Field>
        <Field label="Reference (optional)" hint="UTR / cheque number. Generated if left blank."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
        {!staff && <p className="text-[12px] text-faint">This is a simulated payment for the project demo; no money moves.</p>}
        <ErrorBox message={err} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? 'Processing…' : staff ? 'Record payment' : `Pay ${inr(Number(amount))}`}</Button></div>
    </Modal>
  );
}

function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA').slice(0, 7));
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    try {
      const r = await apiFetch<any>('/api/invoices/generate', { method: 'POST', body: { month } });
      const parts = r.created.map((c: any) => `${c.invoices_created} ${c.invoice_type.toLowerCase()}`).join(', ');
      onDone(`Billing run for ${month}: ${parts} invoice(s) created. Items already billed were skipped.`);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title="Run monthly billing">
      <p className="mb-3 text-[13px] text-muted">Calls <code className="rounded bg-fill px-1">fn_generate_monthly_invoices</code>: rent (prorated for partial months), maintenance and parking for every active lease, unit and allocation. Running it twice for the same month creates nothing new.</p>
      <Field label="Billing month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      <div className="mt-3"><ErrorBox message={err} /></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Generate invoices</Button></div>
    </Modal>
  );
}
