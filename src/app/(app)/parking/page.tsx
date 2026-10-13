'use client';
import { useState } from 'react';
import { apiFetch, qs, useApi } from '@/lib/client';
import { date, inr, todayISO } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Button, Card, cx, Empty, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Select, Stat, StatusBadge, Table, Td, Th } from '@/components/ui';

export default function ParkingPage() {
  const me = useMe();
  return isStaffRole(me.user.role) ? <StaffParking /> : <ResidentParking />;
}

const CHARGE: Record<string, number> = { CAR: 750, BIKE: 250, EV: 1500 };

function StaffParking() {
  const me = useMe();
  const [complexId, setComplexId] = useState(String(me.complexes[0]?.complex_id ?? ''));
  const { data, error, reload } = useApi(`/api/parking${qs({ complexId })}`);
  const [slot, setSlot] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;

  return (
    <>
      <PageHeader title="Parking" subtitle="Slot map, allocations and utilisation"
        actions={<Select value={complexId} onChange={(e) => setComplexId(e.target.value)} className="w-52">
          {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}</Select>} />
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      {!data ? <Loading /> : <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.summary.map((s: any) => (
            <Stat key={s.slot_type} label={`${s.slot_type} slots`} value={`${s.occupied} / ${s.total}`} hint={`${s.utilisation_pct}% used · ${inr(s.monthly_revenue)}/month`} />
          ))}
        </div>
        {['CAR', 'EV', 'BIKE'].map((type) => {
          const slots = data.slots.filter((s: any) => s.slot_type === type);
          return (
            <Card key={type} title={`${type} slots`} className="mt-4">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
                {slots.map((s: any) => (
                  <button key={s.slot_id} onClick={() => setSlot(s)} title={s.registration_no ? `${s.registration_no} · ${s.holder}` : 'Free'}
                    className={cx('rounded-xl px-2.5 py-2 text-left text-[11px] hover:ring-2 hover:ring-action/30',
                      s.allocation_id ? 'border-emerald-300 bg-emerald-50' : 'border-dashed border-neutral-300 bg-white')}>
                    <div className="flex justify-between font-semibold"><span>{s.slot_code}</span><span className="font-normal text-faint">{s.level}</span></div>
                    <div className="truncate font-mono text-[10px]">{s.registration_no ?? 'free'}</div>
                    <div className="truncate text-faint">{s.allocation_id ? `${s.block_name}-${s.unit_number}` : ' '}</div>
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </>}
      {slot && (slot.allocation_id
        ? <SlotDetail slot={slot} onClose={() => setSlot(null)} onDone={(m) => { setSlot(null); setNotice(m); reload(); }} />
        : <Allocate slot={slot} complexId={complexId} onClose={() => setSlot(null)} onDone={(m) => { setSlot(null); setNotice(m); reload(); }} />)}
    </>
  );
}

function SlotDetail({ slot, onClose, onDone }: { slot: any; onClose: () => void; onDone: (m: string) => void }) {
  const [end, setEnd] = useState(todayISO());
  const [err, setErr] = useState<string | null>(null);
  const release = async () => {
    try { await apiFetch(`/api/parking/allocations/${slot.allocation_id}`, { method: 'PATCH', body: { end_date: end } }); onDone(`Slot ${slot.slot_code} released from ${end}.`); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Slot ${slot.slot_code}`}>
      <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
        <dt className="text-muted">Vehicle</dt><dd className="font-mono">{slot.registration_no}</dd>
        <dt className="text-muted">Model</dt><dd>{slot.make_model}{slot.is_electric ? ' (EV)' : ''}</dd>
        <dt className="text-muted">Holder</dt><dd>{slot.holder}</dd>
        <dt className="text-muted">Unit</dt><dd>{slot.block_name}-{slot.unit_number}</dd>
        <dt className="text-muted">Since</dt><dd>{date(slot.start_date)}</dd>
        <dt className="text-muted">Charge</dt><dd>{inr(slot.monthly_charge)} / month</dd>
      </dl>
      <div className="mt-4 border-t border-hair pt-4"><Field label="Release from"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      <div className="mt-3"><ErrorBox message={err} /></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="danger" onClick={release}>Release slot</Button></div>
    </Modal>
  );
}

function Allocate({ slot, complexId, onClose, onDone }: { slot: any; complexId: string; onClose: () => void; onDone: (m: string) => void }) {
  const [q, setQ] = useState('');
  const units = useApi(`/api/units${qs({ complexId, q })}`);
  const [unitId, setUnitId] = useState('');
  const vehicles = useApi<any[]>(unitId ? `/api/vehicles?unitId=${unitId}` : null);
  const [vehicleId, setVehicleId] = useState('');
  const [charge, setCharge] = useState(String(CHARGE[slot.slot_type]));
  const [start, setStart] = useState(todayISO());
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setErr(null);
    try {
      await apiFetch('/api/parking/allocations', { method: 'POST', body: { slot_id: slot.slot_id, unit_id: Number(unitId), vehicle_id: Number(vehicleId), start_date: start, monthly_charge: Number(charge) } });
      onDone(`Slot ${slot.slot_code} allocated.`);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Allocate ${slot.slot_type} slot ${slot.slot_code}`}>
      <div className="space-y-3">
        <Field label="Find unit"><Input placeholder="Unit number or resident…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Unit"><Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setVehicleId(''); }}>
          <option value="">Select…</option>
          {(units.data?.rows ?? []).filter((u: any) => ['LEASED', 'OWNER_OCCUPIED'].includes(u.occupancy_status)).map((u: any) =>
            <option key={u.unit_id} value={u.unit_id}>{u.block_name}-{u.unit_number} · {u.tenant_name ?? u.owner_names}</option>)}
        </Select></Field>
        <Field label="Vehicle" hint="Residents register vehicles from their own portal. Slot type rules are checked by a database trigger.">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!unitId}>
            <option value="">{unitId && vehicles.data?.length === 0 ? 'No vehicles registered for this unit' : 'Select…'}</option>
            {(vehicles.data ?? []).map((v) => <option key={v.vehicle_id} value={v.vehicle_id}>{v.registration_no} · {v.vehicle_type}{v.is_electric ? ' EV' : ''} · {v.owner_name}</option>)}
          </Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Monthly charge (₹)"><Input type="number" value={charge} onChange={(e) => setCharge(e.target.value)} /></Field>
        </div>
        <ErrorBox message={err} />
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!unitId || !vehicleId}>Allocate</Button></div>
    </Modal>
  );
}

function ResidentParking() {
  const { data, error, reload } = useApi('/api/parking');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ registration_no: '', vehicle_type: 'CAR', is_electric: false, make_model: '' });
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const add = async () => {
    setErr(null);
    try { await apiFetch('/api/vehicles', { method: 'POST', body: form }); setOpen(false); setNotice('Vehicle registered. Ask the office for a slot.'); reload(); }
    catch (e) { setErr((e as Error).message); }
  };
  const remove = async (v: any) => {
    if (!confirm(`Remove ${v.registration_no}?`)) return;
    try { await apiFetch(`/api/vehicles/${v.vehicle_id}`, { method: 'DELETE' }); setNotice('Vehicle removed.'); reload(); }
    catch (e) { setNotice(null); alert((e as Error).message); }
  };
  return (
    <>
      <PageHeader title="Parking" subtitle="Your vehicles and parking slots" actions={<Button onClick={() => setOpen(true)}>Register vehicle</Button>} />
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your vehicles" pad={false}>
          {data.vehicles.length === 0 ? <Empty>No vehicles registered.</Empty> : (
            <Table><thead><tr><Th>Registration</Th><Th>Type</Th><Th>Model</Th><Th></Th></tr></thead>
              <tbody>{data.vehicles.map((v: any) => (
                <tr key={v.vehicle_id}><Td mono>{v.registration_no}</Td><Td>{v.vehicle_type}{v.is_electric ? ' · EV' : ''}</Td><Td>{v.make_model}</Td>
                  <Td>{v.active_allocations === 0 && <Button size="sm" variant="ghost" onClick={() => remove(v)}>Remove</Button>}</Td></tr>))}</tbody></Table>
          )}
        </Card>
        <Card title="Allocated slots" pad={false}>
          {data.allocations.length === 0 ? <Empty>No slots allocated.</Empty> : (
            <Table><thead><tr><Th>Slot</Th><Th>Vehicle</Th><Th>Period</Th><Th right>Charge</Th></tr></thead>
              <tbody>{data.allocations.map((a: any) => (
                <tr key={a.allocation_id}><Td>{a.slot_code} <span className="text-faint">({a.level})</span><div className="text-[11px] text-faint">{a.complex_name}</div></Td>
                  <Td mono>{a.registration_no}</Td><Td>{date(a.start_date)} → {a.end_date ? date(a.end_date) : <StatusBadge value="ACTIVE" />}</Td><Td right>{inr(a.monthly_charge)}</Td></tr>))}</tbody></Table>
          )}
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Register a vehicle">
        <div className="space-y-3">
          <Field label="Registration number" hint="Format: KA01AB1234"><Input value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}><option>CAR</option><option>BIKE</option></Select></Field>
            <Field label="Make / model"><Input value={form.make_model} onChange={(e) => setForm({ ...form, make_model: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.is_electric} onChange={(e) => setForm({ ...form, is_electric: e.target.checked })} />Electric vehicle</label>
          <ErrorBox message={err} />
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Register</Button></div>
      </Modal>
    </>
  );
}
