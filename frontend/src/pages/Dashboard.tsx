import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, DollarSign, Package, AlertCircle, Loader2 } from 'lucide-react';
import { dashboardApi, DashboardStats, RecentOrder, ordersApi } from '../services/api';

const formatTotal = (total: string | number | undefined): string => {
  if (typeof total === 'string') {
    return parseFloat(total).toFixed(2);
  }
  if (typeof total === 'number' && !isNaN(total)) {
    return total.toFixed(2);
  }
  return '0.00';
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: dashboardApi.getStats,
    onSuccess: (data) => {
      console.log('Dashboard Stats:', data);
    },
    onError: (error) => {
      console.error('Error fetching dashboard stats:', error);
    }
  });

  const { data: recentOrders, isLoading: ordersLoading, error: ordersError } = useQuery({
    queryKey: ['recentOrders'],
    queryFn: dashboardApi.getRecentOrders,
    onSuccess: (data) => {
      console.log('Recent Orders:', data);
    },
    onError: (error) => {
      console.error('Error fetching recent orders:', error);
    }
  });

  const { 
    data: orderTotals = {},
    isLoading: totalsLoading,
    error: totalsError
  } = useQuery({
    queryKey: ['dashboardOrderTotals', recentOrders],
    queryFn: async () => {
      if (!recentOrders) return {};
      const totals: Record<number, string> = {};
      for (const order of recentOrders) {
        try {
          const { total } = await ordersApi.getTotal(order.id);
          totals[order.id] = total;
        } catch (error) {
          console.error(`Error fetching total for order ${order.id}:`, error);
          totals[order.id] = '0.00';
        }
      }
      return totals;
    },
    enabled: !!recentOrders && recentOrders.length > 0,
  });

  // Debug logging
  console.log('Current state:', {
    statsLoading,
    ordersLoading,
    statsError,
    ordersError,
    stats,
    recentOrders
  });

  if (statsLoading || ordersLoading || totalsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading dashboard data...</span>
      </div>
    );
  }

  if (statsError || ordersError || totalsError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <span className="ml-2 text-red-500">Error loading dashboard data</span>
      </div>
    );
  }

  // Ensure we have data before rendering
  if (!stats || !recentOrders) {
    return (
      <div className="flex items-center justify-center h-screen">
        <AlertCircle className="w-8 h-8 text-yellow-500" />
        <span className="ml-2 text-yellow-500">No data available</span>
      </div>
    );
  }

  const formatTime = (minutes: number) => {
    if (!minutes) return '0 minutes';
    if (minutes < 60) {
      return `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Total Orders 🍽️</h3>
          <p className="text-2xl font-bold">{stats.total_orders || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Total Revenue 💰</h3>
          <p className="text-2xl font-bold">${(stats.total_revenue || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Average Order Time ⏰</h3>
          <p className="text-2xl font-bold">{formatTime(stats.average_order_time)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Active Orders</h3>
          <p className="text-2xl font-bold">{stats.active_orders || 0}</p>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Table</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{order.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Table {order.table_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-sm ${
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'ready' ? 'bg-green-100 text-green-800' :
                      order.status === 'delivered' ? 'bg-purple-100 text-purple-800' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${formatTotal(orderTotals[order.id])}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 