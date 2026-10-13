'use client';
import { useState } from 'react';
import { qs, useApi } from '@/lib/client';
import { dateTime } from '@/lib/format';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, Select, Table, Td, Th } from '@/components/ui';

function diff(a: any, b: any) {
  if (!a) return Object.entries(b ?? {}).slice(0, 6).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
  if (!b) return 'row deleted';
  return Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join('; ');
}

export default function AuditPage() {
  const [table, setTable] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi(`/api/audit${qs({ table, page })}`);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Written by database triggers on leases, payments, ownership, units, users and voided invoices" />
      <Card pad={false}>
        <div className="px-6 pb-4 pt-5">
          <Select value={table} onChange={(e) => { setTable(e.target.value); setPage(1); }} className="w-52">
            <option value="">All tables</option>
            {['lease', 'payment', 'invoice', 'ownership', 'unit', 'app_user'].map((t) => <option key={t}>{t}</option>)}
          </Select>
        </div>
        <ErrorBox message={error} />
        {loading && !data ? <Loading /> : data?.rows.length === 0 ? <Empty>No audit entries yet. Changes made through the app appear here.</Empty> : (
          <>
            <Table>
              <thead><tr><Th>When</Th><Th>Who</Th><Th>Table</Th><Th>Row</Th><Th>Action</Th><Th>Change</Th></tr></thead>
              <tbody>{(data?.rows ?? []).map((a: any) => (
                <tr key={a.audit_id}>
                  <Td>{dateTime(a.changed_at)}</Td><Td>{a.changed_by_name ?? 'system'}</Td><Td mono>{a.table_name}</Td><Td mono>{a.row_pk}</Td>
                  <Td><Badge tone={a.action === 'I' ? 'green' : a.action === 'D' ? 'red' : 'blue'}>{{ I: 'Insert', U: 'Update', D: 'Delete' }[a.action as 'I']}</Badge></Td>
                  <Td className="max-w-xl break-all font-mono text-[11px] text-muted">{diff(a.old_data, a.new_data)}</Td>
                </tr>))}</tbody>
            </Table>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
