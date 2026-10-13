'use client';
import { useState } from 'react';
import { apiFetch, qs, useApi } from '@/lib/client';
import { dateTime } from '@/lib/format';
import { useMe } from '@/components/session';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, Notice, PageHeader, Pagination, Select, Table, Td, Tabs, Th } from '@/components/ui';

export default function PeoplePage() {
  const me = useMe();
  const [role, setRole] = useState<'OWNER' | 'TENANT'>('TENANT');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(`/api/people${qs({ role, q, page })}`);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = async (p: any) => {
    try { await apiFetch(`/api/people/${p.user_id}`, { method: 'PATCH', body: { is_active: !p.is_active } }); reload(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="People" subtitle="Owners and tenants" actions={<Button onClick={() => setOpen(true)}>Add person</Button>} />
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      <Card pad={false}>
        <div className="flex flex-wrap gap-2 px-6 pb-4 pt-5">
          <Tabs value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[{ value: 'TENANT', label: 'Tenants' }, { value: 'OWNER', label: 'Owners' }]} />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, email or phone (typo-tolerant)" className="w-72" />
        </div>
        <ErrorBox message={error} />
        {loading && !data ? <Loading /> : (
          <>
            <Table>
              <thead><tr><Th>Name</Th><Th>Contact</Th><Th>{role === 'TENANT' ? 'Occupation' : 'Profile'}</Th><Th right>Current units</Th><Th>Complexes</Th><Th>Last login</Th><Th>Status</Th>{me.user.role === 'ADMIN' && <Th></Th>}</tr></thead>
              <tbody>
                {(data?.rows ?? []).map((p: any) => (
                  <tr key={p.user_id} className={p.is_active ? '' : 'text-faint'}>
                    <Td className="font-medium">{p.full_name}</Td>
                    <Td>{p.email}<div className="text-[11px] text-faint">{p.phone}</div></Td>
                    <Td>{role === 'TENANT' ? <>{p.occupation ?? '—'}<div className="text-[11px] text-faint">{p.employer} · family of {p.family_size}</div></> : (p.is_nri ? <Badge tone="blue">NRI</Badge> : 'Resident Indian')}</Td>
                    <Td right>{p.current_units}</Td>
                    <Td>{p.complexes ?? '—'}</Td>
                    <Td>{dateTime(p.last_login_at)}</Td>
                    <Td>{p.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                    {me.user.role === 'ADMIN' && <Td><Button size="sm" variant="ghost" onClick={() => toggle(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</Button></Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </Card>
      {open && <AddPerson onClose={() => setOpen(false)} onDone={(m) => { setOpen(false); setNotice(m); reload(); }} />}
    </>
  );
}

function AddPerson({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<any>({ role: 'TENANT', full_name: '', email: '', phone: '', password: '', mailing_address: '', is_nri: false,
    occupation: '', employer: '', family_size: 1, emergency_contact_name: '', emergency_contact_phone: '' });
  const [err, setErr] = useState<string | null>(null);
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const submit = async () => {
    setErr(null);
    const body = f.role === 'OWNER'
      ? { role: 'OWNER', full_name: f.full_name, email: f.email, phone: f.phone, password: f.password, mailing_address: f.mailing_address, is_nri: f.is_nri }
      : { role: 'TENANT', full_name: f.full_name, email: f.email, phone: f.phone, password: f.password, occupation: f.occupation || undefined, employer: f.employer || undefined,
          family_size: Number(f.family_size), emergency_contact_name: f.emergency_contact_name, emergency_contact_phone: f.emergency_contact_phone };
    try { const r = await apiFetch<any>('/api/people', { method: 'POST', body }); onDone(`${r.full_name} added as ${r.role.toLowerCase()}.`); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title="Add person" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role"><Select value={f.role} onChange={(e) => u('role', e.target.value)}><option value="TENANT">Tenant</option><option value="OWNER">Owner</option></Select></Field>
        <Field label="Full name"><Input value={f.full_name} onChange={(e) => u('full_name', e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => u('email', e.target.value)} /></Field>
        <Field label="Mobile"><Input value={f.phone} onChange={(e) => u('phone', e.target.value)} placeholder="98XXXXXXXX" /></Field>
        <Field label="Initial password" hint="Stored as a bcrypt hash; min 8 characters"><Input type="password" value={f.password} onChange={(e) => u('password', e.target.value)} /></Field>
        {f.role === 'OWNER' ? <>
          <Field label="Mailing address"><Input value={f.mailing_address} onChange={(e) => u('mailing_address', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.is_nri} onChange={(e) => u('is_nri', e.target.checked)} />Non-resident Indian</label>
        </> : <>
          <Field label="Occupation"><Input value={f.occupation} onChange={(e) => u('occupation', e.target.value)} /></Field>
          <Field label="Employer"><Input value={f.employer} onChange={(e) => u('employer', e.target.value)} /></Field>
          <Field label="Family size"><Input type="number" min={1} max={15} value={f.family_size} onChange={(e) => u('family_size', e.target.value)} /></Field>
          <Field label="Emergency contact"><Input value={f.emergency_contact_name} onChange={(e) => u('emergency_contact_name', e.target.value)} /></Field>
          <Field label="Emergency phone"><Input value={f.emergency_contact_phone} onChange={(e) => u('emergency_contact_phone', e.target.value)} /></Field>
        </>}
      </div>
      <div className="mt-3"><ErrorBox message={err} /></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Create account</Button></div>
    </Modal>
  );
}
