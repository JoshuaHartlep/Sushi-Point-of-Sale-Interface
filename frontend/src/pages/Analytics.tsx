import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  analyticsApi,
  type SummaryGroup,
  type DrillRow,
  type CompareRow,
  type Signal,
  type AnalyticsMetric,
  type AnalyticsDimension,
  type AnalyticsGroupBy,
  type AnalyticsFilterParams,
} from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One level in the drill stack.
 *
 * filters is a flat Record of any filter keys currently active
 * (e.g. { category_id: 5, item_id: 23 }). It accumulates as the user drills.
 * The dimension and metric at each level are independent — the user can freely
 * change them via the selectors without losing their filter context.
 */
interface DrillStep {
  label: string;
  dimension: AnalyticsDimension;
  metric: AnalyticsMetric;
  filters: Record<string, number | string>;
}

type TimeRange = '7d' | '30d' | 'custom';
type SortKey = 'value' | 'order_count';
type ActiveTab = 'overview' | 'signals';

// ---------------------------------------------------------------------------
// Constants / display maps
// ---------------------------------------------------------------------------

const METRIC_LABELS: Record<AnalyticsMetric, string> = {
  revenue:         'Revenue',
  order_count:     'Order Count',
  avg_order_value: 'Avg Order Value',
  item_count:      'Items Sold',
};

const DIMENSION_LABELS: Record<AnalyticsDimension, string> = {
  category:    'Category',
  item:        'Item',
  day_of_week: 'Day of Week',
  hour:        'Hour of Day',
  order_type:  'Order Type',
  table:       'Table',
};

const SIGNAL_METRIC_LABELS: Record<string, string> = {
  total_revenue:   'Revenue',
  order_count:     'Order Count',
  avg_order_value: 'Avg Order Value',
};

const CHART_GROUP_LABELS: Record<AnalyticsGroupBy, string> = {
  day:         'Daily',
  week:        'Weekly',
  day_of_week: 'By Weekday',
  hour:        'By Hour',
  item:        'By Item',
  category:    'By Category',
  order_type:  'By Type',
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function getDateRange(
  timeRange: TimeRange,
  customStart: string,
  customEnd: string,
): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  if (timeRange === 'custom') {
    return {
      start: customStart || fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: customEnd || fmt(today),
    };
  }
  const start = new Date(today);
  start.setDate(today.getDate() - (timeRange === '7d' ? 7 : 30));
  return { start: fmt(start), end: fmt(today) };
}

function formatValue(value: number, metric: AnalyticsMetric): string {
  if (metric === 'order_count' || metric === 'item_count') return value.toLocaleString();
  return `$${value.toFixed(2)}`;
}

