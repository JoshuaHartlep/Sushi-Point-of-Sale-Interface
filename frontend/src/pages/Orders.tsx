import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, menuApi, settingsApi, Order, OrderCreate, OrderItemCreate, OrderItem, OrderTotal } from '../services/api';
import { useNavigate } from 'react-router-dom';
import StatusDropdown from '../components/StatusDropdown';

const formatTotal = (total: string | number | undefined): string => {
  if (typeof total === 'string') return parseFloat(total).toFixed(2);
  if (typeof total === 'number' && !isNaN(total)) return total.toFixed(2);
  return '0.00';
};

const formatPrice = (price: string | number): string => {
  if (typeof price === 'string') return parseFloat(price).toFixed(2);
  if (typeof price === 'number' && !isNaN(price)) return price.toFixed(2);
  return '0.00';
};

const Orders = () => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<OrderCreate>({
    table_id: 1,
    status: 'pending',
    ayce_order: false,
    items: [] as OrderItemCreate[],
  });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: orders = [], isLoading: ordersLoading, error: ordersError } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: ordersApi.getAll,
  });

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });

  const { data: orderDetails, isLoading: detailsLoading, error: detailsError } = useQuery({
    queryKey: ['orderDetails', selectedOrder?.id],
    queryFn: () => selectedOrder ? ordersApi.getById(selectedOrder.id) : null,
    enabled: !!selectedOrder && isViewModalOpen,
  });

  const { data: orderTotal, isLoading: totalLoading } = useQuery<OrderTotal | null>({
    queryKey: ['orderTotal', selectedOrder?.id],
    queryFn: () => selectedOrder ? ordersApi.getTotal(selectedOrder.id) : null,
    enabled: !!selectedOrder && isViewModalOpen,
  });

  const { data: menuItemsMap } = useQuery<Record<number, { name: string; price: number }>>({
    queryKey: ['menuItemsForOrder', orderDetails?.items?.map((i: OrderItem) => i.menu_item_id)],
    queryFn: async () => {
      if (!orderDetails?.items) return {};
      const map: Record<number, { name: string; price: number }> = {};
      for (const item of orderDetails.items) {
        try { map[item.menu_item_id] = await menuApi.getItem(item.menu_item_id); } catch {}
      }
      return map;
    },
    enabled: !!orderDetails?.items,
  });

  const createOrderMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (createdOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setIsNewOrderModalOpen(false);
      setNewOrder({ table_id: 1, status: 'pending', ayce_order: false, items: [] });
      navigate(`/orders/${createdOrder.id}/edit`);
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: number) => ordersApi.delete(orderId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); setIsDeleteModalOpen(false); setSelectedOrder(null); },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) => ordersApi.update(orderId, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); },
  });

  const handleStatusChange = (orderId: number, newStatus: string) => updateStatusMutation.mutate({ orderId, status: newStatus });
  const handleViewOrder = (order: Order) => { setSelectedOrder(order); setIsViewModalOpen(true); };
  const handleDeleteClick = (order: Order) => { setSelectedOrder(order); setIsDeleteModalOpen(true); };
  const handleConfirmDelete = () => { if (selectedOrder) deleteOrderMutation.mutate(selectedOrder.id); };
  const handleCreateOrder = async () => { try { await createOrderMutation.mutateAsync(newOrder); } catch {} };

  return (
    <div className="px-8 py-8 space-y-10 max-w-7xl mx-auto w-full">

      {/* ── Page header ── */}
      <section className="flex justify-between items-end">
        <div>
          <h2 className="text-5xl font-headline text-on-surface leading-none mb-2">Orders</h2>
          <p className="text-sm text-on-surface-variant">Manage live orders and service status</p>
        </div>
        <button onClick={() => setIsNewOrderModalOpen(true)} className="btn-primary">
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Order
        </button>
      </section>

      {/* ── Orders card grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {ordersError ? (
          <div className="col-span-3 flex items-center justify-center h-40">
            <div className="text-center space-y-2">
              <span className="material-symbols-outlined text-[40px] text-error">error</span>
              <p className="text-sm text-on-surface-variant">Error loading orders.</p>
            </div>
          </div>
        ) : ordersLoading ? (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-surface-container-lowest dark:bg-sumi-800 rounded border border-outline-variant/20 dark:border-sumi-700 p-6 animate-pulse">
                <div className="h-4 w-16 bg-surface-container rounded mb-6" />
                <div className="space-y-3 mb-6">
                  <div className="h-4 w-full bg-surface-container rounded" />
                  <div className="h-4 w-3/4 bg-surface-container rounded" />
                  <div className="h-7 w-1/2 bg-surface-container rounded" />
                </div>
                <div className="h-8 w-full bg-surface-container rounded" />
              </div>
            ))}
          </>
        ) : orders.map((order) => (
          <div key={order.id} className="bg-surface-container-lowest dark:bg-sumi-800 rounded border border-outline-variant/20 dark:border-sumi-700 p-6 card-shadow group transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 block">Order ID</span>
                <h3 className="text-xl font-headline font-bold text-on-surface">#{order.id}</h3>
              </div>
              {order.ayce_order && (
                <span className="px-2 py-1 bg-tertiary/10 text-tertiary text-[10px] font-bold uppercase tracking-wider rounded">AYCE</span>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-on-surface-variant">Table</span>
                <span className="font-bold text-lg text-on-surface">{order.table_id}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-on-surface-variant">Status</span>
                <StatusDropdown
                  currentStatus={order.status}
                  orderId={order.id}
                  onStatusChange={handleStatusChange}
                  isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.orderId === order.id}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant text-sm">Total</span>
                <span className="text-xl font-headline font-bold text-primary">${formatTotal(order.total_amount)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10 dark:border-sumi-700">
              <div className="flex gap-1">
                <button onClick={() => handleViewOrder(order)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="View">
                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                </button>
                <button onClick={() => navigate(`/orders/${order.id}/edit`)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="Edit">
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              </div>
              <button onClick={() => handleDeleteClick(order)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors" title="Delete">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>
        ))}

        {/* Empty-state add card */}
        <button onClick={() => setIsNewOrderModalOpen(true)} className="border-2 border-dashed border-outline-variant/30 rounded p-6 flex flex-col items-center justify-center text-on-surface-variant/40 hover:border-primary/40 hover:text-primary transition-all group min-h-[260px]">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-current flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-2xl">add_circle</span>
          </div>
          <span className="text-xs uppercase tracking-[0.2em] font-bold">Initiate Order</span>
        </button>
      </div>

      {/* ── New Order Modal ── */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl w-full max-w-md max-h-[90vh] flex flex-col border border-outline-variant/20 dark:border-sumi-700 shadow-2xl">
            <div className="flex justify-between items-center p-6 pb-0 mb-6">
              <h2 className="text-2xl font-headline text-on-surface">Create New Order</h2>
              <button onClick={() => setIsNewOrderModalOpen(false)} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="space-y-4 px-6 overflow-y-auto">
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Table Number</label>
                <input type="number" value={newOrder.table_id} onChange={(e) => setNewOrder({ ...newOrder, table_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={newOrder.ayce_order} onChange={(e) => setNewOrder({ ...newOrder, ayce_order: e.target.checked })}
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                <span className="text-sm text-on-surface font-medium">All You Can Eat Order</span>
              </label>
              {newOrder.ayce_order && settings && (
                <div className="p-4 bg-primary/5 rounded border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">Current AYCE Price</p>
                      <p className="text-xs text-on-surface-variant">{settings.current_meal_period.toLowerCase()} period</p>
                    </div>
                    <span className="text-xl font-headline font-bold text-primary">
                      ${settings.current_meal_period === 'LUNCH' ? formatPrice(settings.ayce_lunch_price) : formatPrice(settings.ayce_dinner_price)}
                    </span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Notes</label>
                <textarea value={newOrder.notes || ''} onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
            </div>
            <div className="p-6 pt-4 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsNewOrderModalOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreateOrder} className="btn-primary">Create Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Order Modal ── */}
      {isViewModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-6 w-full max-w-2xl border border-outline-variant/20 dark:border-sumi-700 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-headline text-on-surface">Order #{selectedOrder.id}</h2>
              <button onClick={() => { setIsViewModalOpen(false); setSelectedOrder(null); }} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
            </div>

            {detailsLoading || totalLoading ? (
              <div className="flex justify-center py-8">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant animate-spin">progress_activity</span>
              </div>
            ) : detailsError ? (
              <div className="p-4 bg-error/5 text-error rounded">Error loading order details.</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Status</p>
                    <p className="font-medium text-on-surface">{selectedOrder.status}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Table</p>
                    <p className="font-medium text-on-surface">#{selectedOrder.table_id}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">All You Can Eat</p>
                  <p className="font-medium text-on-surface">{selectedOrder.ayce_order ? 'Yes' : 'No'}</p>
                </div>

                {orderDetails?.items && orderDetails.items.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Items</p>
                    <div className="space-y-2">
                      {orderDetails.items.map((item: OrderItem) => {
                        const mi = menuItemsMap?.[item.menu_item_id];
                        const itemTotal = mi ? item.quantity * mi.price : 0;
                        return (
                          <div key={item.id} className="flex justify-between items-start py-2 border-b border-outline-variant/5 last:border-0">
                            <div>
                              <p className="font-medium text-on-surface text-sm">{mi?.name || 'Unknown item'}</p>
                              <p className="text-xs text-on-surface-variant">Qty: {item.quantity}</p>
                            </div>
                            <p className="text-sm font-semibold text-on-surface">${formatTotal(itemTotal)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedOrder.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1">Notes</p>
                    <p className="font-medium text-on-surface text-sm">{selectedOrder.notes}</p>
                  </div>
                )}

                {orderTotal && (
                  <div className="border-t border-outline-variant/10 pt-4">
                    {Number(orderTotal.leftover_charge_amount ?? 0) > 0 && (
                      <div className="flex justify-between text-sm mb-1">
                        <p className="text-on-surface-variant">Leftover / Waste Charge</p>
                        <p className="text-on-surface">${formatTotal(orderTotal.leftover_charge_amount)}</p>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg">
                      <p className="text-on-surface">Total</p>
                      <p className="text-primary font-headline">${formatTotal(orderTotal.total)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {isDeleteModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-6 w-full max-w-md border border-outline-variant/20 dark:border-sumi-700 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-headline text-on-surface">Delete Order</h2>
              <button onClick={() => { setIsDeleteModalOpen(false); setSelectedOrder(null); }} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
            </div>
            <p className="text-on-surface-variant text-sm mb-6">Are you sure you want to delete Order #{selectedOrder.id}? This action cannot be undone.</p>
            {deleteOrderMutation.isError && (
              <div className="p-3 bg-error/5 text-error rounded mb-4 text-sm">Failed to delete order. Please try again.</div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setIsDeleteModalOpen(false); setSelectedOrder(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleConfirmDelete} disabled={deleteOrderMutation.isPending}
                className="px-5 py-2.5 bg-error text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all">
                {deleteOrderMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
