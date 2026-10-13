'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch, qs, useApi } from '@/lib/client';
import { date, dateTime, hoursLabel, inr, inrShort, titleCase } from '@/lib/format';
import { isStaffRole, useMe } from '@/components/session';
import { C, axisTick, legendProps, tooltipStyle } from '@/lib/palette';
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, Select, Stat, StatusBadge, Table, Td, Th } from '@/components/ui';

const axis = axisTick;

export default function DashboardPage() {
  const me = useMe();
  return isStaffRole(me.user.role) ? <StaffDashboard /> : <ResidentDashboard />;
}

function StaffDashboard() {
  const me = useMe();
  const [complexId, setComplexId] = useState('');
  const { data, error, loading, reload } = useApi(`/api/dashboard${qs({ complexId })}`);
  const [refreshing, setRefreshing] = useState(false);

  if (error) return <ErrorBox message={error} />;
  if (loading && !data) return <Loading />;
  const k = data.kpis as any[];
  const sum = (f: string) => k.reduce((s, r) => s + Number(r[f] ?? 0), 0);
  const units = sum('total_units');
  const occ = data.occupancy as any[];
  const occupied = occ.reduce((s, r) => s + Number(r.leased) + Number(r.owner_occupied), 0);
  const billed = sum('billed_12m'), collected = sum('collected_12m');
  const refreshed = k[0]?.refreshed_at;

  const refresh = async () => { setRefreshing(true); await apiFetch('/api/dashboard/refresh', { method: 'POST', body: {} }); setRefreshing(false); reload(); };

  return (
    <>
      <PageHeader
        eyebrow={me.user.role === 'MANAGER' ? 'Your complexes' : 'All complexes'}
        title="Portfolio overview."
        subtitle={<>Occupancy, collections and maintenance, as of {dateTime(refreshed)}.</>}
        actions={<>
          <Select value={complexId} onChange={(e) => setComplexId(e.target.value)} className="w-52">
            <option value="">All complexes</option>
            {me.complexes.map((c) => <option key={c.complex_id} value={c.complex_id}>{c.name}</option>)}
          </Select>
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh KPIs'}</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Units" value={units} hint={`${occ.length} complex${occ.length === 1 ? '' : 'es'}`} />
        <Stat label="Occupancy" value={`${units ? ((100 * occupied) / units).toFixed(1) : 0}%`} hint={`${occupied} occupied · ${units - occupied} free`} tone={occupied / units > 0.85 ? 'good' : 'warn'} />
        <Stat label="Billed, last 12 months" value={inrShort(billed)} hint={`${inrShort(collected)} collected`} />
        <Stat label="Collection rate" value={`${billed ? ((100 * collected) / billed).toFixed(1) : 0}%`} tone={collected / billed > 0.95 ? 'good' : 'warn'} hint="12-month rolling" />
        <Stat label="Outstanding now" value={inrShort(sum('outstanding_now'))} hint={`${sum('overdue_invoices')} overdue invoices`} tone="bad" />
        <Stat label="Open requests" value={sum('open_requests')} hint={`${data.leasesExpiring60d} leases expire in 60 days`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Billed vs collected (monthly)" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data.collections} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={axis} tickFormatter={(v) => inrShort(v)} tickLine={false} axisLine={false} width={60} />
                <YAxis yAxisId="r" orientation="right" domain={[70, 100]} tick={axis} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={40} />
                <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => (n === 'Collection %' ? `${v}%` : inr(Number(v)))} />
                <Legend {...legendProps} />
                <Bar yAxisId="l" dataKey="billed" name="Billed" fill={C.pale} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="l" dataKey="collected" name="Collected" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line yAxisId="r" dataKey="collection_pct" name="Collection %" stroke={C.orange} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Occupancy by complex">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={occ} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={axis} tickLine={false} axisLine={false} domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="complex_name" tick={axis} width={96} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend {...legendProps} />
                <Bar dataKey="leased" name="Leased" stackId="a" fill={C.blue} />
                <Bar dataKey="owner_occupied" name="Owner-occupied" stackId="a" fill={C.sky} />
                <Bar dataKey="vacant" name="Vacant" stackId="a" fill={C.orange} />
                <Bar dataKey="under_maintenance" name="Under maintenance" stackId="a" fill={C.violet} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Maintenance requests, last 90 days">
          <div className="h-[340px]">
            <ResponsiveContainer>
              <BarChart data={(data.byCategory as any[]).map((r) => ({ ...r, category: titleCase(r.category) }))} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="category" tick={axis} width={90} tickLine={false} axisLine={false} interval={0} />
                <Tooltip {...tooltipStyle} />
                <Legend {...legendProps} />
                <Bar dataKey="resolved" name="Resolved" stackId="m" fill={C.sky} />
                <Bar dataKey="open" name="Open" stackId="m" fill={C.orange} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Resolution time vs SLA" pad={false} className="xl:col-span-2">
          <Table>
            <thead><tr><Th>Category</Th><Th right>Requests</Th><Th right>Avg time to resolve</Th><Th right>Within SLA</Th><Th className="w-40"></Th></tr></thead>
            <tbody>
              {(data.sla as any[]).map((r) => (
                <tr key={r.category}>
                  <Td>{titleCase(r.category)}</Td>
                  <Td right>{r.total}</Td>
                  <Td right>{hoursLabel(r.avg_hours)}</Td>
                  <Td right>{r.within_sla_pct == null ? '—' : `${r.within_sla_pct}%`}</Td>
                  <Td><div className="mt-1.5 h-1.5 rounded-full bg-fill"><div className="h-1.5 rounded-full" style={{ width: `${r.within_sla_pct ?? 0}%`, background: (r.within_sla_pct ?? 0) >= 80 ? C.blue : C.orange }} /></div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="Most overdue invoices" className="mt-4" pad={false} actions={<Link href="/billing?overdue=1" className="text-[13px] text-brand-600 hover:underline">View all dues →</Link>}>
        {(data.overdue as any[]).length === 0 ? <Empty>No overdue invoices.</Empty> : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Resident</Th><Th>Unit</Th><Th>Type</Th><Th>Month</Th><Th right>Balance</Th><Th right>Days overdue</Th></tr></thead>
            <tbody>
              {(data.overdue as any[]).map((r) => (
                <tr key={r.invoice_id}>
                  <Td mono>#{r.invoice_id}</Td>
                  <Td>{r.billed_to_name}</Td>
                  <Td>{r.complex_name} · {r.block_name}-{r.unit_number}</Td>
                  <Td><StatusBadge value={r.invoice_type} /></Td>
                  <Td>{date(r.billing_month).slice(3)}</Td>
                  <Td right>{inr(r.balance)}</Td>
                  <Td right className={r.days_overdue > 60 ? 'font-semibold text-red-700' : ''}>{r.days_overdue}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function ResidentDashboard() {
  const me = useMe();
  const { data, error, loading } = useApi('/api/dashboard');
  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading />;
  const dues = data.dues;
  return (
    <>
      <PageHeader eyebrow={me.user.role === 'OWNER' ? 'Owner portal' : 'Resident portal'} title={`Welcome back, ${me.user.name.split(' ')[0]}.`} subtitle={me.user.role === 'OWNER' ? 'Your flats, dues and requests.' : 'Your home, rent and requests.'} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Outstanding dues" value={inr(dues.outstanding)} tone={dues.outstanding > 0 ? 'bad' : 'good'} hint={dues.next_due ? `Earliest due ${date(dues.next_due)}` : 'All paid up'} />
        <Stat label="Overdue invoices" value={dues.overdue_count} tone={dues.overdue_count ? 'warn' : 'good'} />
        <Stat label="Your requests" value={(data.requests as any[]).filter((r) => ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)).length} hint="currently open" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={me.user.role === 'OWNER' ? 'Your flats' : 'Your home'} pad={false}>
          {(data.units as any[]).length === 0 ? <Empty>No current units.</Empty> : (
            <Table>
              <thead><tr><Th>Unit</Th><Th>Type</Th><Th>Status</Th><Th>{me.user.role === 'OWNER' ? 'Tenant' : 'Lease ends'}</Th></tr></thead>
              <tbody>
                {(data.units as any[]).map((u) => (
                  <tr key={u.unit_id}>
                    <Td><Link href={`/units/${u.unit_id}`} className="font-medium text-brand-600 hover:underline">{u.complex_name} · {u.block_name}-{u.unit_number}</Link></Td>
                    <Td>{u.unit_type}</Td>
                    <Td><StatusBadge value={u.occupancy_status} /></Td>
                    <Td>{me.user.role === 'OWNER' ? (u.tenant_name ?? '—') : date(u.lease_end)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Billed vs paid, last 12 months">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data.invoices} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
                <YAxis tick={axis} tickFormatter={(v) => inrShort(v)} tickLine={false} axisLine={false} width={55} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => inr(Number(v))} />
                <Legend {...legendProps} />
                <Bar dataKey="billed" name="Billed" fill={C.pale} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="paid" name="Paid" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card title="Recent requests" className="mt-4" pad={false} actions={<Link href="/maintenance" className="text-[13px] text-brand-600 hover:underline">Raise a request →</Link>}>
        {(data.requests as any[]).length === 0 ? <Empty>No requests yet.</Empty> : (
          <Table>
            <thead><tr><Th>#</Th><Th>Title</Th><Th>Priority</Th><Th>Status</Th><Th>Raised</Th></tr></thead>
            <tbody>
              {(data.requests as any[]).map((r) => (
                <tr key={r.request_id}>
                  <Td mono>{r.request_id}</Td>
                  <Td><Link href={`/maintenance/${r.request_id}`} className="text-brand-600 hover:underline">{r.title}</Link></Td>
                  <Td><StatusBadge value={r.priority} /></Td>
                  <Td><StatusBadge value={r.status} /></Td>
                  <Td>{dateTime(r.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
