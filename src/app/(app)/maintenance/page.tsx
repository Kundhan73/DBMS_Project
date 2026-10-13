'use client';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch, qs, useApi } from '@/lib/client';
import { CATEGORIES, PRIORITIES } from '@/lib/constants';
import { dateTime, hoursLabel, inr, titleCase } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Pagination, Select, StatusBadge, Table, Td, Tabs, Textarea, Th } from '@/components/ui';

const EXAMPLES = ['water dripping from the roof', 'lift is not moving', 'electricity keeps going off', 'insects in the kitchen', 'cupboard door came off'];

export default function MaintenancePage() {
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const [f, setF] = useState({ status: 'ACTIVE', category: '', priority: '', complexId: '', page: 1 });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? Number(v) : 1 }));
  const list = useApi(`/api/maintenance${qs(f)}`);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  return (
    <>
      <PageHeader title="Maintenance" subtitle={staff ? 'Request queue, vendor assignment and semantic search' : 'Report a problem and track it'}
        actions={<Button onClick={() => setCreating(true)}>New request</Button>} />
      {created && (
        <div className="mb-4"><Notice>
          Request <Link className="font-medium underline" href={`/maintenance/${created.request.request_id}`}>#{created.request.request_id}</Link> raised.
          {created.possibleDuplicates.length > 0 && <> Similar open requests in this complex:{' '}
            {created.possibleDuplicates.map((d: any) => <Link key={d.request_id} className="underline" href={`/maintenance/${d.request_id}`}>#{d.request_id} {d.title} ({d.block_name}-{d.unit_number}, {Math.round(d.similarity * 100)}%)</Link>).reduce((a: any, b: any) => [a, '; ', b])}
          </>}
        </Notice></div>
      )}
      <SemanticSearch />
      <Card pad={false} className="mt-4">
        <div className="flex flex-wrap items-center gap-2 px-6 pb-4 pt-5">
          <Tabs value={f.status} onChange={(v) => set('status', v)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'CLOSED', label: 'Closed' }, { value: '', label: 'All' }]} />
          <Select value={f.category} onChange={(e) => set('category', e.target.value)} className="w-40"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          <Select value={f.priority} onChange={(e) => set('priority', e.target.value)} className="w-36"><option value="">Any priority</option>{PRIORITIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
          {staff && <Select value={f.complexId} onChange={(e) => set('complexId', e.target.value)} className="w-48"><option value="">All complexes</option>
            {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}</Select>}
        </div>
        <ErrorBox message={list.error} />
        {list.loading && !list.data ? <Loading /> : (list.data?.rows.length === 0 ? <Empty>No requests match.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>#</Th><Th>Request</Th><Th>Unit</Th><Th>Priority</Th><Th>Status</Th><Th>Vendor</Th><Th right>Age</Th><Th right>Cost</Th></tr></thead>
              <tbody>
                {(list.data?.rows ?? []).map((r: any) => (
                  <tr key={r.request_id} className="hover:bg-neutral-50">
                    <Td mono>{r.request_id}</Td>
                    <Td><Link href={`/maintenance/${r.request_id}`} className="font-medium text-brand-600 hover:underline">{r.title}</Link>
                      <div className="text-[11px] text-faint">{titleCase(r.category)} · {r.raised_by_name} · {dateTime(r.created_at)}</div></Td>
                    <Td>{r.block_name}-{r.unit_number}<div className="text-[11px] text-faint">{r.complex_name}</div></Td>
                    <Td><StatusBadge value={r.priority} /></Td>
                    <Td><StatusBadge value={r.status} /></Td>
                    <Td>{r.vendor_name ?? '—'}</Td>
                    <Td right>{hoursLabel(r.age_hours)}</Td>
                    <Td right>{inr(r.actual_cost ?? r.estimated_cost)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set('page', p)} />}
          </>
        ))}
      </Card>
      {creating && <NewRequest onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); setCreated(r); list.reload(); }} />}
    </>
  );
}

