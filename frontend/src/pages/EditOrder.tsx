import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, X, Loader2, AlertCircle, Clock } from 'lucide-react';
import { menuApi, ordersApi, categoriesApi } from '../services/api';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import ConfirmationModal from '../components/ConfirmationModal';

const inputClass =
  'w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm';
const labelClass = 'block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5';

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  ayce_surcharge?: number;
  category_id: number;
  is_available: boolean;
  meal_period?: 'BOTH' | 'LUNCH' | 'DINNER';
}

interface OrderItem {
  id: number;
  menu_item_id: number;
  quantity: number;
  name: string;
  price: number;
}

interface Category {
  id: number;
  name: string;
}

interface OrderTotal {
  subtotal?: number;
  discount_amount?: number;
  total: number;
  ayce_base_total?: number;
  ayce_surcharge_total?: number;
  leftover_charge_amount?: number;
  is_ayce?: boolean;
}

const EditOrder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [leftoverChargeAmountInput, setLeftoverChargeAmountInput] = useState<string>('0.00');
  const [leftoverChargeNoteInput, setLeftoverChargeNoteInput] = useState<string>('');
  const [isRemoveLeftoverModalOpen, setIsRemoveLeftoverModalOpen] = useState(false);
  const { isLunch } = useMealPeriod();

  const isItemAvailable = (item: MenuItem): boolean => {
    if (!item.meal_period || item.meal_period === 'BOTH') {
      return item.is_available;
    }
    if (isLunch && item.meal_period === 'DINNER') {
      return false;
    }
    return item.is_available;
  };

  const getAvailabilityMessage = (item: MenuItem): string | null => {
    if (!item.meal_period || item.meal_period === 'BOTH') {
      return null;
    }
    if (isLunch && item.meal_period === 'DINNER') {
      return 'Only available during dinner';
    }
    return null;
  };

  const getMealPeriodTag = (item: MenuItem): string | null => {
    if (!item.meal_period || item.meal_period === 'BOTH') {
      return null;
    }
    if (item.meal_period === 'LUNCH') {
      return 'Lunch Only';
    }
    if (item.meal_period === 'DINNER') {
      return 'Dinner Only';
    }
    return null;
  };

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getById(Number(id)),
  });

  const { data: orderTotal, isLoading: totalLoading } = useQuery<OrderTotal>({
    queryKey: ['orderTotal', id],
    queryFn: () => ordersApi.getTotal(Number(id)),
    enabled: !!id,
  });

  const { data: menuItems = [], isLoading: menuItemsLoading } = useQuery<MenuItem[]>({
    queryKey: ['menuItems', selectedCategory],
    queryFn: () => menuApi.getItems({ category_id: selectedCategory || undefined }),
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const { data: orderMenuItems = {} } = useQuery({
    queryKey: ['orderMenuItems', order?.items],
    queryFn: async () => {
      if (!order?.items) return {};
      const items: Record<number, MenuItem> = {};
      for (const item of order.items) {
        try {
          const menuItem = await menuApi.getItem(item.menu_item_id);
          items[item.menu_item_id] = menuItem;
        } catch (error) {
          console.error(`Error fetching menu item ${item.menu_item_id}:`, error);
        }
      }
      return items;
    },
    enabled: !!order?.items,
  });

  const { data: selectedMenuItem } = useQuery({
    queryKey: ['menuItem', selectedItem?.menu_item_id],
    queryFn: () => (selectedItem ? menuApi.getItem(selectedItem.menu_item_id) : null),
    enabled: !!selectedItem,
  });

  const toggleAYCEMutation = useMutation({
    mutationFn: (ayce_order: boolean) => ordersApi.update(Number(id), { ayce_order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
    },
  });

  const updateLeftoverChargeMutation = useMutation({
    mutationFn: (payload: { leftover_charge_amount: number; leftover_charge_note?: string | null }) =>
      ordersApi.update(Number(id), payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (menu_item_id: number) => ordersApi.addItem(Number(id), { menu_item_id, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (item_id: number) => ordersApi.deleteItem(Number(id), item_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
    },
    onError: (error) => {
      console.error('Error deleting item:', error);
    },
  });

  const handleToggleAYCE = () => {
    if (order) {
      toggleAYCEMutation.mutate(!order.ayce_order);
    }
  };

  const handleAddItem = (item: MenuItem) => {
    if (!isItemAvailable(item)) {
      return;
    }
    addItemMutation.mutate(item.id);
  };

  const handleDeleteClick = (item: OrderItem) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedItem) {
      deleteItemMutation.mutate(selectedItem.id);
    }
  };

  const handleSaveLeftoverCharge = () => {
    const parsedAmount = parseFloat(leftoverChargeAmountInput || '0');
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return;
    updateLeftoverChargeMutation.mutate({
      leftover_charge_amount: parsedAmount,
      leftover_charge_note: leftoverChargeNoteInput.trim() ? leftoverChargeNoteInput.trim() : null,
    });
  };

  const handleConfirmRemoveLeftoverCharge = () => {
    updateLeftoverChargeMutation.mutate(
      { leftover_charge_amount: 0, leftover_charge_note: null },
      {
        onSuccess: () => {
          setLeftoverChargeAmountInput('0.00');
          setLeftoverChargeNoteInput('');
          setIsRemoveLeftoverModalOpen(false);
        },
      }
    );
  };

  useEffect(() => {
    if (!order) return;
    setLeftoverChargeAmountInput(Number(order.leftover_charge_amount ?? 0).toFixed(2));
    setLeftoverChargeNoteInput(order.leftover_charge_note ?? '');
  }, [order?.id, order?.leftover_charge_amount, order?.leftover_charge_note]);

  if (orderLoading || menuItemsLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="px-8 py-16 flex items-center justify-center">
        <div className="flex items-center gap-3 text-error bg-error/5 border border-error/20 rounded-xl px-6 py-4">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-headline text-on-surface">Order not found</p>
            <p className="text-sm text-on-surface-variant mt-1">This order may have been removed.</p>
            <button type="button" onClick={() => navigate('/orders')} className="btn-primary mt-4 text-xs py-2 px-4">
              Back to Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100dvh-57px)] lg:max-h-[calc(100dvh-57px)] w-full">
      {/* Menu — add items */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto px-4 md:px-8 py-6 lg:py-8">
        <section className="mb-6">
          <h2 className="text-3xl md:text-4xl font-headline text-on-surface tracking-tight leading-none">Edit order</h2>
          <p className="text-on-surface-variant text-sm mt-2">Add items from the menu to this ticket.</p>
        </section>

        <section className="mb-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === null
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high dark:bg-sumi-800 dark:border-sumi-700'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high dark:bg-sumi-800 dark:border-sumi-700'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4 md:gap-6">
          {menuItems.map((item) => {
            const available = isItemAvailable(item);
            const availabilityMessage = getAvailabilityMessage(item);
            const mealPeriodTag = getMealPeriodTag(item);

            return (
              <div
                key={item.id}
                className={`bg-surface-container-lowest dark:bg-sumi-800 rounded-xl border border-outline-variant/10 dark:border-sumi-700 card-shadow transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-outline-variant/20 ${
                  !available ? 'opacity-60' : ''
                }`}
              >
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`text-base font-bold leading-tight ${
                            available ? 'text-on-surface' : 'text-on-surface-variant'
                          }`}
                        >
                          {item.name}
                        </h3>
                        {mealPeriodTag && (
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full shrink-0 ${
                              !available
                                ? 'bg-error/10 text-error'
                                : item.meal_period === 'LUNCH'
                                  ? 'bg-tertiary/10 text-tertiary'
                                  : 'bg-secondary/10 text-secondary'
                            }`}
                          >
                            {!available && <Clock className="w-3 h-3" />}
                            {mealPeriodTag}
                          </span>
                        )}
                      </div>
                      {item.description ? (
                        <p
                          className={`text-xs leading-relaxed line-clamp-2 ${
                            available ? 'text-on-surface-variant' : 'text-on-surface-variant/70'
                          }`}
                        >
                          {item.description}
                        </p>
                      ) : null}
                      {availabilityMessage && (
                        <p className="text-xs text-error/80 italic">{availabilityMessage}</p>
                      )}
                    </div>
                    <span
                      className={`text-xl font-headline shrink-0 sm:text-right ${
                        available ? 'text-primary' : 'text-on-surface-variant'
                      }`}
                    >
                      ${item.price.toFixed(2)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddItem(item)}
                    disabled={!available || addItemMutation.isPending}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded text-sm font-medium transition-all active:scale-[0.98] ${
                      available
                        ? 'btn-primary disabled:opacity-60 disabled:pointer-events-none'
                        : 'bg-surface-container-high text-on-surface-variant cursor-not-allowed opacity-80'
                    }`}
                    title={!available ? availabilityMessage || 'Not available' : undefined}
                  >
                    <Plus className="w-5 h-5" />
                    {available ? 'Add to order' : 'Unavailable'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* Ticket sidebar */}
      <aside className="w-full lg:w-[min(100%,420px)] xl:w-[440px] shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-outline-variant/10 dark:border-sumi-700 bg-surface-container-low dark:bg-sumi-800/80 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface-container-low/95 dark:bg-sumi-800/95 backdrop-blur-sm border-b border-outline-variant/10 dark:border-sumi-700 px-4 md:px-6 py-4">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Ticket</p>
              <h2 className="text-2xl font-headline text-on-surface leading-tight">Order #{order.id}</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 md:px-6 py-5 space-y-8">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={order.ayce_order}
                onChange={handleToggleAYCE}
                disabled={toggleAYCEMutation.isPending}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium text-on-surface">All You Can Eat order</span>
            </label>
          </div>

          <div className="rounded-xl border border-outline-variant/15 dark:border-sumi-600 bg-surface-container-lowest dark:bg-sumi-800 p-4 md:p-5 card-shadow">
            <h3 className="text-sm font-headline text-on-surface mb-1">Leftover / waste charge</h3>
            <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">
              Ticket-level adjustment for uneaten or wasted AYCE food.
            </p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Charge amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={leftoverChargeAmountInput}
                  onChange={(e) => setLeftoverChargeAmountInput(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Note (optional)</label>
                <textarea
                  rows={2}
                  value={leftoverChargeNoteInput}
                  onChange={(e) => setLeftoverChargeNoteInput(e.target.value)}
                  placeholder="e.g. leftover sashimi"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleSaveLeftoverCharge}
                  disabled={updateLeftoverChargeMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {updateLeftoverChargeMutation.isPending ? 'Saving…' : 'Save charge'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRemoveLeftoverModalOpen(true)}
                  disabled={updateLeftoverChargeMutation.isPending || Number(order.leftover_charge_amount ?? 0) <= 0}
                  className="flex-1 px-5 py-2.5 rounded text-sm font-medium border border-error/40 text-error hover:bg-error/5 transition-all disabled:opacity-50"
                >
                  Remove charge
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-3">Current items</h3>
            <div className="space-y-2">
              {order.items?.map((item) => {
                const menuItem = orderMenuItems[item.menu_item_id];
                const itemName = menuItem?.name || item.name || 'Unknown item';
                const itemPrice = Number(menuItem?.price ?? item.price ?? 0);
                const itemAyceSurcharge = Number(menuItem?.ayce_surcharge ?? 0);

                return (
                  <div
                    key={item.id}
                    className="flex justify-between items-center gap-3 p-4 rounded-xl bg-surface-container-lowest dark:bg-sumi-800 border border-outline-variant/10 dark:border-sumi-700"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-on-surface text-sm truncate">{itemName}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        ${itemPrice.toFixed(2)} × {item.quantity}
                      </p>
                      {order.ayce_order && (
                        <p className="text-[11px] text-on-surface-variant/80 mt-1">
                          {itemAyceSurcharge > 0
                            ? `AYCE add-on +$${(itemAyceSurcharge * item.quantity).toFixed(2)}`
                            : 'AYCE included'}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(item)}
                      className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-outline-variant/10 dark:border-sumi-700">
            {totalLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-2">Summary</p>
                {order.ayce_order && (
                  <>
                    <div className="flex justify-between text-sm text-on-surface-variant">
                      <span>AYCE base</span>
                      <span className="text-on-surface tabular-nums">
                        ${Number(orderTotal?.ayce_base_total ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-on-surface-variant">
                      <span>AYCE surcharges</span>
                      <span className="text-on-surface tabular-nums">
                        ${Number(orderTotal?.ayce_surcharge_total ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm text-on-surface-variant">
                  <span>Leftover / waste</span>
                  <span className="text-on-surface tabular-nums">
                    ${Number(orderTotal?.leftover_charge_amount ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-on-surface-variant">
                  <span>Subtotal</span>
                  <span className="text-on-surface font-medium tabular-nums">
                    ${Number(orderTotal?.subtotal ?? 0).toFixed(2)}
                  </span>
                </div>
                {Number(orderTotal?.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-error">
                    <span>Discount</span>
                    <span className="tabular-nums">-${Number(orderTotal?.discount_amount ?? 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-outline-variant/10 dark:border-sumi-700">
                  <span className="font-headline text-on-surface">Total</span>
                  <span className="text-2xl font-headline text-primary tabular-nums">
                    ${Number(orderTotal?.total ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedItem(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Item"
        message={`Are you sure you want to remove "${selectedMenuItem?.name || selectedItem?.name || 'this item'}" from the order?`}
        confirmText="Delete"
        isPending={deleteItemMutation.isPending}
        error={deleteItemMutation.isError ? 'Failed to delete item. Please try again.' : undefined}
      />
      <ConfirmationModal
        isOpen={isRemoveLeftoverModalOpen}
        onClose={() => setIsRemoveLeftoverModalOpen(false)}
        onConfirm={handleConfirmRemoveLeftoverCharge}
        title="Remove Leftover Charge"
        message="Are you sure you want to remove the leftover/waste charge from this ticket?"
        confirmText="Remove"
        isPending={updateLeftoverChargeMutation.isPending}
      />
    </div>
  );
};

export default EditOrder;
