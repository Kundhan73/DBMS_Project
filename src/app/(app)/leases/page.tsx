'use client';
import { useState } from 'react';
import { apiFetch, qs, useApi } from '@/lib/client';
import { date, inr, todayISO } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Pagination, Select, StatusBadge, Table, Td, Tabs, Textarea, Th } from '@/components/ui';

export default function LeasesPage() {
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const [f, setF] = useState({ status: 'ACTIVE', complexId: '', q: '', expiringWithin: '', page: 1 });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? Number(v) : 1 }));
  const { data, error, loading, reload } = useApi(`/api/leases${qs(f)}`);
  const [creating, setCreating] = useState(false);
  const [terminating, setTerminating] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Leases" subtitle="Rental agreements across units"
        actions={staff && <Button onClick={() => setCreating(true)}>New lease</Button>} />
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 px-6 pb-4 pt-5">
          <Tabs value={f.status} onChange={(v) => set('status', v)} options={[
            { value: 'ACTIVE', label: 'Active' }, { value: 'PENDING', label: 'Upcoming' }, { value: 'ENDED', label: 'Ended' },
            { value: 'TERMINATED', label: 'Terminated' }, { value: '', label: 'All' }]} />
          {staff && <>
            <Input placeholder="Tenant or unit…" value={f.q} onChange={(e) => set('q', e.target.value)} className="w-52" />
            <Select value={f.complexId} onChange={(e) => set('complexId', e.target.value)} className="w-48">
              <option value="">All complexes</option>
              {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}
            </Select>
            <Select value={f.expiringWithin} onChange={(e) => set('expiringWithin', e.target.value)} className="w-44">
              <option value="">Any end date</option><option value="30">Ending ≤ 30 days</option><option value="60">Ending ≤ 60 days</option>
            </Select>
          </>}
        </div>
        <ErrorBox message={error} />
        {loading && !data ? <Loading /> : (
          <>
            <Table>
              <thead><tr><Th>Unit</Th><Th>Tenant</Th><Th>Period</Th><Th right>Rent</Th><Th right>Deposit</Th><Th right>Due day</Th><Th>Status</Th>{staff && <Th></Th>}</tr></thead>
              <tbody>
                {(data?.rows ?? []).map((l: any) => (
                  <tr key={l.lease_id}>
                    <Td><span className="font-medium">{l.block_name}-{l.unit_number}</span><div className="text-[11px] text-faint">{l.complex_name} · {l.unit_type}</div></Td>
                    <Td>{l.tenant_name}</Td>
                    <Td className="whitespace-nowrap">{date(l.start_date)} → {date(l.terminated_on ?? l.end_date)}
                      {l.status === 'ACTIVE' && l.days_left <= 60 && <div className="text-[11px] text-amber-700">{l.days_left} days left</div>}
                      {l.termination_reason && <div className="text-[11px] text-faint">{l.termination_reason}</div>}</Td>
                    <Td right>{inr(l.monthly_rent)}</Td>
                    <Td right>{inr(l.security_deposit)}</Td>
                    <Td right>{l.rent_due_day}</Td>
                    <Td><StatusBadge value={l.status} /></Td>
                    {staff && <Td>{l.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setTerminating(l)}>Terminate</Button>}</Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', p)} />}
          </>
        )}
      </Card>
      {creating && <NewLease onClose={() => setCreating(false)} onDone={(m) => { setCreating(false); setNotice(m); reload(); }} />}
      {terminating && <Terminate lease={terminating} onClose={() => setTerminating(null)} onDone={(m) => { setTerminating(null); setNotice(m); reload(); }} />}
    </>
  );
}

function NewLease({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const me = useMe();
  const [complexId, setComplexId] = useState(String(me.complexes[0]?.complex_id ?? ''));
  const units = useApi(`/api/units${qs({ complexId, status: 'VACANT' })}`);
  const [tq, setTq] = useState('');
  const tenants = useApi(`/api/people${qs({ role: 'TENANT', q: tq, active: 1 })}`);
  const today = todayISO();
  const elevenMonths = (d: string) => { const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + 11); return x.toLocaleDateString('en-CA'); };
  const [form, setForm] = useState({ unit_id: '', tenant_user_id: '', start_date: today, end_date: elevenMonths(today), monthly_rent: '', security_deposit: '', rent_due_day: '5' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  // picking a unit pre-fills its asking rent and a 3-month deposit
  const pickUnit = (unitId: string) => {
    const u = units.data?.rows?.find((x: any) => String(x.unit_id) === unitId);
    setForm((p) => ({ ...p, unit_id: unitId, ...(u ? { monthly_rent: String(u.base_rent), security_deposit: String(u.base_rent * 3) } : {}) }));
  };
  // default an 11-month term (standard in Bengaluru)
  const pickStart = (d: string) => setForm((p) => ({ ...p, start_date: d, end_date: d ? elevenMonths(d) : p.end_date }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const l = await apiFetch<any>('/api/leases', { method: 'POST', body: {
        unit_id: Number(form.unit_id), tenant_user_id: Number(form.tenant_user_id), start_date: form.start_date, end_date: form.end_date,
        monthly_rent: Number(form.monthly_rent), security_deposit: Number(form.security_deposit), rent_due_day: Number(form.rent_due_day) } });
      onDone(`Lease #${l.lease_id} created (${l.status.toLowerCase()}).`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="New lease" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Complex"><Select value={complexId} onChange={(e) => { setComplexId(e.target.value); upd('unit_id', ''); }}>
          {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}</Select></Field>
        <Field label="Vacant unit"><Select value={form.unit_id} onChange={(e) => pickUnit(e.target.value)}>
          <option value="">Select…</option>
          {(units.data?.rows ?? []).map((u: any) => <option key={u.unit_id} value={u.unit_id}>{u.block_name}-{u.unit_number} · {u.unit_type} · {inr(u.base_rent)}</option>)}
        </Select></Field>
        <Field label="Find tenant"><Input placeholder="Type a name…" value={tq} onChange={(e) => setTq(e.target.value)} /></Field>
        <Field label="Tenant"><Select value={form.tenant_user_id} onChange={(e) => upd('tenant_user_id', e.target.value)}>
          <option value="">Select…</option>
          {(tenants.data?.rows ?? []).map((t: any) => <option key={t.user_id} value={t.user_id}>{t.full_name} {t.current_units ? '(has a lease)' : ''}</option>)}
        </Select></Field>
        <Field label="Start date"><Input type="date" value={form.start_date} onChange={(e) => pickStart(e.target.value)} /></Field>
        <Field label="End date" hint="Defaults to 11 months"><Input type="date" value={form.end_date} onChange={(e) => upd('end_date', e.target.value)} /></Field>
        <Field label="Monthly rent (₹)"><Input type="number" value={form.monthly_rent} onChange={(e) => upd('monthly_rent', e.target.value)} /></Field>
        <Field label="Security deposit (₹)" hint="Max 10 months' rent (enforced by the database)"><Input type="number" value={form.security_deposit} onChange={(e) => upd('security_deposit', e.target.value)} /></Field>
        <Field label="Rent due day"><Input type="number" min={1} max={28} value={form.rent_due_day} onChange={(e) => upd('rent_due_day', e.target.value)} /></Field>
      </div>
      <div className="mt-3"><ErrorBox message={err} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !form.unit_id || !form.tenant_user_id}>{busy ? 'Saving…' : 'Create lease'}</Button>
      </div>
    </Modal>
  );
}

function Terminate({ lease, onClose, onDone }: { lease: any; onClose: () => void; onDone: (m: string) => void }) {
  const [on, setOn] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    try {
      const r = await apiFetch<any>(`/api/leases/${lease.lease_id}/terminate`, { method: 'POST', body: { terminated_on: on, reason } });
      onDone(`Lease #${lease.lease_id} terminated. ${r.voidedInvoices} future rent invoice(s) voided, parking released.`);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Terminate lease · ${lease.block_name}-${lease.unit_number}`}>
      <p className="mb-3 text-[13px] text-muted">Runs the <code className="rounded bg-fill px-1">sp_terminate_lease</code> procedure as one transaction: the lease is closed, unpaid rent for later months is voided, the tenant&apos;s parking is released and the unit becomes vacant.</p>
      <div className="space-y-3">
        <Field label="Termination date"><Input type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Tenant relocating for work" /></Field>
        <ErrorBox message={err} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={submit}>Terminate lease</Button></div>
    </Modal>
  );
}
