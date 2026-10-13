'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { apiFetch, useApi } from '@/lib/client';
import { date, dateTime, inr, titleCase } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Button, Card, Empty, ErrorBox, Field, Loading, Modal, Notice, PageHeader, Select, Stat, StatusBadge, Table, Td, Th } from '@/components/ui';

export default function UnitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const { data, error, reload } = useApi(`/api/units/${id}`);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('VACANT');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const { unit, owners, leases, parking, requests, invoices } = data;

  const save = async () => {
    setErr(null);
    try {
      await apiFetch(`/api/units/${id}`, { method: 'PATCH', body: { occupancy_status: status } });
      setOpen(false); setMsg('Unit status updated.'); reload();
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <PageHeader title={`${unit.block_name}-${unit.unit_number}`} subtitle={`${unit.complex_name} · floor ${unit.floor_no} · ${unit.unit_type} · ${unit.carpet_area_sqft} sqft`}
        actions={<>
          <StatusBadge value={unit.occupancy_status} />
          {staff && <Button variant="secondary" onClick={() => { setStatus(unit.occupancy_status === 'LEASED' ? 'VACANT' : unit.occupancy_status); setOpen(true); }}>Change status</Button>}
        </>} />
      {msg && <div className="mb-4"><Notice>{msg}</Notice></div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Asking rent" value={inr(unit.base_rent)} />
        <Stat label="Current rent" value={inr(unit.monthly_rent)} hint={unit.tenant_name ?? 'No tenant'} />
        <Stat label="Maintenance / month" value={inr(unit.monthly_maintenance)} />
        <Stat label="Lease ends" value={date(unit.lease_end)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Ownership" pad={false}>
          <Table>
            <thead><tr><Th>Owner</Th><Th right>Share</Th><Th>From</Th><Th>Until</Th></tr></thead>
            <tbody>{owners.map((o: any) => (
              <tr key={o.ownership_id} className={o.owned_until ? 'text-faint' : ''}>
                <Td>{o.full_name}<div className="text-[11px] text-faint">{o.email}</div></Td>
                <Td right>{o.share_pct}%</Td><Td>{date(o.owned_from)}</Td><Td>{o.owned_until ? date(o.owned_until) : 'current'}</Td>
              </tr>))}
            </tbody>
          </Table>
        </Card>
        <Card title="Parking" pad={false}>
          {parking.length === 0 ? <Empty>No parking allocated.</Empty> : (
            <Table>
              <thead><tr><Th>Slot</Th><Th>Vehicle</Th><Th>Since</Th><Th right>Charge</Th></tr></thead>
              <tbody>{parking.map((p: any) => (
                <tr key={p.allocation_id}><Td>{p.slot_code} <span className="text-faint">({p.level}, {p.slot_type})</span></Td>
                  <Td mono>{p.registration_no}<div className="font-sans text-[11px] text-faint">{p.make_model}</div></Td>
                  <Td>{date(p.start_date)}</Td><Td right>{inr(p.monthly_charge)}</Td></tr>))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <Card title="Lease history" className="mt-4" pad={false}>
        {leases.length === 0 ? <Empty>No leases.</Empty> : (
          <Table>
            <thead><tr><Th>Tenant</Th><Th>Period</Th><Th right>Rent</Th><Th right>Deposit</Th><Th>Status</Th></tr></thead>
            <tbody>{leases.map((l: any) => (
              <tr key={l.lease_id}><Td>{l.tenant_name}</Td><Td>{date(l.start_date)} → {date(l.terminated_on ?? l.end_date)}</Td>
                <Td right>{inr(l.monthly_rent)}</Td><Td right>{inr(l.security_deposit)}</Td><Td><StatusBadge value={l.status} /></Td></tr>))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {invoices.length > 0 && (
          <Card title="Billing summary (all time)" pad={false}>
            <Table>
              <thead><tr><Th>Type</Th><Th right>Invoices</Th><Th right>Billed</Th><Th right>Paid</Th><Th right>Outstanding</Th></tr></thead>
              <tbody>{invoices.map((r: any) => (
                <tr key={r.invoice_type}><Td>{titleCase(r.invoice_type)}</Td><Td right>{r.invoices}</Td><Td right>{inr(r.billed)}</Td><Td right>{inr(r.paid)}</Td>
                  <Td right className={r.outstanding > 0 ? 'text-red-700' : ''}>{inr(r.outstanding)}</Td></tr>))}
              </tbody>
            </Table>
          </Card>
        )}
        <Card title="Recent maintenance" pad={false}>
          {requests.length === 0 ? <Empty>No requests.</Empty> : (
            <Table>
              <thead><tr><Th>Request</Th><Th>Status</Th><Th>Raised</Th></tr></thead>
              <tbody>{requests.map((r: any) => (
                <tr key={r.request_id}><Td><Link className="text-brand-600 hover:underline" href={`/maintenance/${r.request_id}`}>{r.title}</Link>
                  <div className="text-[11px] text-faint">{titleCase(r.category)} · {titleCase(r.priority)}</div></Td>
                  <Td><StatusBadge value={r.status} /></Td><Td>{dateTime(r.created_at)}</Td></tr>))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Change unit status">
        <Field label="New status" hint="LEASED is set automatically from leases and cannot be chosen here.">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {['VACANT', 'OWNER_OCCUPIED', 'UNDER_MAINTENANCE'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </Field>
        <div className="mt-3"><ErrorBox message={err} /></div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </Modal>
    </>
  );
}
