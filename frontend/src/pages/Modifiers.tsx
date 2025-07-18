import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, X, AlertCircle, Loader2 } from 'lucide-react';
import { menuApi, categoriesApi } from '../services/api';

interface Modifier {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number | null;
  display_order: number;
}

interface Category {
  id: number;
  name: string;
}

const ITEMS_PER_PAGE = 12;

const Modifiers = () => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedModifier, setSelectedModifier] = useState<Modifier | null>(null);
  const [newModifier, setNewModifier] = useState({
    name: '',
    description: '',
    price: 0,
    category_id: null as number | null,
    display_order: 0
  });
  const [editModifierData, setEditModifierData] = useState<Partial<Modifier>>({});
  const queryClient = useQueryClient();

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll
  });

  // Fetch modifiers with pagination and filtering
  const { data: modifiers = [], isLoading: modifiersLoading } = useQuery<Modifier[]>({
    queryKey: ['modifiers', currentPage, selectedCategory],
    queryFn: async () => {
      const response = await menuApi.getModifiers({
        skip: currentPage * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
        category_id: selectedCategory
      });
      console.log('Modifiers response:', response);
      return response;
    }
  });

  // Add logging for the modifiers data
  console.log('Current modifiers:', modifiers);
  console.log('Loading state:', modifiersLoading);

  // Create modifier mutation
  const createModifierMutation = useMutation({
    mutationFn: (data: Omit<Modifier, 'id'>) => menuApi.createModifier(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifiers'] });
      setIsCreateModalOpen(false);
      setNewModifier({
        name: '',
        description: '',
        price: 0,
        category_id: null,
        display_order: 0
      });
    },
    onError: (error) => {
      console.error('Failed to create modifier:', error);
      // You can add error handling UI here if needed
    }
  });

  // Update modifier mutation
  const updateModifierMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Modifier> }) => 
      menuApi.updateModifier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifiers'] });
      setIsEditModalOpen(false);
      setSelectedModifier(null);
      setEditModifierData({});
    },
    onError: (error) => {
      console.error('Failed to update modifier:', error);
      // You can add error handling UI here if needed
    }
  });

  // Delete modifier mutation
  const deleteModifierMutation = useMutation({
    mutationFn: (id: number) => menuApi.deleteModifier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifiers'] });
      setIsDeleteModalOpen(false);
      setSelectedModifier(null);
    },
    onError: (error) => {
      console.error('Failed to delete modifier:', error);
    }
  });

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategory(categoryId);
    setCurrentPage(0);
  };

  const handleCreateModifier = () => {
    createModifierMutation.mutate(newModifier);
  };

  const handleEditModifier = (modifier: Modifier) => {
    setSelectedModifier(modifier);
    setEditModifierData({});
    setIsEditModalOpen(true);
  };

  const handleUpdateModifier = () => {
    if (selectedModifier) {
      // Only include fields that were actually changed
      const changedFields: Partial<Modifier> = {};
      Object.entries(editModifierData).forEach(([key, value]) => {
        if (value !== selectedModifier[key as keyof Modifier]) {
          changedFields[key as keyof Modifier] = value;
        }
      });

      if (Object.keys(changedFields).length > 0) {
        updateModifierMutation.mutate({
          id: selectedModifier.id,
          data: changedFields
        });
      } else {
        // No changes were made, just close the modal
        setIsEditModalOpen(false);
        setSelectedModifier(null);
        setEditModifierData({});
      }
    }
  };

  const handleDeleteClick = (modifier: Modifier) => {
    setSelectedModifier(modifier);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedModifier) {
      deleteModifierMutation.mutate(selectedModifier.id);
    }
  };

  if (categoriesLoading || modifiersLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Modifiers</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Modifier
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        <button
          onClick={() => handleCategorySelect(null)}
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
            onClick={() => handleCategorySelect(category.id)}
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

      {/* Modifiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modifiers.map((modifier) => (
          <div
            key={modifier.id}
            className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-md dark:hover:shadow-lg transition-all border dark:border-gray-700"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {modifier.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {modifier.description}
                </p>
              </div>
              <span className="text-lg font-medium text-gray-900 dark:text-white">
                ${modifier.price.toFixed(2)}
              </span>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => handleEditModifier(modifier)}
                className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleDeleteClick(modifier)}
                className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center space-x-2">
        <button
          onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
          disabled={currentPage === 0}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => setCurrentPage(prev => prev + 1)}
          disabled={modifiers.length < ITEMS_PER_PAGE}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          Next
        </button>
      </div>

      {/* Create Modifier Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">New Modifier</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                <input
                  type="text"
                  value={newModifier.name}
                  onChange={(e) => setNewModifier({ ...newModifier, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  value={newModifier.description}
                  onChange={(e) => setNewModifier({ ...newModifier, description: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={newModifier.price}
                  onChange={(e) => setNewModifier({ ...newModifier, price: parseFloat(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                <select
                  value={newModifier.category_id || ''}
                  onChange={(e) => setNewModifier({ ...newModifier, category_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Display Order</label>
                <input
                  type="number"
                  value={newModifier.display_order}
                  onChange={(e) => setNewModifier({ ...newModifier, display_order: parseInt(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateModifier}
                disabled={createModifierMutation.isPending}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {createModifierMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modifier Modal */}
      {isEditModalOpen && selectedModifier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Edit Modifier</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedModifier(null);
                  setEditModifierData({});
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
                <input
                  type="text"
                  value={editModifierData.name ?? selectedModifier.name}
                  onChange={(e) => setEditModifierData({ ...editModifierData, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  value={editModifierData.description ?? selectedModifier.description}
                  onChange={(e) => setEditModifierData({ ...editModifierData, description: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={editModifierData.price ?? selectedModifier.price}
                  onChange={(e) => setEditModifierData({ ...editModifierData, price: parseFloat(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                <select
                  value={editModifierData.category_id ?? selectedModifier.category_id ?? ''}
                  onChange={(e) => setEditModifierData({ ...editModifierData, category_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Display Order</label>
                <input
                  type="number"
                  value={editModifierData.display_order ?? selectedModifier.display_order}
                  onChange={(e) => setEditModifierData({ ...editModifierData, display_order: parseInt(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedModifier(null);
                  setEditModifierData({});
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateModifier}
                disabled={updateModifierMutation.isPending}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {updateModifierMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedModifier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md border dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Modifier</h2>
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedModifier(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "{selectedModifier.name}"? This action cannot be undone.
            </p>
            {deleteModifierMutation.isError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                Failed to delete modifier. Please try again.
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedModifier(null);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteModifierMutation.isPending}
                className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleteModifierMutation.isPending ? (
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

export default Modifiers; 