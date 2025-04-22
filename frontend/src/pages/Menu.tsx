import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Edit, Trash2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { menuApi, categoriesApi, MenuItem, Category } from '../services/api';

const ITEMS_PER_PAGE = 12;

export default function Menu() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [editItemData, setEditItemData] = useState<Partial<MenuItem>>({});
  const [newItemData, setNewItemData] = useState({
    name: '',
    description: '',
    price: '',
    category_id: '',
  });

  const queryClient = useQueryClient();

  const { 
    data: categories, 
    isLoading: categoriesLoading,
    error: categoriesError 
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const { 
    data: menuItems, 
    isLoading: itemsLoading,
    error: itemsError 
  } = useQuery<MenuItem[]>({
    queryKey: ['menuItems', selectedCategory, currentPage],
    queryFn: () => menuApi.getItems({
      skip: currentPage * ITEMS_PER_PAGE,
      limit: ITEMS_PER_PAGE,
      category_id: selectedCategory || undefined,
    }),
  });

  const createItemMutation = useMutation({
    mutationFn: menuApi.createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setIsAddItemModalOpen(false);
      setNewItemData({
        name: '',
        description: '',
        price: '',
        category_id: '',
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MenuItem> }) => 
      menuApi.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setIsEditItemModalOpen(false);
      setSelectedItem(null);
      setEditItemData({});
    },
    onError: (error) => {
      console.error('Error updating menu item:', error);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => menuApi.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setIsDeleteModalOpen(false);
      setSelectedItem(null);
    },
    onError: (error) => {
      console.error('Error deleting menu item:', error);
    },
  });

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
    setCurrentPage(0);
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (menuItems && menuItems.length === ITEMS_PER_PAGE) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleCreateItem = () => {
    if (!newItemData.name || !newItemData.price || !newItemData.category_id) return;
    
    createItemMutation.mutate({
      name: newItemData.name,
      description: newItemData.description,
      price: parseFloat(newItemData.price),
      category_id: parseInt(newItemData.category_id),
    });
  };

  const handleEditItem = (item: MenuItem) => {
    setSelectedItem(item);
    setEditItemData({
      name: item.name,
      description: item.description,
      price: item.price,
      category_id: item.category_id,
      is_available: item.is_available,
    });
    setIsEditItemModalOpen(true);
  };

  const handleUpdateItem = () => {
    if (!selectedItem) return;
    
    // Only include fields that have been changed
    const changedFields: Partial<MenuItem> = {};
    Object.entries(editItemData).forEach(([key, value]) => {
      if (value !== selectedItem[key as keyof MenuItem]) {
        changedFields[key as keyof MenuItem] = value;
      }
    });

    if (Object.keys(changedFields).length > 0) {
      updateItemMutation.mutate({
        id: selectedItem.id,
        data: changedFields,
      });
    } else {
      setIsEditItemModalOpen(false);
    }
  };

  const handleDeleteClick = (item: MenuItem) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedItem) {
      deleteItemMutation.mutate(selectedItem.id);
    }
  };

  if (categoriesLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (categoriesError || itemsError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="mt-4 text-red-600">
            Error loading menu data. Please try again later.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {categoriesError?.message || itemsError?.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
        <button
          onClick={() => setIsAddItemModalOpen(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Menu Item
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        <button
          onClick={() => handleCategorySelect(null)}
          className={`px-4 py-2 rounded-lg ${
            selectedCategory === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {categories?.map((category) => (
          <button
            key={category.id}
            onClick={() => handleCategorySelect(category.id)}
            className={`px-4 py-2 rounded-lg ${
              selectedCategory === category.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Menu Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {menuItems?.map((item) => (
          <div
            key={item.id}
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{item.description}</p>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                ${item.price.toFixed(2)}
              </span>
            </div>

            <div className="mt-4 flex justify-end space-x-2">
              <button 
                onClick={() => handleEditItem(item)}
                className="p-2 text-blue-500 hover:text-blue-700"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button 
                onClick={() => handleDeleteClick(item)}
                className="p-2 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      <div className="flex justify-center items-center space-x-4 mt-6">
        <button
          onClick={handlePreviousPage}
          disabled={currentPage === 0}
          className={`flex items-center px-4 py-2 rounded-lg ${
            currentPage === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Previous
        </button>
        <span className="text-gray-600">
          Page {currentPage + 1}
        </span>
        <button
          onClick={handleNextPage}
          disabled={!menuItems || menuItems.length < ITEMS_PER_PAGE}
          className={`flex items-center px-4 py-2 rounded-lg ${
            !menuItems || menuItems.length < ITEMS_PER_PAGE
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Next
          <ChevronRight className="w-5 h-5 ml-1" />
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Delete Menu Item</h2>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{selectedItem.name}" from the menu?
            </p>

            {deleteItemMutation.isError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                Error deleting menu item. Please try again.
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteItemMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteItemMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Menu Item Modal */}
      {isEditItemModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Edit Menu Item</h2>
              <button
                onClick={() => setIsEditItemModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editItemData.name || ''}
                  onChange={(e) => setEditItemData({ ...editItemData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editItemData.description || ''}
                  onChange={(e) => setEditItemData({ ...editItemData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editItemData.price || ''}
                  onChange={(e) => setEditItemData({ ...editItemData, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={editItemData.category_id || ''}
                  onChange={(e) => setEditItemData({ ...editItemData, category_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={editItemData.is_available ?? true}
                  onChange={(e) => setEditItemData({ ...editItemData, is_available: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-700">
                  Available
                </label>
              </div>
            </div>

            {updateItemMutation.isError && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                Error updating menu item. Please try again.
              </div>
            )}

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsEditItemModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateItem}
                disabled={updateItemMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {updateItemMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Menu Item Modal */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Add Menu Item</h2>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newItemData.name}
                  onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter item name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newItemData.description}
                  onChange={(e) => setNewItemData({ ...newItemData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter item description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price
                </label>
                <input
                  type="number"
                  value={newItemData.price}
                  onChange={(e) => setNewItemData({ ...newItemData, price: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter price"
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={newItemData.category_id}
                  onChange={(e) => setNewItemData({ ...newItemData, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a category</option>
                  {categories?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateItem}
                disabled={!newItemData.name || !newItemData.price || !newItemData.category_id || createItemMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createItemMutation.isPending ? 'Creating...' : 'Create Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 