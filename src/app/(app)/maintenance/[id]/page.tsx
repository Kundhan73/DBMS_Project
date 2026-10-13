'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { apiFetch, useApi } from '@/lib/client';
import { dateTime, inr, titleCase } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Button, Card, cx, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Td, Textarea, Th } from '@/components/ui';

export default function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const { data, error, reload } = useApi(`/api/maintenance/${id}`);
  const [modal, setModal] = useState<null | 'assign' | 'resolve' | 'close'>(null);
  const [err, setErr] = useState<string | null>(null);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const { request: r, history, similar, vendors } = data;
  const mine = r.raised_by === me.user.id;

  const act = async (body: any) => {
    setErr(null);
    try { await apiFetch(`/api/maintenance/${id}`, { method: 'PATCH', body }); setModal(null); reload(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <PageHeader title={r.title} subtitle={<>#{r.request_id} · {r.complex_name} {r.block_name}-{r.unit_number} · raised by {r.raised_by_name} on {dateTime(r.created_at)}</>}
        actions={<Link href="/maintenance" className="text-[13px] text-brand-600 hover:underline">← All requests</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge value={r.status} /><StatusBadge value={r.priority} /><span className="text-[12px] text-muted">{titleCase(r.category)}{r.is_common_area && ' · common area'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {staff && r.status === 'OPEN' && <Button onClick={() => setModal('assign')}>Assign vendor</Button>}
          {staff && r.status === 'ASSIGNED' && <><Button onClick={() => act({ action: 'start' })}>Mark in progress</Button><Button variant="secondary" onClick={() => act({ action: 'unassign' })}>Unassign</Button></>}
          {staff && r.status === 'IN_PROGRESS' && <Button onClick={() => setModal('resolve')}>Mark resolved</Button>}
          {r.status === 'RESOLVED' && (staff || mine) && <><Button onClick={() => setModal('close')}>{staff ? 'Close' : 'Confirm fixed & rate'}</Button><Button variant="secondary" onClick={() => act({ action: 'reopen' })}>Reopen</Button></>}
          {((staff && ['OPEN', 'ASSIGNED'].includes(r.status)) || (mine && r.status === 'OPEN')) && <Button variant="secondary" onClick={() => confirm('Cancel this request?') && act({ action: 'cancel' })}>Cancel request</Button>}
        </div>
      </div>
      <ErrorBox message={err} />
      <div className="mt-2 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Description"><p className="whitespace-pre-wrap text-[14px] leading-relaxed">{r.description}</p>
            {r.resolution_notes && <div className="mt-4 rounded-xl bg-[#e3f5e6] p-4 text-[13px] text-[#1b6e2f]"><b>Resolution:</b> {r.resolution_notes}</div>}</Card>
          {staff && (
            <Card title="Similar past requests" pad={false} actions={<span className="text-[11px] text-faint">nearest neighbours by embedding · fn_similar_requests</span>}>
              {similar.length === 0 ? <Empty>No embedding yet.</Empty> : (
                <Table>
                  <thead><tr><Th right>Similarity</Th><Th>Request</Th><Th>How it was fixed</Th><Th right>Cost</Th></tr></thead>
                  <tbody>{similar.map((s: any) => (
                    <tr key={s.request_id}>
                      <Td right className="font-semibold text-brand-600">{Math.round(s.similarity * 100)}%</Td>
                      <Td><Link className="text-brand-600 hover:underline" href={`/maintenance/${s.request_id}`}>{s.title}</Link><div className="text-[11px] text-faint">#{s.request_id} · {s.complex_name} · {titleCase(s.status)}</div></Td>
                      <Td className="max-w-xs text-[12px]">{s.resolution_notes ?? '—'}{s.vendor_name && <div className="text-faint">{s.vendor_name}</div>}</Td>
                      <Td right>{inr(s.actual_cost)}</Td>
                    </tr>))}</tbody>
                </Table>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
              <dt className="text-muted">Vendor</dt><dd>{r.vendor_name ?? '—'}{r.vendor_phone && <div className="text-[11px] text-faint">{r.vendor_phone}</div>}</dd>
              <dt className="text-muted">Estimate</dt><dd>{inr(r.estimated_cost)}</dd>
              <dt className="text-muted">Actual cost</dt><dd>{inr(r.actual_cost)}</dd>
              <dt className="text-muted">Assigned</dt><dd>{dateTime(r.assigned_at)}</dd>
              <dt className="text-muted">Resolved</dt><dd>{dateTime(r.resolved_at)}</dd>
              <dt className="text-muted">Rating</dt><dd>{r.tenant_rating ? '★'.repeat(r.tenant_rating) + '☆'.repeat(5 - r.tenant_rating) : '—'}</dd>
              <dt className="text-muted">Embedding</dt><dd>{r.has_embedding ? 'stored (384-d)' : 'missing'}</dd>
            </dl>
          </Card>
          <Card title="Status history">
            <ol className="relative ml-2 border-l border-hair">
              {history.map((h: any) => (
                <li key={h.history_id} className="mb-3 ml-4">
                  <span className={cx('absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full', h.new_status === 'CANCELLED' ? 'bg-neutral-400' : 'bg-action')} />
                  <div className="text-[13px] font-medium">{titleCase(h.new_status)}</div>
                  <div className="text-[11px] text-faint">{dateTime(h.changed_at)} · {h.changed_by_name ?? 'system'}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      {modal === 'assign' && <AssignModal vendors={vendors} category={r.category} onClose={() => setModal(null)} onSubmit={act} />}
      {modal === 'resolve' && <ResolveModal estimate={r.estimated_cost} onClose={() => setModal(null)} onSubmit={act} />}
      {modal === 'close' && <CloseModal staff={staff} onClose={() => setModal(null)} onSubmit={act} />}
    </>
  );
}

function AssignModal({ vendors, category, onClose, onSubmit }: { vendors: any[]; category: string; onClose: () => void; onSubmit: (b: any) => void }) {
  const [vendorId, setVendorId] = useState(String(vendors.find((v) => v.service_category === category)?.vendor_id ?? ''));
  const [est, setEst] = useState('');
  return (
    <Modal open onClose={onClose} title="Assign vendor">
      <div className="space-y-3">
        <Field label="Vendor" hint="Vendors for this category first, ordered by resident rating">
          <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name} · {titleCase(v.service_category)} · {v.avg_resident_rating ?? '–'}★ · {v.jobs} jobs</option>)}
          </Select>
        </Field>
        <Field label="Estimated cost (₹)"><Input type="number" value={est} onChange={(e) => setEst(e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ action: 'assign', vendor_id: Number(vendorId), estimated_cost: est ? Number(est) : undefined })}>Assign</Button></div>
    </Modal>
  );
}

function ResolveModal({ estimate, onClose, onSubmit }: { estimate: number | null; onClose: () => void; onSubmit: (b: any) => void }) {
  const [cost, setCost] = useState(String(estimate ?? ''));
  const [notes, setNotes] = useState('');
  return (
    <Modal open onClose={onClose} title="Mark resolved">
      <div className="space-y-3">
        <Field label="Actual cost (₹)"><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="What was done"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ action: 'resolve', actual_cost: Number(cost), resolution_notes: notes })}>Resolve</Button></div>
    </Modal>
  );
}

function CloseModal({ staff, onClose, onSubmit }: { staff: boolean; onClose: () => void; onSubmit: (b: any) => void }) {
  const [rating, setRating] = useState(staff ? 0 : 5);
  return (
    <Modal open onClose={onClose} title={staff ? 'Close request' : 'Rate the work'}>
      <div className="flex gap-1 text-[28px]">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} className={n <= rating ? 'text-amber-500' : 'text-neutral-300'} aria-label={`${n} stars`}>★</button>)}
      </div>
      {staff && <p className="mt-2 text-[12px] text-faint">Rating is optional when staff close a request.</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ action: 'close', rating: rating || undefined })}>Close request</Button></div>
    </Modal>
  );
}
