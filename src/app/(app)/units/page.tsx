'use client';
import Link from 'next/link';
import { useState } from 'react';
import { qs, useApi } from '@/lib/client';
import { UNIT_STATUSES, UNIT_TYPES } from '@/lib/constants';
import { date, inr, titleCase } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { Card, ErrorBox, Input, Loading, PageHeader, Pagination, Select, StatusBadge, Table, Td, Th } from '@/components/ui';

export default function UnitsPage() {
  const me = useMe();
  const staff = isStaffRole(me.user.role);
  const [f, setF] = useState({ complexId: '', status: '', type: '', q: '', page: 1 });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? Number(v) : 1 }));
  const { data, error, loading } = useApi(`/api/units${qs(f)}`);

  return (
    <>
      <PageHeader title="Units" subtitle={staff ? 'Every flat in your complexes with its owner and current tenant' : 'Flats you own or rent'} />
      <Card pad={false}>
        {staff && (
          <div className="flex flex-wrap gap-2 px-6 pb-4 pt-5">
            <Input placeholder="Search unit, owner or tenant…" value={f.q} onChange={(e) => set('q', e.target.value)} className="w-64" />
            <Select value={f.complexId} onChange={(e) => set('complexId', e.target.value)} className="w-48">
              <option value="">All complexes</option>
              {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}
            </Select>
            <Select value={f.status} onChange={(e) => set('status', e.target.value)} className="w-44">
              <option value="">Any status</option>
              {UNIT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
            <Select value={f.type} onChange={(e) => set('type', e.target.value)} className="w-32">
              <option value="">Any type</option>
              {UNIT_TYPES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
        )}
        <ErrorBox message={error} />
        {loading && !data ? <Loading /> : (
          <>
            <Table>
              <thead><tr><Th>Unit</Th><Th>Type</Th><Th right>Area (sqft)</Th><Th>Status</Th><Th>Owner(s)</Th><Th>Tenant</Th><Th right>Rent</Th><Th>Lease ends</Th></tr></thead>
              <tbody>
                {(data?.rows ?? []).map((u: any) => (
                  <tr key={u.unit_id} className="hover:bg-neutral-50">
                    <Td><Link href={`/units/${u.unit_id}`} className="font-medium text-brand-600 hover:underline">{u.block_name}-{u.unit_number}</Link><div className="text-[11px] text-faint">{u.complex_name}</div></Td>
                    <Td>{u.unit_type}</Td>
                    <Td right>{u.carpet_area_sqft}</Td>
                    <Td><StatusBadge value={u.occupancy_status} /></Td>
                    <Td>{u.owner_names ?? '—'}</Td>
                    <Td>{u.tenant_name ?? '—'}</Td>
                    <Td right>{inr(u.monthly_rent ?? u.base_rent)}{!u.monthly_rent && <div className="text-[10px] text-faint">asking</div>}</Td>
                    <Td>{date(u.lease_end)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', p)} />}
          </>
        )}
      </Card>
    </>
  );
}
