// Chart and status colours, taken from the supplied design tokens.
export const C = {
  blue: '#0071e3',      // tertiary-1, primary series
  sky: '#98caff',       // brand-300, secondary series
  pale: '#c0e1ff',      // brand-200, background series
  orange: '#ed6300',    // tertiary-4, attention
  violet: '#8668ff',    // tertiary-3
  teal: '#00a1b3',      // tertiary-2
  grid: '#e8e8ed',
  axis: '#86868b',
};

export const OCCUPANCY_COLORS: Record<string, string> = {
  leased: C.blue, owner_occupied: C.sky, vacant: C.orange, under_maintenance: C.violet,
};

export const axisTick = { fontSize: 11, fill: C.axis };
export const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgb(0 0 0 / 0.12)', fontSize: 12, padding: '8px 12px' },
  cursor: { fill: 'rgb(0 0 0 / 0.03)' },
};

// Neutral legend text with small round markers (series colour stays on the marker only)
export const legendProps = {
  iconType: 'circle' as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  formatter: (value: string) => <span style={{ color: '#6e6e73', marginRight: 6 }}>{value}</span>,
};