function SemanticSearch() {
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'hybrid' | 'vector' | 'text'>('hybrid');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (query = q, m = mode) => {
    if (query.trim().length < 3) return;
    setBusy(true); setErr(null);
    try { setRes(await apiFetch(`/api/maintenance/search${qs({ q: query, mode: m, k: 8 })}`)); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <Card title="Search requests by meaning" actions={<Tabs value={mode} onChange={(m) => { setMode(m); if (res) run(q, m); }} options={[
      { value: 'hybrid', label: 'Hybrid' }, { value: 'vector', label: 'Semantic' }, { value: 'text', label: 'Keyword' }]} />}>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe the problem in your own words, e.g. “water dripping from the roof”" />
        <Button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
        <span className="text-faint">Try:</span>
        {EXAMPLES.map((x) => <button key={x} onClick={() => { setQ(x); run(x); }} className="rounded-full bg-fill px-3 py-1 text-muted transition-colors hover:bg-brand-50 hover:text-brand-600">{x}</button>)}
      </div>
      <div className="mt-3"><ErrorBox message={err} /></div>
      {res && (
        <div className="mt-3">
          <div className="mb-2 text-[12px] text-faint">{res.results.length} results in {res.took_ms} ms · {res.mode === 'hybrid' ? 'keyword + vector ranks fused (RRF)' : res.mode === 'vector' ? 'cosine similarity on 384-d MiniLM embeddings (pgvector HNSW)' : 'PostgreSQL full-text search (GIN)'}{!staff && ' · limited to your units'}</div>
          {res.results.length === 0 ? <Empty>No matches. {res.mode === 'text' && 'Keyword search needs the same words; try Semantic.'}</Empty> : (
            <div className="divide-y divide-hair overflow-hidden rounded-2xl bg-neutral-50">
              {res.results.map((r: any) => (
                <Link key={r.request_id} href={`/maintenance/${r.request_id}`} className="flex gap-3 px-3 py-2.5 hover:bg-neutral-50">
                  <div className="w-14 shrink-0 pt-0.5 text-right">
                    {r.similarity != null ? <><div className="text-[13px] font-semibold tabular text-brand-600">{Math.round(r.similarity * 100)}%</div><div className="text-[10px] text-faint">similar</div></> : <div className="text-[11px] text-faint">kw #{r.text_rank}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.title}</span><StatusBadge value={r.status} /><span className="text-[11px] text-faint">{titleCase(r.category)} · {r.complex_name} {r.block_name}-{r.unit_number}</span></div>
                    <div className="truncate text-[12px] text-muted">{r.description}</div>
                    {r.resolution_notes && <div className="truncate text-[12px] text-emerald-800">Fix: {r.resolution_notes} {r.vendor_name && `(${r.vendor_name}, ${inr(r.actual_cost)})`}</div>}
                  </div>
                  {res.mode === 'hybrid' && <div className="hidden w-24 shrink-0 text-right text-[11px] text-faint sm:block">vec #{r.vector_rank ?? '–'}<br />kw #{r.text_rank ?? '–'}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function NewRequest({ onClose, onDone }: { onClose: () => void; onDone: (r: any) => void }) {
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const [uq, setUq] = useState('');
  const units = useApi(`/api/units${qs({ q: staff ? uq : '' })}`);
  const [form, setForm] = useState({ unit_id: '', category: 'PLUMBING', priority: 'MEDIUM', title: '', description: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { onDone(await apiFetch('/api/maintenance', { method: 'POST', body: { ...form, unit_id: Number(form.unit_id) } })); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="New maintenance request" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {staff && <Field label="Find unit"><Input value={uq} onChange={(e) => setUq(e.target.value)} placeholder="Unit or resident…" /></Field>}
        <Field label="Unit" className={staff ? '' : 'sm:col-span-2'}><Select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
          <option value="">Select…</option>
          {(units.data?.rows ?? []).map((u: any) => <option key={u.unit_id} value={u.unit_id}>{u.complex_name} · {u.block_name}-{u.unit_number}</option>)}
        </Select></Field>
        <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
        <Field label="Priority"><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
        <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short summary" /></Field>
        <Field label="Description" className="sm:col-span-2" hint="Describe what is happening, where, and since when. This text is embedded for semantic search."><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </div>
      <div className="mt-3"><ErrorBox message={err} /></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !form.unit_id}>{busy ? 'Submitting…' : 'Submit request'}</Button></div>
    </Modal>
  );
}
