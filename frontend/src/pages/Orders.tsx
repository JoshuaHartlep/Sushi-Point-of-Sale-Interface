import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle2, XCircle, Plus, Percent, Edit2, Trash2, X, Edit, Eye, AlertCircle, Loader2, DollarSign, ChevronDown } from 'lucide-react';
import { ordersApi, menuApi, Order } from '../services/api';
import { useNavigate } from 'react-router-dom';
import StatusDropdown from '../components/StatusDropdown';

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
}

interface Order {
  id: number;
  tableNumber: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  items: OrderItem[];
  total: number;
  discount?: {
    amount: number;
    type: 'percentage' | 'fixed';
  };
  createdAt: string;
}

interface OrderCreate {
  table_id: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  ayce_order: boolean;
  ayce_price: number;
  items: OrderItem[];
  notes?: string;
}

interface MenuItem {
  id: number;
  name: string;
  price: number;
}

const formatTotal = (total: string | number | undefined): string => {
  if (typeof total === 'string') {
    return parseFloat(total).toFixed(2);
  }
  if (typeof total === 'number' && !isNaN(total)) {
    return total.toFixed(2);
  }
  return '0.00';
};

const Orders = () => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<OrderCreate>({
    table_id: 1,
    status: 'pending',
    ayce_order: false,
    ayce_price: 0,
    items: []
  });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editingStatus, setEditingStatus] = useState<number | null>(null);

  const { 
    data: orders = [], 
    isLoading: ordersLoading,
    error: ordersError 
  } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: ordersApi.getAll,
    onError: (error) => {
      console.error('Error fetching orders:', error);
    }
  });

  const { 
    data: orderTotals = {},
    isLoading: totalsLoading,
    error: totalsError
  } = useQuery({
    queryKey: ['orderTotals', orders],
    queryFn: async () => {
      const totals: Record<number, string> = {};
      for (const order of orders) {
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
    enabled: orders.length > 0,
  });

  const { 
    data: orderDetails,
    isLoading: detailsLoading,
    error: detailsError
  } = useQuery({
    queryKey: ['orderDetails', selectedOrder?.id],
    queryFn: () => selectedOrder ? ordersApi.getById(selectedOrder.id) : null,
    enabled: !!selectedOrder && isViewModalOpen,
  });

  const { 
    data: menuItems,
    isLoading: menuItemsLoading,
    error: menuItemsError
  } = useQuery({
    queryKey: ['menuItems', orderDetails?.items?.map(item => item.menu_item_id)],
    queryFn: async () => {
      if (!orderDetails?.items) return {};
      const items: Record<number, MenuItem> = {};
      for (const item of orderDetails.items) {
        try {
          const menuItem = await menuApi.getItem(item.menu_item_id);
          items[item.menu_item_id] = menuItem;
        } catch (error) {
          console.error(`Error fetching menu item ${item.menu_item_id}:`, error);
        }
      }
      return items;
    },
    enabled: !!orderDetails?.items,
  });

  const { 
    data: orderTotal,
    isLoading: totalLoading,
    error: totalError
  } = useQuery({
    queryKey: ['orderTotal', selectedOrder?.id],
    queryFn: () => selectedOrder ? ordersApi.getTotal(selectedOrder.id) : null,
    enabled: !!selectedOrder && isViewModalOpen,
  });

  const applyDiscountMutation = useMutation({
    mutationFn: ({ orderId, data }: { orderId: number; data: any }) =>
      ordersApi.applyDiscount(orderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShowDiscountModal(false);
      setSelectedOrder(null);
    },
  });

  const removeDiscountMutation = useMutation({
    mutationFn: (orderId: number) => ordersApi.removeDiscount(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrder(null);
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsNewOrderModalOpen(false);
      setNewOrder({
        table_id: 1,
        status: 'pending',
        ayce_order: false,
        ayce_price: 0,
        items: []
      });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: number) => ordersApi.delete(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsDeleteModalOpen(false);
      setSelectedOrder(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) =>
      ordersApi.update(orderId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const handleApplyDiscount = () => {
    if (!selectedOrder || !discountAmount) return;

    const amount = parseFloat(discountAmount);
    if (isNaN(amount)) return;

    applyDiscountMutation.mutate({
      orderId: selectedOrder.id,
      data: {
        amount,
        type: discountType,
      },
    });
  };

  const handleRemoveDiscount = () => {
    if (!selectedOrder) return;
    removeDiscountMutation.mutate(selectedOrder.id);
  };

  const handleCreateOrder = async () => {
    try {
      await createOrderMutation.mutateAsync(newOrder);
      setIsNewOrderModalOpen(false);
      setNewOrder({
        table_id: 1,
        status: 'pending',
        ayce_order: false,
        ayce_price: 0,
        items: []
      });
    } catch (error) {
      console.error('Error creating order:', error);
    }
  };

  const handleStatusChange = (orderId: number, newStatus: string) => {
    updateStatusMutation.mutate({ orderId, status: newStatus });
  };

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'ready', label: 'Ready' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'preparing':
        return 'bg-blue-100 text-blue-800';
      case 'ready':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5" />;
      case 'preparing':
        return <Clock className="w-5 h-5" />;
      case 'ready':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsViewModalOpen(true);
  };

  const handleDeleteClick = (order: Order) => {
    setSelectedOrder(order);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedOrder) {
      deleteOrderMutation.mutate(selectedOrder.id);
    }
  };

  if (ordersLoading || totalsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600 dark:text-gray-400" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (ordersError || totalsError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="mt-4 text-red-600 dark:text-red-400">
            Error loading orders. Please try again later.
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {ordersError?.message || totalsError?.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
        <button
          onClick={() => setIsNewOrderModalOpen(true)}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Order
        </button>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-md dark:hover:shadow-lg transition-all border dark:border-gray-700"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Order #{order.id}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Table {order.table_id}
                </p>
              </div>
              <StatusDropdown
                currentStatus={order.status}
                orderId={order.id}
                onStatusChange={handleStatusChange}
                isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.orderId === order.id}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  ${formatTotal(orderTotals[order.id])}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Created</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {new Date(order.created_at).toLocaleString()}
                </span>
              </div>
              {order.ayce_order && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Type</span>
                  <span className="text-blue-600 dark:text-blue-400 font-medium">AYCE</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end space-x-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleViewOrder(order)}
                  className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => navigate(`/orders/${order.id}/edit`)}
                  className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
              <button 
                onClick={() => handleDeleteClick(order)}
                className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      <div className="mt-8">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Table</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-4 px-6 text-gray-900 dark:text-white">#{order.id}</td>
                <td className="py-4 px-6 text-gray-900 dark:text-white">Table {order.table_id}</td>
                <td className="py-4 px-6">
                  <StatusDropdown
                    currentStatus={order.status}
                    orderId={order.id}
                    onStatusChange={handleStatusChange}
                    isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.orderId === order.id}
                  />
                </td>
                <td className="py-4 px-6 text-gray-900 dark:text-white">${formatTotal(orderTotals[order.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Order Modal */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-96 border dark:border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Create New Order</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Table Number</label>
                <input
                  type="number"
                  value={newOrder.table_id}
                  onChange={(e) => setNewOrder({ ...newOrder, table_id: parseInt(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newOrder.ayce_order}
                    onChange={(e) => setNewOrder({ ...newOrder, ayce_order: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">All You Can Eat Order</span>
                </label>
              </div>
              {newOrder.ayce_order && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AYCE Price</label>
                  <input
                    type="number"
                    value={newOrder.ayce_price}
                    onChange={(e) => setNewOrder({ ...newOrder, ayce_price: parseFloat(e.target.value) })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                <textarea
                  value={newOrder.notes || ''}
                  onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsNewOrderModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOrder}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-700 rounded-md hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
              >
                Create Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Order Modal */}
      {isViewModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl border dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Order #{selectedOrder.id} Details
              </h2>
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailsLoading || totalLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : detailsError || totalError ? (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md">
                <AlertCircle className="w-5 h-5 inline-block mr-2" />
                Error loading order details. Please try again.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Order Status and Table */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedOrder.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Table</p>
                    <p className="font-medium text-gray-900 dark:text-white">#{selectedOrder.table_id}</p>
                  </div>
                </div>

                {/* AYCE Status */}
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">All You Can Eat</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedOrder.ayce_order ? 'Yes' : 'No'}</p>
                  {selectedOrder.ayce_order && orderTotal && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      AYCE Price: ${formatTotal(orderTotal.ayce_price)}
                    </p>
                  )}
                </div>

                {/* Order Items */}
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Items</p>
                  <div className="space-y-2">
                    {orderDetails?.items?.map((item) => {
                      const menuItem = menuItems?.[item.menu_item_id];
                      const itemTotal = menuItem ? item.quantity * menuItem.price : 0;
                      return (
                        <div key={item.id} className="flex justify-between">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {menuItem?.name || 'Unknown item'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Qty: {item.quantity}</p>
                          </div>
                          <p className="text-gray-900 dark:text-white">
                            ${formatTotal(itemTotal)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Order Notes */}
                {selectedOrder.notes && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Notes</p>
                    <p className="font-medium text-gray-900 dark:text-white">{selectedOrder.notes}</p>
                  </div>
                )}

                {/* Pricing Summary */}
                {orderTotal && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-4 space-y-2">
                    <div className="flex justify-between">
                      <p className="text-gray-600 dark:text-gray-400">Subtotal</p>
                      <p className="font-medium text-gray-900 dark:text-white">${formatTotal(orderTotal.subtotal)}</p>
                    </div>
                    {orderTotal.discount_amount && Number(orderTotal.discount_amount) > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <p>Discount</p>
                        <p>-${formatTotal(orderTotal.discount_amount)}</p>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg text-gray-900 dark:text-white">
                      <p>Total</p>
                      <p>${formatTotal(orderTotal.total)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md border dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Apply Discount</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Discount Type
                </label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Amount
                </label>
                <input
                  type="text"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder={discountType === 'percentage' ? 'Enter percentage' : 'Enter amount'}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => setShowDiscountModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyDiscount}
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-500 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Delete Order
              </h2>
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete Order #{selectedOrder.id}? This action cannot be undone.
            </p>

            {deleteOrderMutation.isError && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md mb-4">
                <AlertCircle className="w-5 h-5 inline-block mr-2" />
                Failed to delete order. Please try again.
              </div>
            )}

            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteOrderMutation.isPending}
                className="px-4 py-2 bg-red-500 dark:bg-red-600 text-white rounded-lg hover:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleteOrderMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders; 