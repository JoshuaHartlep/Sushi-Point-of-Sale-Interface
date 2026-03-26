import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  analyticsApi,
  type SummaryGroup,
  type DrillRow,
  type AnalyticsMetric,
  type AnalyticsDimension,
  type AnalyticsGroupBy,
} from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrillCrumb {
  label: string;
  dimension: AnalyticsDimension;
  metric: AnalyticsMetric;
  filters: {
    category_id?: number;
    item_id?: number;
    order_type?: string;
  };
}

type TimeRange = '7d' | '30d' | 'custom';
type SortKey = 'value' | 'order_count';

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
// Helpers
// ---------------------------------------------------------------------------

function getDateRange(
  timeRange: TimeRange,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  if (timeRange === 'custom') {
    return { start: customStart || fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: customEnd || fmt(today) };
  }

  const start = new Date(today);
  start.setDate(today.getDate() - (timeRange === '7d' ? 7 : 30));
  return { start: fmt(start), end: fmt(today) };
}

function formatValue(value: number, metric: AnalyticsMetric): string {
  if (metric === 'order_count' || metric === 'item_count') {
    return value.toLocaleString();
  }
  return `$${value.toFixed(2)}`;
}

function formatShort(value: number, metric: AnalyticsMetric): string {
  if (metric === 'order_count' || metric === 'item_count') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  }
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(0)}`;
}

// What dimension to drill into when clicking a row
function nextDimension(current: AnalyticsDimension): AnalyticsDimension | null {
  const path: AnalyticsDimension[] = ['category', 'item', 'day_of_week', 'hour'];
  const idx = path.indexOf(current);
  return idx !== -1 && idx < path.length - 1 ? path[idx + 1] : null;
}

// ---------------------------------------------------------------------------
// Bar Chart component (SVG, no external library)
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

          // Tooltip position (keep within SVG bounds)
          const ttW = 130;
          const ttX = Math.min(x, totalW - ttW - 4);
          const ttY = Math.max(4, y - 38);

          return (
            <g
              key={i}
              onClick={() => onBarClick?.(d)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: onBarClick ? 'pointer' : 'default' }}
            >
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                className={`transition-opacity duration-150 ${
                  isHovered ? 'fill-primary opacity-100' : 'fill-primary opacity-50'
                }`}
              />

              {/* Hover tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={ttX}
                    y={ttY}
                    width={ttW}
                    height={30}
                    rx={4}
                    className="fill-surface-container-high"
                    style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.25))' }}
                  />
                  <text
                    x={ttX + 8}
                    y={ttY + 12}
                    fontSize={9}
                    className="fill-on-surface-variant"
                  >
                    {d.group_key}
                  </text>
                  <text
                    x={ttX + 8}
                    y={ttY + 24}
                    fontSize={10}
                    fontWeight="600"
                    className="fill-on-surface"
                  >
                    {formatShort(d.total_revenue, metric)} · {d.order_count} orders
                  </text>
                </g>
              )}

              {/* X-axis label */}
              <text
                x={x + barW / 2}
                y={chartH + 18}
                textAnchor="middle"
                fontSize={8}
                className="fill-on-surface-variant"
                style={{ opacity: 0.7 }}
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
// Main Analytics page
// ---------------------------------------------------------------------------

export default function Analytics() {
  // ── Time range state ──────────────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [mealPeriod, setMealPeriod] = useState<'' | 'lunch' | 'dinner'>('');

  // ── Chart state ───────────────────────────────────────────────────────────
  const [chartGroupBy, setChartGroupBy] = useState<AnalyticsGroupBy>('day');

  // ── Drill state ───────────────────────────────────────────────────────────
  const [drillStack, setDrillStack] = useState<DrillCrumb[]>([
    { label: 'All Orders', dimension: 'category', metric: 'revenue', filters: {} },
  ]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'value',
    dir: 'desc',
  });

  // Current drill level is always the top of the stack
  const currentDrill = drillStack[drillStack.length - 1];

  const { start, end } = getDateRange(timeRange, customStart, customEnd);

  // ── Summary query (cards) ─────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'summary', start, end, mealPeriod],
    queryFn: () =>
      analyticsApi.getSummary({
        start_date: start,
        end_date: end,
        meal_period: mealPeriod || undefined,
      }),
  });

  // ── Chart query (grouped by day/week/etc.) ────────────────────────────────
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['analytics', 'chart', start, end, mealPeriod, chartGroupBy],
    queryFn: () =>
      analyticsApi.getSummary({
        start_date: start,
        end_date: end,
        meal_period: mealPeriod || undefined,
        group_by: chartGroupBy,
      }),
  });

  // ── Drill query ───────────────────────────────────────────────────────────
  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ['analytics', 'drill', start, end, mealPeriod, currentDrill],
    queryFn: () =>
      analyticsApi.getDrill({
        metric: currentDrill.metric,
        dimension: currentDrill.dimension,
        start_date: start,
        end_date: end,
        meal_period: mealPeriod || undefined,
        ...currentDrill.filters,
      }),
  });

  // ── Sorted drill rows ─────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!drillData?.rows) return [];
    const rows = [...drillData.rows];
    rows.sort((a, b) => {
      const av = sortConfig.key === 'value' ? a.value : a.order_count;
      const bv = sortConfig.key === 'value' ? b.value : b.order_count;
      return sortConfig.dir === 'desc' ? bv - av : av - bv;
    });
    return rows;
  }, [drillData, sortConfig]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  }

  function handleDrillRowClick(row: DrillRow) {
    const next = nextDimension(currentDrill.dimension);
    if (!next) return;

    const newFilters = { ...currentDrill.filters };
    if (currentDrill.dimension === 'category' && row.category_id != null) {
      newFilters.category_id = row.category_id;
    } else if (currentDrill.dimension === 'item' && row.item_id != null) {
      newFilters.item_id = row.item_id;
    }

    setDrillStack(prev => [
      ...prev,
      {
        label: row.label,
        dimension: next,
        metric: currentDrill.metric,
        filters: newFilters,
      },
    ]);
  }

  function handleBreadcrumbClick(idx: number) {
    setDrillStack(prev => prev.slice(0, idx + 1));
  }

  function handleDimensionChange(dim: AnalyticsDimension) {
    // Replace top of stack with new dimension, preserve filters
    setDrillStack(prev => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], dimension: dim },
    ]);
  }

  function handleMetricChange(metric: AnalyticsMetric) {
    // Update metric at current level and propagate through rest of stack
    setDrillStack(prev =>
      prev.map((crumb, i) =>
        i === prev.length - 1 ? { ...crumb, metric } : crumb
      )
    );
  }

  function handleChartBarClick(group: SummaryGroup) {
    // Clicking a chart bar filters the drill table to that time bucket
    // For 'day' grouping we can set exact date; for others just narrow
    if (chartGroupBy === 'day') {
      setDrillStack([
        {
          label: group.group_key,
          dimension: currentDrill.dimension,
          metric: currentDrill.metric,
          filters: { ...currentDrill.filters },
        },
      ]);
      // Note: ideally this would set start/end dates — for Phase 1 we show the label
    }
  }

  const canDrillDeeper = nextDimension(currentDrill.dimension) !== null;
  const chartGroups = chartData?.groups ?? [];
  const total = drillData?.total ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-10">

      {/* ── Page hero + controls ── */}
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline leading-tight text-on-surface">The Lens</h2>
          <p className="text-on-surface-variant font-light text-sm">
            Explore, slice, and drill into your restaurant's data.
          </p>
        </div>

        {/* Controls bar */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Time range */}
          <div className="flex rounded overflow-hidden border border-outline-variant/20 dark:border-sumi-600">
            {(['7d', '30d'] as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  timeRange === r
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-low dark:bg-sumi-800 text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {r === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </button>
            ))}
            <button
              onClick={() => setTimeRange('custom')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                timeRange === 'custom'
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-low dark:bg-sumi-800 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Custom date inputs */}
          {timeRange === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
              />
              <span className="text-on-surface-variant text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
              />
            </>
          )}

          {/* Meal period filter */}
          <select
            value={mealPeriod}
            onChange={e => setMealPeriod(e.target.value as '' | 'lunch' | 'dinner')}
            className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
          >
            <option value="">All periods</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
          </select>
        </div>
      </section>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {summaryLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface-container-lowest dark:bg-sumi-800 p-6 rounded border border-outline-variant/10 animate-pulse h-28" />
          ))
        ) : (
          <>
            <SummaryCard
              label="Total Revenue"
              value={`$${(summary?.total_revenue ?? 0).toFixed(2)}`}
              icon="payments"
              highlight
            />
            <SummaryCard
              label="Orders"
              value={String(summary?.order_count ?? 0)}
              icon="receipt_long"
            />
            <SummaryCard
              label="Avg Per Order"
              value={`$${(summary?.avg_order_value ?? 0).toFixed(2)}`}
              icon="show_chart"
            />
          </>
        )}
      </div>

      {/* ── Revenue chart ── */}
      <section className="bg-surface-container-lowest dark:bg-sumi-800 rounded border border-outline-variant/10 dark:border-sumi-700 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-lg font-headline text-on-surface">Revenue Over Time</h3>
          <select
            value={chartGroupBy}
            onChange={e => setChartGroupBy(e.target.value as AnalyticsGroupBy)}
            className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-700 text-on-surface"
          >
            {(Object.keys(CHART_GROUP_LABELS) as AnalyticsGroupBy[]).map(k => (
              <option key={k} value={k}>{CHART_GROUP_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {chartLoading ? (
          <div className="h-48 bg-surface-container-low dark:bg-sumi-700 rounded animate-pulse" />
        ) : (
          <BarChart
            data={chartGroups}
            metric={currentDrill.metric}
            onBarClick={handleChartBarClick}
          />
        )}

        <p className="text-[10px] text-on-surface-variant opacity-60 text-right">
          Click a bar to filter the breakdown below
        </p>
      </section>

      {/* ── Drill section ── */}
      <section className="space-y-4">

        {/* Drill controls + breadcrumb */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-wrap">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 flex-wrap text-sm">
            {drillStack.map((crumb, idx) => (
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
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>

          {/* Metric + Dimension selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={currentDrill.metric}
              onChange={e => handleMetricChange(e.target.value as AnalyticsMetric)}
              className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
            >
              {(Object.keys(METRIC_LABELS) as AnalyticsMetric[]).map(k => (
                <option key={k} value={k}>{METRIC_LABELS[k]}</option>
              ))}
            </select>

            <span className="text-on-surface-variant text-xs">by</span>

            <select
              value={currentDrill.dimension}
              onChange={e => handleDimensionChange(e.target.value as AnalyticsDimension)}
              className="text-xs px-2 py-1.5 rounded border border-outline-variant/20 dark:border-sumi-600 bg-surface-container-low dark:bg-sumi-800 text-on-surface"
            >
              {(Object.keys(DIMENSION_LABELS) as AnalyticsDimension[]).map(k => (
                <option key={k} value={k}>{DIMENSION_LABELS[k]}</option>
              ))}
            </select>

            {drillStack.length > 1 && (
              <button
                onClick={() => setDrillStack(prev => prev.slice(0, 1))}
                className="text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-1"
                title="Reset drill to top level"
              >
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded overflow-hidden border border-outline-variant/10 dark:border-sumi-700 shadow-sm">
          {drillLoading ? (
            <div className="p-8 flex justify-center">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant animate-spin">
                progress_activity
              </span>
            </div>
          ) : !sortedRows.length ? (
            <div className="p-8 text-center text-on-surface-variant text-sm">
              No data found for this selection
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 dark:bg-sumi-700/50">
                  <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">
                    {DIMENSION_LABELS[currentDrill.dimension]}
                  </th>
                  <th
                    className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right cursor-pointer select-none hover:text-primary transition-colors"
                    onClick={() => handleSort('value')}
                  >
                    {METRIC_LABELS[currentDrill.metric]}
                    <SortIndicator active={sortConfig.key === 'value'} dir={sortConfig.dir} />
                  </th>
                  <th
                    className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right cursor-pointer select-none hover:text-primary transition-colors"
                    onClick={() => handleSort('order_count')}
                  >
                    Orders
                    <SortIndicator active={sortConfig.key === 'order_count'} dir={sortConfig.dir} />
                  </th>
                  <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right">
                    % of Total
                  </th>
                  {canDrillDeeper && (
                    <th className="py-4 px-4 w-10" />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 dark:divide-sumi-700">
                {sortedRows.map((row, i) => {
                  const pct = total > 0 ? (row.value / total) * 100 : 0;
                  const isDrillable = canDrillDeeper && (
                    (currentDrill.dimension === 'category' && row.category_id != null) ||
                    (currentDrill.dimension === 'item' && row.item_id != null)
                  );

                  return (
                    <tr
                      key={i}
                      onClick={() => isDrillable && handleDrillRowClick(row)}
                      className={`transition-colors ${
                        isDrillable
                          ? 'hover:bg-surface-container-low/40 dark:hover:bg-sumi-700/40 cursor-pointer group'
                          : 'hover:bg-surface-container-low/20 dark:hover:bg-sumi-700/20'
                      }`}
                    >
                      <td className="py-4 px-6 text-sm font-medium text-on-surface">
                        <div className="flex items-center gap-3">
                          {/* Inline percentage bar */}
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
                        {formatValue(row.value, currentDrill.metric)}
                      </td>
                      <td className="py-4 px-6 text-sm text-on-surface-variant text-right">
                        {row.order_count.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-sm text-on-surface-variant text-right">
                        {pct.toFixed(1)}%
                      </td>
                      {canDrillDeeper && (
                        <td className="py-4 px-4">
                          {isDrillable && (
                            <span className="material-symbols-outlined text-[18px] text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
                              chevron_right
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Total row */}
        {!drillLoading && sortedRows.length > 0 && (
          <div className="flex justify-end gap-4 px-2">
            <span className="text-xs text-on-surface-variant uppercase tracking-wider">Total</span>
            <span className="text-sm font-semibold text-on-surface">
              {formatValue(total, currentDrill.metric)}
            </span>
          </div>
        )}
      </section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
}) {
  if (highlight) {
    return (
      <div className="bg-gradient-to-br from-primary to-primary-container p-6 rounded shadow-xl shadow-primary/10 relative overflow-hidden group hover:brightness-105 transition-all">
        <div className="relative z-10 text-white">
          <p className="text-[11px] uppercase tracking-[0.1em] text-white/70 font-bold mb-4">{label}</p>
          <span className="text-4xl font-headline">{value}</span>
        </div>
        <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-white/10 text-[80px] transition-transform group-hover:scale-110">
          {icon}
        </span>
      </div>
    );
  }
  return (
    <div className="bg-surface-container-lowest dark:bg-sumi-800 p-6 rounded card-shadow border border-outline-variant/10 relative overflow-hidden group hover:border-outline-variant/30 transition-all">
      <div className="relative z-10">
        <p className="text-[11px] uppercase tracking-[0.1em] text-on-surface-variant/70 font-bold mb-4">{label}</p>
        <span className="text-4xl font-headline text-on-surface">{value}</span>
      </div>
      <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-surface-container text-[80px] opacity-20 transition-transform group-hover:scale-110">
        {icon}
      </span>
    </div>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 opacity-20">↕</span>;
  return <span className="ml-1 text-primary">{dir === 'desc' ? '↓' : '↑'}</span>;
}