function formatShort(value: number, metric: AnalyticsMetric): string {
  if (metric === 'order_count' || metric === 'item_count') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  }
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(0)}`;
}

/**
 * Derives the next suggested dimension when a row is clicked,
 * based on what metadata the row carries — NOT a hardcoded path.
 * The user can always override via the dimension selector.
 */
function suggestNextDimension(
  current: AnalyticsDimension,
  metadata: Record<string, number | string>,
): AnalyticsDimension {
  if ('category_id' in metadata) return 'item';
  if ('item_id' in metadata)     return 'day_of_week';
  if ('table_id' in metadata)    return 'order_type';
  return current;
}

/**
 * Merges a row's metadata into the current filter set.
 * Generic: works for any dimension — whatever keys the backend puts in
 * metadata get added as filters automatically.
 */
function accumulateFilters(
  current: Record<string, number | string>,
  metadata: Record<string, number | string>,
): Record<string, number | string> {
  // Exclude non-filter keys (like order_type which maps to a filter param)
  return { ...current, ...metadata };
}

/** True if clicking this row would add new filter context. */
function isRowDrillable(
  metadata: Record<string, number | string>,
  currentFilters: Record<string, number | string>,
): boolean {
  return Object.keys(metadata).some(k => !(k in currentFilters));
}

// ---------------------------------------------------------------------------
// BarChart — SVG, no library
// ---------------------------------------------------------------------------

interface BarChartProps {
  data: SummaryGroup[];
  metric: AnalyticsMetric;
  onBarClick?: (group: SummaryGroup) => void;
}

function BarChart({ data, metric, onBarClick }: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm">
        No data for this period
      </div>
    );
  }

  const chartH = 160;
  const labelH = 28;
  const totalH = chartH + labelH;
  const gap = 3;
  const barW = Math.max(10, Math.min(48, Math.floor((800 - data.length * gap) / data.length)));
  const totalW = data.length * (barW + gap);
  const maxVal = Math.max(...data.map(d => d.total_revenue), 1);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width="100%"
        height={totalH}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        {data.map((d, i) => {
          const barH = Math.max(2, (d.total_revenue / maxVal) * chartH);
          const x = i * (barW + gap);
          const y = chartH - barH;
          const isHovered = hoveredIdx === i;
          const ttW = 140;
          const ttX = Math.min(x, totalW - ttW - 4);
          const ttY = Math.max(4, y - 40);

          return (
            <g
              key={i}
              onClick={() => onBarClick?.(d)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: onBarClick ? 'pointer' : 'default' }}
            >
              <rect
                x={x} y={y} width={barW} height={barH} rx={2}
                className={`transition-opacity duration-150 ${
                  isHovered ? 'fill-primary opacity-100' : 'fill-primary opacity-50'
                }`}
              />
              {isHovered && (
                <g>
                  <rect
                    x={ttX} y={ttY} width={ttW} height={30} rx={4}
                    className="fill-surface-container-high"
                    style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' }}
                  />
                  <text x={ttX + 8} y={ttY + 12} fontSize={9} className="fill-on-surface-variant">
                    {d.group_key}
                  </text>
                  <text x={ttX + 8} y={ttY + 24} fontSize={10} fontWeight="600" className="fill-on-surface">
                    {formatShort(d.total_revenue, metric)} · {d.order_count} orders
                  </text>
                </g>
              )}
              <text
                x={x + barW / 2} y={chartH + 18}
                textAnchor="middle" fontSize={8}
                className="fill-on-surface-variant" style={{ opacity: 0.7 }}
              >
                {d.group_key.length > 7 ? d.group_key.slice(0, 7) : d.group_key}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DrillTable — sortable, clickable, shows % of total
// ---------------------------------------------------------------------------

interface DrillTableProps {
  rows: DrillRow[];
  total: number;
  metric: AnalyticsMetric;
  dimension: AnalyticsDimension;
  currentFilters: Record<string, number | string>;
  onRowClick: (row: DrillRow) => void;
  isLoading: boolean;
}

function DrillTable({
  rows, total, metric, dimension, currentFilters, onRowClick, isLoading,
}: DrillTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'value', dir: 'desc',
  });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortConfig.key === 'value' ? a.value : a.order_count;
      const bv = sortConfig.key === 'value' ? b.value : b.order_count;
      return sortConfig.dir === 'desc' ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortConfig]);

  function toggleSort(key: SortKey) {
    setSortConfig(prev =>
      prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <span className="material-symbols-outlined text-[32px] text-on-surface-variant animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="p-8 text-center text-on-surface-variant text-sm">
        No data found for this selection
      </div>
    );
  }

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-surface-container-low/50 dark:bg-sumi-700/50">
          <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">
            {DIMENSION_LABELS[dimension]}
          </th>
          <th
            className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right cursor-pointer select-none hover:text-primary transition-colors"
            onClick={() => toggleSort('value')}
          >
            {METRIC_LABELS[metric]}
            <SortIndicator active={sortConfig.key === 'value'} dir={sortConfig.dir} />
          </th>
          <th
            className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right cursor-pointer select-none hover:text-primary transition-colors"
            onClick={() => toggleSort('order_count')}
          >
            Orders
            <SortIndicator active={sortConfig.key === 'order_count'} dir={sortConfig.dir} />
          </th>
          <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right">
            % of Total
          </th>
          <th className="py-4 px-4 w-10" />
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/5 dark:divide-sumi-700">
        {sorted.map((row, i) => {
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          const drillable = isRowDrillable(row.metadata, currentFilters);
          return (
            <tr
              key={i}
              onClick={() => drillable && onRowClick(row)}
              className={`transition-colors ${
                drillable
                  ? 'hover:bg-surface-container-low/40 dark:hover:bg-sumi-700/40 cursor-pointer group'
                  : 'hover:bg-surface-container-low/20 dark:hover:bg-sumi-700/20'
              }`}
            >
              <td className="py-4 px-6 text-sm font-medium text-on-surface">
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1.5 bg-surface-container-high dark:bg-sumi-600 rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-primary/50 rounded-full"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span>{row.label}</span>
                </div>
              </td>
              <td className="py-4 px-6 text-sm font-semibold text-on-surface text-right">
                {formatValue(row.value, metric)}
              </td>
              <td className="py-4 px-6 text-sm text-on-surface-variant text-right">
                {row.order_count.toLocaleString()}
              </td>
              <td className="py-4 px-6 text-sm text-on-surface-variant text-right">
                {pct.toFixed(1)}%
              </td>
              <td className="py-4 px-4">
                {drillable && (
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
                    chevron_right
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// CompareTable — A vs B with color-coded delta
// ---------------------------------------------------------------------------

interface CompareTableProps {
  rows: CompareRow[];
  metric: AnalyticsMetric;
  isLoading: boolean;
}

function CompareTable({ rows, metric, isLoading }: CompareTableProps) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(
    () => [...rows].sort((a, b) => sortDir === 'desc' ? b.a_value - a.a_value : a.a_value - b.a_value),
    [rows, sortDir],
  );

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <span className="material-symbols-outlined text-[32px] text-on-surface-variant animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (!sorted.length) {
    return <div className="p-8 text-center text-on-surface-variant text-sm">No data for comparison</div>;
  }

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-surface-container-low/50 dark:bg-sumi-700/50">
          <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">Label</th>
          <th
            className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right cursor-pointer hover:text-primary transition-colors select-none"
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          >
            Period A <SortIndicator active dir={sortDir} />
          </th>
          <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right">Period B</th>
          <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right">Delta</th>
          <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right">Change</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/5 dark:divide-sumi-700">
        {sorted.map((row, i) => {
          const isPositive = row.delta >= 0;
          const pctDisplay =
            row.pct_change != null
              ? `${isPositive ? '+' : ''}${(row.pct_change * 100).toFixed(1)}%`
              : '—';
          const deltaLabel = `${isPositive ? '+' : ''}${formatValue(Math.abs(row.delta), metric)}`;

          return (
            <tr key={i} className="hover:bg-surface-container-low/20 dark:hover:bg-sumi-700/20 transition-colors">
              <td className="py-4 px-6 text-sm font-medium text-on-surface">{row.label}</td>
              <td className="py-4 px-6 text-sm font-semibold text-on-surface text-right">
                {formatValue(row.a_value, metric)}
              </td>
              <td className="py-4 px-6 text-sm text-on-surface-variant text-right">
                {formatValue(row.b_value, metric)}
              </td>
              <td className={`py-4 px-6 text-sm font-semibold text-right ${isPositive ? 'text-tertiary' : 'text-error'}`}>
                {deltaLabel}
              </td>
              <td className={`py-4 px-6 text-right ${isPositive ? 'text-tertiary' : 'text-error'}`}>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                  isPositive ? 'bg-tertiary/10' : 'bg-error/10'
                }`}>
                  <span className="material-symbols-outlined text-[12px]">
                    {isPositive ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                  {pctDisplay}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// DecomposePanel — inline "why did this happen?" breakdown
// ---------------------------------------------------------------------------

interface DecomposePanelProps {
  params: AnalyticsFilterParams;
  onClose: () => void;
}

function DecomposePanel({ params, onClose }: DecomposePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'decompose', params],
    queryFn: () => analyticsApi.getDecompose(params),
  });

  return (
    <div className="bg-surface-container-low dark:bg-sumi-700/60 rounded border border-outline-variant/20 dark:border-sumi-600 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">analytics</span>
          <h4 className="text-sm font-semibold text-on-surface">Decomposition — what drove this?</h4>
        </div>
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {isLoading ? (
        <div className="h-20 animate-pulse bg-surface-container dark:bg-sumi-600 rounded" />
      ) : data ? (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Revenue', value: `$${data.total.total_revenue.toFixed(2)}` },
              { label: 'Orders', value: String(data.total.order_count) },
              { label: 'Avg / Order', value: `$${data.total.avg_order_value.toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-container-lowest dark:bg-sumi-800 rounded p-3">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">{label}</p>
                <p className="text-xl font-headline text-on-surface">{value}</p>
              </div>
            ))}
          </div>

          {/* Daily timeseries table */}
          {data.timeseries.length > 0 && (
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-surface-container-low dark:bg-sumi-700">
                  <tr>
                    {['Date', 'Revenue', 'Orders', 'Avg / Order'].map(h => (
                      <th key={h} className="py-2 px-3 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5 dark:divide-sumi-600">
                  {data.timeseries.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-container dark:hover:bg-sumi-600/40 transition-colors">
                      <td className="py-2 px-3 text-on-surface-variant">{row.group_key}</td>
                      <td className="py-2 px-3 font-semibold text-on-surface">${row.total_revenue.toFixed(2)}</td>
                      <td className="py-2 px-3 text-on-surface-variant">{row.order_count}</td>
                      <td className="py-2 px-3 text-on-surface-variant">${row.avg_order_value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function SummaryCard({
  label, value, icon, highlight = false,
}: {
  label: string; value: string; icon: string; highlight?: boolean;
}) {
  if (highlight) {
    return (
      <div className="bg-gradient-to-br from-primary to-primary-container p-6 rounded shadow-xl shadow-primary/10 relative overflow-hidden group hover:brightness-105 transition-all">
        <div className="relative z-10 text-white">
          <p className="text-[11px] uppercase tracking-[0.1em] text-white/70 font-bold mb-4">{label}</p>
          <span className="text-4xl font-headline">{value}</span>
        </div>
        <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-white/10 text-[80px] transition-transform group-hover:scale-110">{icon}</span>
      </div>
    );
  }
  return (
    <div className="bg-surface-container-lowest dark:bg-sumi-800 p-6 rounded card-shadow border border-outline-variant/10 relative overflow-hidden group hover:border-outline-variant/30 transition-all">
      <div className="relative z-10">
        <p className="text-[11px] uppercase tracking-[0.1em] text-on-surface-variant/70 font-bold mb-4">{label}</p>
        <span className="text-4xl font-headline text-on-surface">{value}</span>
      </div>
      <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-surface-container text-[80px] opacity-20 transition-transform group-hover:scale-110">{icon}</span>
    </div>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 opacity-20">↕</span>;
  return <span className="ml-1 text-primary">{dir === 'desc' ? '↓' : '↑'}</span>;
}

// ---------------------------------------------------------------------------
// SignalCard — one anomaly surfaced by /signals
// ---------------------------------------------------------------------------

function formatSignalValue(value: number, metric: string): string {
  if (metric === 'order_count') return value.toLocaleString();
  return `$${value.toFixed(2)}`;
}

interface SignalCardProps {
  signal: Signal;
  onNavigate: (date: string) => void;
}

function SignalCard({ signal, onNavigate }: SignalCardProps) {
  const isHigh = signal.severity === 'high';
  const isIncrease = signal.direction === 'increase';

  return (
    <button
      onClick={() => onNavigate(signal.date)}
      className={`w-full text-left p-5 rounded border transition-all hover:brightness-105 ${
        isHigh
          ? 'border-error/30 bg-error/5 dark:bg-error/10'
          : 'border-tertiary/30 bg-tertiary/5 dark:bg-tertiary/10'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[16px] ${isHigh ? 'text-error' : 'text-tertiary'}`}>
              {isIncrease ? 'trending_up' : 'trending_down'}
            </span>
            <span className={`text-xs font-bold uppercase tracking-wider ${isHigh ? 'text-error' : 'text-tertiary'}`}>
              {signal.severity} · {SIGNAL_METRIC_LABELS[signal.metric] ?? signal.metric}
            </span>
          </div>
          <p className="text-sm text-on-surface">{signal.message}</p>
          <p className="text-xs text-on-surface-variant">{signal.date}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-headline ${isHigh ? 'text-error' : 'text-tertiary'}`}>
            {signal.z_score > 0 ? '+' : ''}{signal.z_score.toFixed(1)}σ
          </p>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">z-score</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-on-surface-variant">
        <span>Actual: <span className="font-semibold text-on-surface">{formatSignalValue(signal.value, signal.metric)}</span></span>
        <span>Average: <span className="font-semibold text-on-surface">{formatSignalValue(signal.mean, signal.metric)}</span></span>
        <span className="ml-auto flex items-center gap-1 opacity-60">
          <span className="material-symbols-outlined text-[12px]">touch_app</span>
          Explore
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Analytics page
// ---------------------------------------------------------------------------

const INITIAL_STEP: DrillStep = {
  label: 'All Orders',
  dimension: 'category',
  metric: 'revenue',
  filters: {},
};

export default function Analytics() {
  // ── Global time range ─────────────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [mealPeriod, setMealPeriod] = useState<'' | 'lunch' | 'dinner'>('');

  // ── Chart ─────────────────────────────────────────────────────────────────
  const [chartGroupBy, setChartGroupBy] = useState<AnalyticsGroupBy>('day');
  const [decomposeOpen, setDecomposeOpen] = useState(false);

  // ── Drill stack (single source of truth for the breakdown table) ──────────
  const [drillStack, setDrillStack] = useState<DrillStep[]>([INITIAL_STEP]);

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // ── Compare mode ──────────────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareRange, setCompareRange] = useState<TimeRange>('30d');
  const [compareCustomStart, setCompareCustomStart] = useState('');
  const [compareCustomEnd, setCompareCustomEnd] = useState('');

  // Current drill level
  const current = drillStack[drillStack.length - 1];
  const { start, end } = getDateRange(timeRange, customStart, customEnd);

  // Compare period B dates
  const { start: compareStart, end: compareEnd } = useMemo(() => {
    if (compareRange !== 'custom') {
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      const e = new Date(start); // period B ends where period A starts
      const s = new Date(e);
      s.setDate(s.getDate() - (compareRange === '7d' ? 7 : 30));
      return { start: fmt(s), end: fmt(e) };
    }
    return { start: compareCustomStart, end: compareCustomEnd };
  }, [compareRange, compareCustomStart, compareCustomEnd, start]); // eslint-disable-line

  // Build shared filter params from current drill state
  const sharedFilterParams: AnalyticsFilterParams = {
    start_date: start,
    end_date: end,
    meal_period: mealPeriod || undefined,
    ...current.filters,
  };

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'summary', start, end, mealPeriod],
    queryFn: () => analyticsApi.getSummary({ start_date: start, end_date: end, meal_period: mealPeriod || undefined }),
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['analytics', 'chart', start, end, mealPeriod, chartGroupBy],
    queryFn: () => analyticsApi.getSummary({
      start_date: start, end_date: end,
      meal_period: mealPeriod || undefined,
      group_by: chartGroupBy,
    }),
  });

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ['analytics', 'drill', start, end, mealPeriod, current],
    queryFn: () => analyticsApi.getDrill({
      metric: current.metric,
      dimension: current.dimension,
      start_date: start,
      end_date: end,
      meal_period: mealPeriod || undefined,
      ...current.filters,
    }),
    enabled: !compareMode,
  });

  const { data: signalsData, isLoading: signalsLoading } = useQuery({
    queryKey: ['analytics', 'signals', mealPeriod],
    queryFn: () => analyticsApi.getSignals({ meal_period: mealPeriod || undefined }),
    enabled: activeTab === 'signals',
  });

  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ['analytics', 'compare', start, end, compareStart, compareEnd, mealPeriod, current.metric, current.dimension, current.filters],
    queryFn: () => analyticsApi.getCompare({
      metric: current.metric,
      dimension: current.dimension,
      a_start_date: start,
      a_end_date: end,
      b_start_date: compareStart,
      b_end_date: compareEnd,
      a_meal_period: mealPeriod || undefined,
      b_meal_period: mealPeriod || undefined,
      ...(current.filters.category_id != null ? { category_id: Number(current.filters.category_id) } : {}),
      ...(current.filters.item_id != null ? { item_id: Number(current.filters.item_id) } : {}),
    }),
    enabled: compareMode,
  });

  // ── Drill stack handlers ──────────────────────────────────────────────────

  function handleRowClick(row: DrillRow) {
    const newFilters = accumulateFilters(current.filters, row.metadata);
    const nextDim = suggestNextDimension(current.dimension, row.metadata);
    setDrillStack(prev => [
      ...prev,
      { label: row.label, dimension: nextDim, metric: current.metric, filters: newFilters },
    ]);
  }

  function handleBreadcrumbClick(idx: number) {
    setDrillStack(prev => prev.slice(0, idx + 1));
  }

  function handleDimensionChange(dim: AnalyticsDimension) {
    setDrillStack(prev => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], dimension: dim },
    ]);
  }

  function handleMetricChange(metric: AnalyticsMetric) {
    setDrillStack(prev => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], metric },
    ]);
  }

  function handleSignalNavigate(date: string) {
    setCustomStart(date);
    setCustomEnd(date);
    setTimeRange('custom');
    setDrillStack([{ ...INITIAL_STEP, label: date }]);
    setActiveTab('overview');
  }

  function handleChartBarClick(group: SummaryGroup) {
    // Clicking a bar narrows context to that day — resets drill to top with date label
    if (chartGroupBy === 'day') {
      setCustomStart(group.group_key);
      setCustomEnd(group.group_key);
      setTimeRange('custom');
      setDrillStack([{ ...INITIAL_STEP, label: group.group_key }]);
    }
  }

  const chartGroups = chartData?.groups ?? [];
  const drillTotal = drillData?.total ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-10">

      {/* ── Hero + global controls ── */}
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline leading-tight text-on-surface">The Lens</h2>
          <p className="text-on-surface-variant font-light text-sm">
            Observe → Drill → Compare → Explain
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Time range toggle */}
          <div className="flex rounded overflow-hidden border border-outline-variant/20 dark:border-sumi-600">
            {(['7d', '30d'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  timeRange === r
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-low dark:bg-sumi-800 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {r === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
            <button onClick={() => setTimeRange('custom')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                timeRange === 'custom'
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-low dark:bg-sumi-800 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Custom
            </button>
          </div>

          {timeRange === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
              />
              <span className="text-on-surface-variant text-xs">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
              />
            </>
          )}

          <select value={mealPeriod} onChange={e => setMealPeriod(e.target.value as '' | 'lunch' | 'dinner')}
            className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
          >
            <option value="">All periods</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
          </select>
        </div>
      </section>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-outline-variant/15 dark:border-sumi-700">
        {([['overview', 'bar_chart', 'Overview'], ['signals', 'notifications_active', 'Signals']] as const).map(([tab, icon, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
            {label}
            {tab === 'signals' && (signalsData?.length ?? 0) > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error">
                {signalsData!.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && <>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {summaryLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface-container-lowest dark:bg-sumi-800 p-6 rounded border border-outline-variant/10 animate-pulse h-28" />
          ))
        ) : (
          <>
            <SummaryCard label="Total Revenue"  value={`$${(summary?.total_revenue ?? 0).toFixed(2)}`}   icon="payments"     highlight />
            <SummaryCard label="Orders"          value={String(summary?.order_count ?? 0)}                icon="receipt_long" />
            <SummaryCard label="Avg Per Order"   value={`$${(summary?.avg_order_value ?? 0).toFixed(2)}`} icon="show_chart"   />
          </>
        )}
      </div>

      {/* ── Revenue chart ── */}
      <section className="bg-surface-container-lowest dark:bg-sumi-800 rounded border border-outline-variant/10 dark:border-sumi-700 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-lg font-headline text-on-surface">Revenue Over Time</h3>
          <div className="flex items-center gap-2">
            <select value={chartGroupBy} onChange={e => setChartGroupBy(e.target.value as AnalyticsGroupBy)}
              className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-700 text-on-surface"
            >
              {(Object.keys(CHART_GROUP_LABELS) as AnalyticsGroupBy[]).map(k => (
                <option key={k} value={k}>{CHART_GROUP_LABELS[k]}</option>
              ))}
            </select>
            <button
              onClick={() => setDecomposeOpen(v => !v)}
              title="Decompose: break revenue into drivers"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                decomposeOpen
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'border-outline-variant/20 dark:border-sumi-600 text-on-surface-variant hover:text-primary bg-surface-container-low dark:bg-sumi-700'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">analytics</span>
              Explain
            </button>
          </div>
        </div>

        {chartLoading ? (
          <div className="h-48 bg-surface-container-low dark:bg-sumi-700 rounded animate-pulse" />
        ) : (
          <BarChart data={chartGroups} metric={current.metric} onBarClick={handleChartBarClick} />
        )}

        <p className="text-[10px] text-on-surface-variant opacity-60 text-right">
          Click a bar to zoom into that day
        </p>
      </section>

      {/* ── Decompose panel (inline, collapsible) ── */}
      {decomposeOpen && (
        <DecomposePanel params={sharedFilterParams} onClose={() => setDecomposeOpen(false)} />
      )}

      {/* ── Breakdown section ── */}
      <section className="space-y-4">

        {/* Controls row: breadcrumb + selectors + compare toggle */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 flex-wrap text-sm">
            {drillStack.map((step, idx) => (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && (
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant opacity-40">
                    chevron_right
                  </span>
                )}
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={`transition-colors ${
                    idx === drillStack.length - 1
                      ? 'text-primary font-semibold cursor-default'
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {step.label}
                </button>
              </span>
            ))}
            {drillStack.length > 1 && (
              <button
                onClick={() => setDrillStack([INITIAL_STEP])}
                className="ml-2 text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                Reset
              </button>
            )}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={current.metric} onChange={e => handleMetricChange(e.target.value as AnalyticsMetric)}
              className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
            >
              {(Object.keys(METRIC_LABELS) as AnalyticsMetric[]).map(k => (
                <option key={k} value={k}>{METRIC_LABELS[k]}</option>
              ))}
            </select>
            <span className="text-on-surface-variant text-xs">by</span>
            <select value={current.dimension} onChange={e => handleDimensionChange(e.target.value as AnalyticsDimension)}
              className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
            >
              {(Object.keys(DIMENSION_LABELS) as AnalyticsDimension[]).map(k => (
                <option key={k} value={k}>{DIMENSION_LABELS[k]}</option>
              ))}
            </select>

            {/* Compare mode toggle */}
            <button
              onClick={() => setCompareMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                compareMode
                  ? 'bg-secondary/10 text-secondary border-secondary/20'
                  : 'border-outline-variant/20 dark:border-sumi-600 text-on-surface-variant hover:text-secondary bg-surface-container-low dark:bg-sumi-800'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">compare_arrows</span>
              Compare
            </button>
          </div>
        </div>

        {/* Compare period B controls */}
        {compareMode && (
          <div className="flex flex-wrap items-center gap-3 px-1 py-3 bg-secondary/5 rounded border border-secondary/15">
            <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Period B</span>
            <div className="flex rounded overflow-hidden border border-secondary/20">
              {(['7d', '30d'] as TimeRange[]).map(r => (
                <button key={r} onClick={() => setCompareRange(r)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    compareRange === r
                      ? 'bg-secondary text-white'
                      : 'bg-surface-container-low dark:bg-sumi-800 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {r === '7d' ? 'Prior 7d' : 'Prior 30d'}
                </button>
              ))}
              <button onClick={() => setCompareRange('custom')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  compareRange === 'custom'
                    ? 'bg-secondary text-white'
                    : 'bg-surface-container-low dark:bg-sumi-800 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Custom
              </button>
            </div>
            {compareRange === 'custom' && (
              <>
                <input type="date" value={compareCustomStart} onChange={e => setCompareCustomStart(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded border border-secondary/20 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
                />
                <span className="text-on-surface-variant text-xs">to</span>
                <input type="date" value={compareCustomEnd} onChange={e => setCompareCustomEnd(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded border border-secondary/20 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
                />
              </>
            )}
            <span className="text-[10px] text-on-surface-variant ml-auto">
              A = {start} → {end} &nbsp;·&nbsp; B = {compareStart} → {compareEnd}
            </span>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded overflow-hidden border border-outline-variant/10 dark:border-sumi-700 shadow-sm">
          {compareMode ? (
            <CompareTable
              rows={compareData?.rows ?? []}
              metric={current.metric}
              isLoading={compareLoading}
            />
          ) : (
            <DrillTable
              rows={drillData?.rows ?? []}
              total={drillTotal}
              metric={current.metric}
              dimension={current.dimension}
              currentFilters={current.filters}
              onRowClick={handleRowClick}
              isLoading={drillLoading}
            />
          )}
        </div>

        {/* Total footer (drill mode only) */}
        {!compareMode && !drillLoading && (drillData?.rows.length ?? 0) > 0 && (
          <div className="flex justify-end gap-4 px-2">
            <span className="text-xs text-on-surface-variant uppercase tracking-wider">Total</span>
            <span className="text-sm font-semibold text-on-surface">
              {formatValue(drillTotal, current.metric)}
            </span>
          </div>
        )}
      </section>

      </>}

      {/* ── Signals tab ── */}
      {activeTab === 'signals' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-headline text-on-surface">Anomaly Signals</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Days where a metric deviated more than 2σ from the 14-day rolling average.
                Click any card to explore that day.
              </p>
            </div>
          </div>

          {signalsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 bg-surface-container-lowest dark:bg-sumi-800 rounded border border-outline-variant/10 animate-pulse" />
              ))}
            </div>
          ) : !signalsData?.length ? (
            <div className="py-16 flex flex-col items-center gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] opacity-30">check_circle</span>
              <p className="text-sm">No anomalies detected in the last 14 days.</p>
              <p className="text-xs opacity-60">All metrics are within 2 standard deviations of their rolling average.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {signalsData.map((signal, i) => (
                <SignalCard key={i} signal={signal} onNavigate={handleSignalNavigate} />
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-outline-variant/10 dark:border-sumi-700">
            <p className="text-[10px] text-on-surface-variant opacity-50">
              Method: z-score over a 14-day rolling window. Severity: medium = |z| &gt; 2, high = |z| &gt; 3.
              No machine learning — pure descriptive statistics.
            </p>
          </div>
        </section>
      )}

    </div>
  );
}
