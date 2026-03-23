import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuApi, menuItemImagesApi, categoriesApi, MenuItem, Category, MenuItemImage } from '../services/api';
import { useMealPeriod } from '../contexts/MealPeriodContext';

const IMAGE_BASE = 'http://localhost:8000';

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
    meal_period: 'BOTH' as 'BOTH' | 'LUNCH' | 'DINNER',
  });
  const [newItemImageFile, setNewItemImageFile] = useState<File | null>(null);
  const [newItemImagePreview, setNewItemImagePreview] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const newImageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // user photo gallery
  const [galleryItem, setGalleryItem] = useState<MenuItem | null>(null);
  const [confirmDeleteUserImageId, setConfirmDeleteUserImageId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { isLunch } = useMealPeriod();

  const isItemAvailable = (item: MenuItem): boolean => {
    if (!item.meal_period || item.meal_period === 'BOTH') return item.is_available;
    if (isLunch && item.meal_period === 'DINNER') return false;
    return item.is_available;
  };

  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll,
  });

  const { data: menuItems, isLoading: itemsLoading, error: itemsError } = useQuery<MenuItem[]>({
    queryKey: ['menuItems', selectedCategory, currentPage],
    queryFn: () => menuApi.getItems({ skip: currentPage * ITEMS_PER_PAGE, limit: ITEMS_PER_PAGE, category_id: selectedCategory || undefined }),
  });

  const deleteImageMutation = useMutation({
    mutationFn: (id: number) => menuApi.deleteImage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menuItems'] }),
  });

  const createItemMutation = useMutation({
    mutationFn: menuApi.createItem,
    onSuccess: async (newItem) => {
      if (newItemImageFile) {
        await menuApi.uploadImage(newItem.id, newItemImageFile);
      }
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setIsAddItemModalOpen(false);
      setNewItemData({ name: '', description: '', price: '', category_id: '', meal_period: 'BOTH' });
      setNewItemImageFile(null);
      setNewItemImagePreview(null);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MenuItem> }) => menuApi.updateItem(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menuItems'] }); setIsEditItemModalOpen(false); setSelectedItem(null); setEditItemData({}); },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => menuApi.deleteItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menuItems'] }); setIsDeleteModalOpen(false); setSelectedItem(null); },
  });

  const { data: galleryImages = [] } = useQuery<MenuItemImage[]>({
    queryKey: ['user-images', galleryItem?.id],
    queryFn: () => menuItemImagesApi.getImages(galleryItem!.id),
    enabled: !!galleryItem,
    staleTime: 30 * 1000,
  });

  const deleteUserImageMutation = useMutation({
    mutationFn: (imageId: number) => menuItemImagesApi.deleteImage(imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-images', galleryItem?.id] });
      queryClient.invalidateQueries({ queryKey: ['reported-images'] });
      setConfirmDeleteUserImageId(null);
    },
  });

  const handleCreateItem = () => {
    if (!newItemData.name || !newItemData.price || !newItemData.category_id) return;
    createItemMutation.mutate({
      name: newItemData.name,
      description: newItemData.description,
      price: parseFloat(newItemData.price),
      category_id: parseInt(newItemData.category_id),
      meal_period: newItemData.meal_period,
    });
  };

  const handleEditItem = (item: MenuItem) => {
    setSelectedItem(item);
    setEditItemData({ name: item.name, description: item.description, price: item.price, category_id: item.category_id, is_available: item.is_available, meal_period: item.meal_period });
    setEditImageFile(null);
    setEditImagePreview(item.image_url ? `${IMAGE_BASE}${item.image_url}` : null);
    setIsEditItemModalOpen(true);
  };

  const handleUpdateItem = async () => {
    if (!selectedItem) return;
    const changed: Partial<MenuItem> = {};
    Object.entries(editItemData).forEach(([k, v]) => { if (v !== selectedItem[k as keyof MenuItem]) (changed as any)[k] = v; });
    if (Object.keys(changed).length > 0) {
      updateItemMutation.mutate({ id: selectedItem.id, data: changed });
    }
    if (editImageFile) {
      await menuApi.uploadImage(selectedItem.id, editImageFile);
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      setEditImageFile(null);
    }
    if (Object.keys(changed).length === 0 && !editImageFile) {
      setIsEditItemModalOpen(false);
    }
  };

  const handlePickNewImage = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (isEdit) {
      setEditImageFile(file);
      setEditImagePreview(url);
    } else {
      setNewItemImageFile(file);
      setNewItemImagePreview(url);
    }
  };

  if (categoriesLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant animate-spin">progress_activity</span>
      </div>
    );
  }

  if (categoriesError || itemsError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <span className="material-symbols-outlined text-[40px] text-error">error</span>
          <p className="text-sm text-on-surface-variant">Error loading menu data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-7xl w-full mx-auto space-y-10">

      {/* ── Page header ── */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-5xl font-headline text-on-surface tracking-tight leading-none">Menu</h2>
          <p className="text-on-surface-variant mt-2 text-sm">Manage your items and categories.</p>
        </div>
        <button onClick={() => setIsAddItemModalOpen(true)} className="btn-primary">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add New Item
        </button>
      </section>

      {/* ── Category filter pills ── */}
      <section>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => { setSelectedCategory(null); setCurrentPage(0); }}
            className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === null
                ? 'bg-primary text-white'
                : 'bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            All
          </button>
          {categories?.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setSelectedCategory(cat.id); setCurrentPage(0); }}
              className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      {/* ── Menu items grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {menuItems?.map((item) => {
          const available = isItemAvailable(item);
          return (
            <div
              key={item.id}
              className={`bg-surface-container-lowest dark:bg-sumi-800 rounded-xl overflow-hidden border border-outline-variant/10 dark:border-sumi-700 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-outline-variant/20 ${!available ? 'opacity-60' : ''}`}
            >
              {/* Item image */}
              {item.image_url ? (
                <div className="w-full h-36 overflow-hidden bg-surface-container">
                  <img
                    src={`${IMAGE_BASE}${item.image_url}`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full h-36 flex items-center justify-center bg-surface-container-low">
                  <span className="material-symbols-outlined text-[40px] text-outline-variant/40">image</span>
                </div>
              )}
              <div className="p-5">
              {/* Header row */}
              <div className="flex justify-between items-start mb-2">
                <h3 className={`text-base font-bold ${available ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                  {item.name}
                </h3>
                <span className={`text-xl font-headline ${available ? 'text-primary' : 'text-on-surface-variant'}`}>
                  ${typeof item.price === 'number' ? item.price.toFixed(2) : parseFloat(String(item.price)).toFixed(2)}
                </span>
              </div>

              {/* Description */}
              <p className="text-on-surface-variant text-xs leading-relaxed mb-3">
                {item.description}
              </p>

              {/* Meal-period badge */}
              {item.meal_period && item.meal_period !== 'BOTH' && (
                <div className="mb-3">
                  {item.meal_period === 'LUNCH' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-tertiary/10 text-tertiary text-[10px] font-bold uppercase tracking-wider rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                      Lunch Only
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary/10 text-secondary text-[10px] font-bold uppercase tracking-wider rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      Dinner Only
                    </span>
                  )}
                </div>
              )}

              {!available && isLunch && item.meal_period === 'DINNER' && (
                <p className="text-xs text-error/70 italic mb-3">Only available during dinner</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-1 pt-3 border-t border-outline-variant/10">
                <button
                  onClick={() => setGalleryItem(item)}
                  title="View customer photos"
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant hover:text-secondary transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">photo_library</span>
                </button>
                <button onClick={() => handleEditItem(item)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button onClick={() => { setSelectedItem(item); setIsDeleteModalOpen(true); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
              </div>{/* end p-5 */}
            </div>
          );
        })}
      </section>

      {/* ── Pagination ── */}
      <footer className="pt-8 border-t border-outline-variant/10 flex items-center justify-between">
        <button
          onClick={() => currentPage > 0 && setCurrentPage(currentPage - 1)}
          disabled={currentPage === 0}
          className={`flex items-center gap-2 px-5 py-2 text-sm transition-colors ${currentPage === 0 ? 'text-on-surface-variant/30 cursor-not-allowed' : 'text-on-surface-variant hover:text-primary'}`}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Previous
        </button>
        <span className="text-sm text-on-surface-variant font-medium">
          Page <span className="text-primary font-bold">{currentPage + 1}</span>
        </span>
        <button
          onClick={() => menuItems && menuItems.length === ITEMS_PER_PAGE && setCurrentPage(currentPage + 1)}
          disabled={!menuItems || menuItems.length < ITEMS_PER_PAGE}
          className={`flex items-center gap-2 px-5 py-2 text-sm transition-colors ${!menuItems || menuItems.length < ITEMS_PER_PAGE ? 'text-on-surface-variant/30 cursor-not-allowed' : 'text-on-surface-variant hover:text-primary'}`}
        >
          Next
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </footer>

      {/* ── Shared modal input/label styles ── */}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-6 w-full max-w-md border border-outline-variant/20 dark:border-sumi-700 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-headline text-on-surface">Delete Item</h2>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-on-surface-variant text-sm mb-6">
              Are you sure you want to delete "{selectedItem.name}" from the menu?
            </p>
            {deleteItemMutation.isError && (
              <div className="mb-4 p-3 bg-error/5 text-error rounded text-sm">Error deleting menu item.</div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => selectedItem && deleteItemMutation.mutate(selectedItem.id)}
                disabled={deleteItemMutation.isPending}
                className="px-5 py-2.5 bg-error text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {deleteItemMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Menu Item Modal */}
      {isEditItemModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-6 w-full max-w-md border border-outline-variant/20 dark:border-sumi-700 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-headline text-on-surface">Edit Item</h2>
              <button onClick={() => setIsEditItemModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Name', key: 'name', type: 'text', value: editItemData.name || '' },
              ].map(({ label, key, type, value }) => (
                <div key={key}>
                  <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">{label}</label>
                  <input type={type} value={value} onChange={(e) => setEditItemData({ ...editItemData, [key]: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Description</label>
                <textarea value={editItemData.description || ''} onChange={(e) => setEditItemData({ ...editItemData, description: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Price</label>
                <input type="number" step="0.01" value={editItemData.price || ''} onChange={(e) => setEditItemData({ ...editItemData, price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Category</label>
                <select value={editItemData.category_id || ''} onChange={(e) => setEditItemData({ ...editItemData, category_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm">
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Meal Period</label>
                <select value={editItemData.meal_period ?? selectedItem?.meal_period ?? 'BOTH'} onChange={(e) => setEditItemData({ ...editItemData, meal_period: e.target.value as any })}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm">
                  <option value="BOTH">Available All Day</option>
                  <option value="LUNCH">Lunch Only</option>
                  <option value="DINNER">Dinner Only</option>
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editItemData.is_available ?? selectedItem?.is_available ?? true} onChange={(e) => setEditItemData({ ...editItemData, is_available: e.target.checked })}
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                <span className="text-sm text-on-surface font-medium">Available</span>
              </label>

              {/* Image upload */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Item Photo</label>
                <input ref={editImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePickNewImage(e, true)} />
                {editImagePreview ? (
                  <div className="relative rounded overflow-hidden mb-2 h-32">
                    <img src={editImagePreview} alt="preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditImageFile(null);
                        setEditImagePreview(null);
                        if (selectedItem?.image_url) deleteImageMutation.mutate(selectedItem.id);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/60 rounded-full text-white hover:bg-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => editImageInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-outline-variant/30 rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">upload</span>
                  {editImagePreview ? 'Change Photo' : 'Upload Photo'}
                </button>
              </div>
            </div>
            {updateItemMutation.isError && (
              <div className="mt-4 p-3 bg-error/5 text-error rounded text-sm">Error updating item.</div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsEditItemModalOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleUpdateItem} disabled={updateItemMutation.isPending} className="btn-primary disabled:opacity-50">
                {updateItemMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Photo Gallery Modal */}
      {galleryItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl w-full max-w-lg border border-outline-variant/20 dark:border-sumi-700 shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/10">
              <div>
                <h2 className="text-xl font-headline text-on-surface">Customer Photos</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">{galleryItem.name} · {galleryImages.length} photo{galleryImages.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => { setGalleryItem(null); setConfirmDeleteUserImageId(null); }} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6">
              {galleryImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/40">
                  <span className="material-symbols-outlined text-[48px] mb-3 opacity-30">photo_library</span>
                  <p className="text-sm">No customer photos yet for this item.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {galleryImages.map(img => (
                    <div key={img.id} className="relative rounded-xl overflow-hidden border border-outline-variant/10 bg-surface-container">
                      <div className="w-full h-32 overflow-hidden">
                        <img
                          src={`${IMAGE_BASE}${img.image_url}`}
                          alt="Customer photo"
                          className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
                        />
                      </div>
                      {/* meta + actions */}
                      <div className="px-2.5 py-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] text-on-surface-variant/50">
                            {new Date(img.uploaded_at).toLocaleDateString()}
                          </span>
                          {img.report_count > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-error font-bold">
                              <span className="material-symbols-outlined text-[12px]">flag</span>
                              {img.report_count}
                            </span>
                          )}
                        </div>
                        {confirmDeleteUserImageId === img.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => setConfirmDeleteUserImageId(null)}
                              className="flex-1 py-1 text-[10px] rounded-lg border border-outline-variant/30 text-on-surface-variant"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => deleteUserImageMutation.mutate(img.id)}
                              disabled={deleteUserImageMutation.isPending}
                              className="flex-1 py-1 text-[10px] rounded-lg bg-error text-on-error font-bold disabled:opacity-50"
                            >
                              {deleteUserImageMutation.isPending ? '…' : 'Delete'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteUserImageId(img.id)}
                            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded-lg border border-error/30 text-error hover:bg-error/5 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[12px]">delete</span>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Menu Item Modal */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-6 w-full max-w-md border border-outline-variant/20 dark:border-sumi-700 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-headline text-on-surface">Add Menu Item</h2>
              <button onClick={() => setIsAddItemModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Name</label>
                <input type="text" value={newItemData.name} onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })} placeholder="Item name"
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Description</label>
                <textarea value={newItemData.description} onChange={(e) => setNewItemData({ ...newItemData, description: e.target.value })} rows={3} placeholder="Description"
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Price</label>
                <input type="number" step="0.01" min="0" value={newItemData.price} onChange={(e) => setNewItemData({ ...newItemData, price: e.target.value })} placeholder="0.00"
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Category</label>
                <select value={newItemData.category_id} onChange={(e) => setNewItemData({ ...newItemData, category_id: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm">
                  <option value="">Select a category</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Meal Period</label>
                <select value={newItemData.meal_period} onChange={(e) => setNewItemData({ ...newItemData, meal_period: e.target.value as any })}
                  className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm">
                  <option value="BOTH">Available All Day</option>
                  <option value="LUNCH">Lunch Only</option>
                  <option value="DINNER">Dinner Only</option>
                </select>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5">Item Photo</label>
                <input ref={newImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePickNewImage(e, false)} />
                {newItemImagePreview && (
                  <div className="relative rounded overflow-hidden mb-2 h-32">
                    <img src={newItemImagePreview} alt="preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setNewItemImageFile(null); setNewItemImagePreview(null); }}
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/60 rounded-full text-white hover:bg-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => newImageInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-outline-variant/30 rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">upload</span>
                  {newItemImagePreview ? 'Change Photo' : 'Upload Photo'}
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setIsAddItemModalOpen(false); setNewItemImageFile(null); setNewItemImagePreview(null); }} className="btn-secondary">Cancel</button>
              <button
                onClick={handleCreateItem}
                disabled={!newItemData.name || !newItemData.price || !newItemData.category_id || createItemMutation.isPending}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createItemMutation.isPending ? 'Creating…' : 'Create Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
