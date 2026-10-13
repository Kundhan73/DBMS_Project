'use client';
import Link from 'next/link';
import { use } from 'react';
import { useApi } from '@/lib/client';
import { OCCUPANCY_COLORS } from '@/lib/palette';
import { date, titleCase } from '@/lib/format';
import { Card, cx, ErrorBox, Loading, PageHeader } from '@/components/ui';

const COLORS: Record<string, string> = {
  LEASED: 'bg-brand-100 text-brand-800',
  OWNER_OCCUPIED: 'bg-neutral-100 text-ink',
  VACANT: 'bg-secondary-50 text-secondary-700',
  UNDER_MAINTENANCE: 'bg-[#efebff] text-[#5b3fd6]',
};

export default function ComplexDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useApi(`/api/complexes/${id}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  const { complex, units } = data;
  const blocks = [...new Set((units as any[]).map((u) => u.block_name))];

  return (
    <>
      <PageHeader title={complex.name} subtitle={`${complex.address_line}, ${complex.locality} · ${complex.total_units} units · ${complex.occupancy_pct}% occupied`}
        actions={<Link href="/complexes" className="text-[13px] text-brand-600 hover:underline">← All complexes</Link>} />
      <div className="mb-4 flex flex-wrap gap-3 text-[12px]">
        {Object.keys(COLORS).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: OCCUPANCY_COLORS[k.toLowerCase()] }} />{titleCase(k)}</span>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {blocks.map((b) => {
          const bu = (units as any[]).filter((u) => u.block_name === b);
          const floors = [...new Set(bu.map((u) => u.floor_no))];
          return (
            <Card key={b} title={`Block ${b}`}>
              <div className="space-y-1.5">
                {floors.map((f) => (
                  <div key={f} className="flex items-stretch gap-1.5">
                    <div className="w-8 shrink-0 pt-2 text-[11px] text-faint">F{f}</div>
                    {bu.filter((u) => u.floor_no === f).map((u) => (
                      <Link key={u.unit_id} href={`/units/${u.unit_id}`} title={`${u.owner_names ?? ''}${u.tenant_name ? ' · tenant ' + u.tenant_name : ''}`}
                        className={cx('min-w-0 flex-1 rounded-xl px-2.5 py-2 text-[12px] hover:ring-2 hover:ring-action/30', COLORS[u.occupancy_status])}>
                        <div className="flex justify-between font-semibold"><span>{u.unit_number}</span><span className="font-normal opacity-70">{u.unit_type}</span></div>
                        <div className="truncate opacity-80">{u.tenant_name ?? (u.occupancy_status === 'OWNER_OCCUPIED' ? u.owner_names : titleCase(u.occupancy_status))}</div>
                        {u.lease_end && <div className="truncate text-[10px] opacity-60">till {date(u.lease_end)}</div>}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
