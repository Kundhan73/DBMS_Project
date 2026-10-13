'use client';
import Link from 'next/link';
import { useApi } from '@/lib/client';
import { OCCUPANCY_COLORS } from '@/lib/palette';
import { Badge, Card, ErrorBox, Loading, PageHeader } from '@/components/ui';

export default function ComplexesPage() {
  const { data, error } = useApi<any[]>('/api/complexes');
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="Complexes" subtitle={`${data.length} complexes in your scope`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((c) => (
          <Link key={c.complex_id} href={`/complexes/${c.complex_id}`} className="group">
            <Card className="h-full transition-shadow transition-transform duration-300 group-hover:scale-[1.01] group-hover:shadow-lift">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-21px font-semibold tracking-tight group-hover:text-brand-600">{c.name}</div>
                  <div className="text-[12px] text-muted">{c.address_line}, {c.locality} · {c.pincode}</div>
                </div>
                <div className="text-right">
                  <div className="text-28px font-semibold tabular tracking-tight text-ink">{c.occupancy_pct}%</div>
                  <div className="text-[11px] text-faint">occupied</div>
                </div>
              </div>
              <div className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-fill">
                {Object.entries(OCCUPANCY_COLORS).map(([k, col]) => (
                  <div key={k} style={{ width: `${(100 * c[k]) / c.total_units}%`, background: col }} />
                ))}
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-[12px]">
                <div><dt className="text-faint">Units</dt><dd className="font-medium">{c.total_units}</dd></div>
                <div><dt className="text-faint">Leased</dt><dd className="font-medium">{c.leased}</dd></div>
                <div><dt className="text-faint">Owner</dt><dd className="font-medium">{c.owner_occupied}</dd></div>
                <div><dt className="text-faint">Vacant</dt><dd className="font-medium">{c.vacant}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1">{(c.amenities as string[]).map((a) => <Badge key={a}>{a}</Badge>)}</div>
              <div className="mt-3 text-[12px] text-muted">{c.blocks} blocks · est. {c.established_year} · Managers: {c.managers ?? '—'}</div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
