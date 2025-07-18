import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, X, Loader2, AlertCircle, DollarSign, Clock } from 'lucide-react';
import { menuApi, ordersApi, categoriesApi } from '../services/api';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import ConfirmationModal from '../components/ConfirmationModal';

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
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
  subtotal: number;
  discount_amount: number;
  total: number;
}

const EditOrder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const { mealPeriod, isDinner, isLunch } = useMealPeriod();

  // Helper function to check if an item is available during current meal period
  const isItemAvailable = (item: MenuItem): boolean => {
    if (!item.meal_period || item.meal_period === 'BOTH') {
      return item.is_available;
    }
    
    if (isLunch && item.meal_period === 'DINNER') {
      return false; // Dinner-only items are not available during lunch
    }
    
    return item.is_available;
  };

  // Helper function to get availability message
  const getAvailabilityMessage = (item: MenuItem): string | null => {
    if (!item.meal_period || item.meal_period === 'BOTH') {
      return null;
    }
    
    if (isLunch && item.meal_period === 'DINNER') {
      return 'Only available during dinner';
    }
    
    return null;
  };

  // Helper function to get meal period tag
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

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getById(Number(id)),
  });

  // Fetch order total
  const { data: orderTotal, isLoading: totalLoading } = useQuery<OrderTotal>({
    queryKey: ['orderTotal', id],
    queryFn: () => ordersApi.getTotal(Number(id)),
    enabled: !!id,
  });

  // Fetch menu items
  const { data: menuItems = [], isLoading: menuItemsLoading } = useQuery<MenuItem[]>({
    queryKey: ['menuItems', selectedCategory],
    queryFn: () => menuApi.getItems({ category_id: selectedCategory || undefined }),
  });

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  // Fetch detailed menu items for the order
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

  // Fetch menu item details for the selected item
  const { data: selectedMenuItem } = useQuery({
    queryKey: ['menuItem', selectedItem?.menu_item_id],
    queryFn: () => selectedItem ? menuApi.getItem(selectedItem.menu_item_id) : null,
    enabled: !!selectedItem,
  });

  // Toggle AYCE mutation
  const toggleAYCEMutation = useMutation({
    mutationFn: (ayce_order: boolean) => 
      ordersApi.update(Number(id), { ayce_order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
    },
  });

  // Add item mutation
  const addItemMutation = useMutation({
    mutationFn: (menu_item_id: number) => 
      ordersApi.addItem(Number(id), { items: [{ menu_item_id, quantity: 1 }] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: (item_id: number) => 
      ordersApi.deleteItem(Number(id), item_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orderTotal', id] });
    },
    onError: (error) => {
      console.error('Error deleting item:', error);
      // You might want to show a toast notification here
    },
  });

  const handleToggleAYCE = () => {
    if (order) {
      toggleAYCEMutation.mutate(!order.ayce_order);
    }
  };

  const handleAddItem = (item: MenuItem) => {
    // Check if item is available during current meal period
    if (!isItemAvailable(item)) {
      return; // Don't add unavailable items
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

  if (orderLoading || menuItemsLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          Order not found
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Main Section - Add New Items */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item) => {
            const available = isItemAvailable(item);
            const availabilityMessage = getAvailabilityMessage(item);
            const mealPeriodTag = getMealPeriodTag(item);
            
            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-md dark:hover:shadow-lg transition-all border dark:border-gray-700 ${
                  !available ? 'opacity-60' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-lg font-semibold ${available ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                        {item.name}
                      </h3>
                      {mealPeriodTag && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          !available 
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                            : item.meal_period === 'LUNCH'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                        }`}>
                          {!available && <Clock className="w-3 h-3 mr-1" />}
                          {mealPeriodTag}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${available ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {item.description}
                    </p>
                    {availabilityMessage && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 italic">
                        {availabilityMessage}
                      </p>
                    )}
                  </div>
                  <span className={`text-lg font-medium ${available ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    ${item.price.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={() => handleAddItem(item)}
                  disabled={!available}
                  className={`w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md transition-colors ${
                    available
                      ? 'text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
                      : 'text-gray-400 bg-gray-200 dark:bg-gray-600 cursor-not-allowed'
                  }`}
                  title={!available ? availabilityMessage || 'Not available' : ''}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {available ? 'Add to Order' : 'Unavailable'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Sidebar - Current Order */}
      <div className="w-1/3 bg-white dark:bg-gray-800 p-6 overflow-y-auto border-l border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Order #{order.id}</h2>
          <button
            onClick={() => navigate('/orders')}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={order.ayce_order}
              onChange={handleToggleAYCE}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">All You Can Eat Order</span>
          </label>
        </div>

        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Current Items</h3>
          {order.items?.map((item) => {
            const menuItem = orderMenuItems[item.menu_item_id];
            const itemName = menuItem?.name || item.name || 'Unknown item';
            const itemPrice = Number(menuItem?.price ?? item.price ?? 0);
            
            return (
              <div
                key={item.id}
                className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{itemName}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ${itemPrice.toFixed(2)} × {item.quantity}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteClick(item)}
                  className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>

        {totalLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-2 border-t border-gray-200 dark:border-gray-600 pt-4">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Subtotal</span>
              <span>${Number(orderTotal?.subtotal ?? 0).toFixed(2)}</span>
            </div>
            {Number(orderTotal?.discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>Discount</span>
                <span>-${Number(orderTotal?.discount_amount ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg text-gray-900 dark:text-white">
              <span>Total</span>
              <span>${Number(orderTotal?.total ?? 0).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
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
    </div>
  );
};

export default EditOrder; 