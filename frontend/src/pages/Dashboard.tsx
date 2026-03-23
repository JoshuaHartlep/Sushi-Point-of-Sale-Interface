import { useQuery } from '@tanstack/react-query';
import { dashboardApi, ordersApi } from '../services/api';

const formatTotal = (total: string | number | undefined): string => {
  if (typeof total === 'string') return parseFloat(total).toFixed(2);
  if (typeof total === 'number' && !isNaN(total)) return total.toFixed(2);
  return '0.00';
};

const statusStyles: Record<string, string> = {
  pending:   'bg-secondary/10 text-secondary',
  preparing: 'bg-primary/10 text-primary',
  ready:     'bg-tertiary/10 text-tertiary',
  delivered: 'bg-tertiary/10 text-tertiary',
  completed: 'bg-surface-container-high text-on-surface-variant',
  cancelled: 'bg-error/10 text-error',
};

const statusDot: Record<string, string> = {
  pending:   'bg-secondary',
  preparing: 'bg-primary animate-pulse',
  ready:     'bg-tertiary',
  delivered: 'bg-tertiary',
  completed: 'bg-on-surface-variant',
  cancelled: 'bg-error',
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: dashboardApi.getStats,
  });

  const { data: recentOrders, isLoading: ordersLoading, error: ordersError } = useQuery({
    queryKey: ['recentOrders'],
    queryFn: dashboardApi.getRecentOrders,
  });

  const { data: orderTotals = {}, isLoading: totalsLoading } = useQuery({
    queryKey: ['dashboardOrderTotals', recentOrders],
    queryFn: async () => {
      if (!recentOrders) return {};
      const totals: Record<number, string> = {};
      for (const order of recentOrders) {
        try {
          const { total } = await ordersApi.getTotal(order.id);
          totals[order.id] = String(total);
        } catch {
          totals[order.id] = '0.00';
        }
      }
      return totals;
    },
    enabled: !!recentOrders && recentOrders.length > 0,
  });

  const formatTime = (minutes: number) => {
    if (!minutes) return '0m';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  if (statsLoading || ordersLoading || totalsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant animate-spin">progress_activity</span>
      </div>
    );
  }

  if (statsError || ordersError || !stats || !recentOrders) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <span className="material-symbols-outlined text-[40px] text-error">error</span>
          <p className="text-sm text-on-surface-variant">Error loading dashboard data</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Orders',   value: String(stats.total_orders || 0),                    icon: 'receipt_long', suffix: '' },
    { label: 'Total Revenue',  value: `$${(stats.total_revenue || 0).toFixed(2)}`,        icon: 'payments',     suffix: '' },
    { label: 'Avg Prep Time',  value: formatTime(stats.average_order_time),               icon: 'timer',        suffix: '' },
    { label: 'Active Orders',  value: String(stats.active_orders || 0),                   icon: 'restaurant',   suffix: 'In Progress', highlight: true },
  ];

  return (
    <div className="p-8 space-y-12">

      {/* ── Page hero ── */}
      <section className="flex justify-between items-end">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline leading-tight text-on-surface">Service Dashboard</h2>
          <p className="text-on-surface-variant font-light text-sm">Live overview of today's service.</p>
        </div>
      </section>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) =>
          card.highlight ? (
            <div
              key={card.label}
              className="bg-gradient-to-br from-primary to-primary-container p-6 rounded shadow-xl shadow-primary/10 relative overflow-hidden group hover:brightness-105 transition-all"
            >
              <div className="relative z-10 text-white">
                <p className="text-[11px] uppercase tracking-[0.1em] text-white/70 font-bold mb-4">{card.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-headline">{card.value}</span>
                  {card.suffix && <span className="text-white/60 text-xs font-medium">{card.suffix}</span>}
                </div>
              </div>
              <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-white/10 text-[80px] transition-transform group-hover:scale-110">
                {card.icon}
              </span>
            </div>
          ) : (
            <div
              key={card.label}
              className="bg-surface-container-lowest dark:bg-sumi-800 p-6 rounded card-shadow border border-outline-variant/10 relative overflow-hidden group hover:border-outline-variant/30 transition-all"
            >
              <div className="relative z-10">
                <p className="text-[11px] uppercase tracking-[0.1em] text-on-surface-variant/70 font-bold mb-4">{card.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-headline text-on-surface">{card.value}</span>
                </div>
              </div>
              <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-surface-container text-[80px] opacity-20 transition-transform group-hover:scale-110">
                {card.icon}
              </span>
            </div>
          )
        )}
      </div>

      {/* ── Recent orders table ── */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-headline text-on-surface">Live Service Feed</h3>
        </div>

        <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded overflow-hidden border border-outline-variant/10 dark:border-sumi-700 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 dark:bg-sumi-700/50">
                <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">Order ID</th>
                <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">Table</th>
                <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">Status</th>
                <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold">Total</th>
                <th className="py-4 px-6 text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-bold text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5 dark:divide-sumi-700">
              {recentOrders.map((order) => {
                const st = order.status as string;
                return (
                  <tr key={order.id} className="hover:bg-surface-container-low/30 dark:hover:bg-sumi-700/30 transition-colors">
                    <td className="py-5 px-6 font-medium text-sm text-on-surface">#{order.id}</td>
                    <td className="py-5 px-6 text-sm text-on-surface-variant">Table {(order as any).table_id ?? (order as any).table_number}</td>
                    <td className="py-5 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyles[st] ?? 'bg-surface-container text-on-surface-variant'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot[st] ?? 'bg-on-surface-variant'}`} />
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </span>
                    </td>
                    <td className="py-5 px-6 text-sm font-semibold text-on-surface">
                      ${formatTotal(orderTotals[order.id])}
                    </td>
                    <td className="py-5 px-6 text-sm text-on-surface-variant text-right">
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
