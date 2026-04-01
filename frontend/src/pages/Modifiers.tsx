import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuApi, categoriesApi } from '../services/api';
import AppModal from '../components/AppModal';

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

const inputClass = "w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm";
const labelClass = "block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5";

const Modifiers = () => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedModifier, setSelectedModifier] = useState<Modifier | null>(null);
  const [newModifier, setNewModifier] = useState({ name: '', description: '', price: 0, category_id: null as number | null, display_order: 0 });
  const [editModifierData, setEditModifierData] = useState<Partial<Modifier>>({});
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: categoriesApi.getAll });

  const { data: modifiers = [], isLoading: modifiersLoading } = useQuery<Modifier[]>({
    queryKey: ['modifiers', currentPage, selectedCategory],
    queryFn: async () => {
      const response = await menuApi.getModifiers({ skip: currentPage * ITEMS_PER_PAGE, limit: ITEMS_PER_PAGE, category_id: selectedCategory ?? undefined });
      return response;
    }
  });


  const createModifierMutation = useMutation({
    mutationFn: (data: Omit<Modifier, 'id'>) => menuApi.createModifier(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modifiers'] });
      setIsCreateModalOpen(false);
      setNewModifier({ name: '', description: '', price: 0, category_id: null, display_order: 0 });
    },
  });

  const updateModifierMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Modifier> }) => menuApi.updateModifier(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['modifiers'] }); setIsEditModalOpen(false); setSelectedModifier(null); setEditModifierData({}); },
  });

  const deleteModifierMutation = useMutation({
    mutationFn: (id: number) => menuApi.deleteModifier(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['modifiers'] }); setIsDeleteModalOpen(false); setSelectedModifier(null); },
  });

  const handleEditModifier = (modifier: Modifier) => { setSelectedModifier(modifier); setEditModifierData({}); setIsEditModalOpen(true); };

  const handleUpdateModifier = () => {
    if (!selectedModifier) return;
    const changed: Partial<Modifier> = {};
    Object.entries(editModifierData).forEach(([k, v]) => { if (v !== selectedModifier[k as keyof Modifier]) (changed as any)[k] = v; });
    if (Object.keys(changed).length > 0) updateModifierMutation.mutate({ id: selectedModifier.id, data: changed });
    else setIsEditModalOpen(false);
  };

  return (
    <div className="px-8 py-8 space-y-10 max-w-7xl mx-auto w-full">

      {/* ── Page header ── */}
      <section className="flex justify-between items-end">
        <div>
          <h2 className="text-5xl font-headline text-on-surface leading-none mb-2">Modifiers</h2>
          <p className="text-sm text-on-surface-variant">Manage add-ons and customization options</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Modifier
        </button>
      </section>

      {/* ── Category filter pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => { setSelectedCategory(null); setCurrentPage(0); }}
          className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === null ? 'bg-primary text-white' : 'bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'}`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategory(cat.id); setCurrentPage(0); }}
            className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.id ? 'bg-primary text-white' : 'bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* ── Modifiers grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modifiersLoading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-5 border border-outline-variant/10 dark:border-sumi-700 animate-pulse">
                <div className="flex justify-between mb-2">
                  <div className="h-4 w-28 bg-surface-container rounded" />
                  <div className="h-4 w-12 bg-surface-container rounded" />
                </div>
                <div className="h-3 w-full bg-surface-container rounded mb-1" />
                <div className="h-3 w-2/3 bg-surface-container rounded" />
              </div>
            ))}
          </>
        ) : modifiers.map((modifier) => (
          <div key={modifier.id} className="bg-surface-container-lowest dark:bg-sumi-800 rounded-xl p-5 border border-outline-variant/10 dark:border-sumi-700 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-outline-variant/20">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-base font-bold text-on-surface">{modifier.name}</h3>
              <span className="text-xl font-headline text-primary">
                ${typeof modifier.price === 'number' ? modifier.price.toFixed(2) : parseFloat(String(modifier.price)).toFixed(2)}
              </span>
            </div>
            {modifier.description && (
              <p className="text-on-surface-variant text-xs leading-relaxed mb-3">{modifier.description}</p>
            )}
            <div className="flex justify-end gap-1 pt-3 border-t border-outline-variant/10">
              <button onClick={() => handleEditModifier(modifier)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
              <button onClick={() => { setSelectedModifier(modifier); setIsDeleteModalOpen(true); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pagination ── */}
      <footer className="pt-8 border-t border-outline-variant/10 flex items-center justify-between">
        <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
          className={`flex items-center gap-2 px-5 py-2 text-sm transition-colors ${currentPage === 0 ? 'text-on-surface-variant/30 cursor-not-allowed' : 'text-on-surface-variant hover:text-primary'}`}>
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Previous
        </button>
        <span className="text-sm text-on-surface-variant font-medium">Page <span className="text-primary font-bold">{currentPage + 1}</span></span>
        <button onClick={() => setCurrentPage(p => p + 1)} disabled={modifiers.length < ITEMS_PER_PAGE}
          className={`flex items-center gap-2 px-5 py-2 text-sm transition-colors ${modifiers.length < ITEMS_PER_PAGE ? 'text-on-surface-variant/30 cursor-not-allowed' : 'text-on-surface-variant hover:text-primary'}`}>
          Next
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </footer>

      {/* ── Create Modal ── */}
      {isCreateModalOpen && (
        <AppModal
          title="New Modifier"
          onClose={() => setIsCreateModalOpen(false)}
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsCreateModalOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => createModifierMutation.mutate(newModifier)} disabled={createModifierMutation.isPending} className="btn-primary disabled:opacity-50">
                {createModifierMutation.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}
        >
              <div><label className={labelClass}>Name</label><input type="text" value={newModifier.name} onChange={(e) => setNewModifier({ ...newModifier, name: e.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>Description</label><textarea value={newModifier.description} onChange={(e) => setNewModifier({ ...newModifier, description: e.target.value })} rows={3} className={inputClass} /></div>
              <div><label className={labelClass}>Price</label><input type="number" step="0.01" value={newModifier.price} onChange={(e) => setNewModifier({ ...newModifier, price: parseFloat(e.target.value) })} className={inputClass} /></div>
              <div>
                <label className={labelClass}>Category</label>
                <select value={newModifier.category_id || ''} onChange={(e) => setNewModifier({ ...newModifier, category_id: e.target.value ? parseInt(e.target.value) : null })} className={inputClass}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Display Order</label><input type="number" value={newModifier.display_order} onChange={(e) => setNewModifier({ ...newModifier, display_order: parseInt(e.target.value) })} className={inputClass} /></div>
        </AppModal>
      )}

      {/* ── Edit Modal ── */}
      {isEditModalOpen && selectedModifier && (
        <AppModal
          title="Edit Modifier"
          onClose={() => { setIsEditModalOpen(false); setSelectedModifier(null); setEditModifierData({}); }}
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => { setIsEditModalOpen(false); setSelectedModifier(null); setEditModifierData({}); }} className="btn-secondary">Cancel</button>
              <button onClick={handleUpdateModifier} disabled={updateModifierMutation.isPending} className="btn-primary disabled:opacity-50">
                {updateModifierMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        >
              <div><label className={labelClass}>Name</label><input type="text" value={editModifierData.name ?? selectedModifier.name} onChange={(e) => setEditModifierData({ ...editModifierData, name: e.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>Description</label><textarea value={editModifierData.description ?? selectedModifier.description} onChange={(e) => setEditModifierData({ ...editModifierData, description: e.target.value })} rows={3} className={inputClass} /></div>
              <div><label className={labelClass}>Price</label><input type="number" step="0.01" value={editModifierData.price ?? selectedModifier.price} onChange={(e) => setEditModifierData({ ...editModifierData, price: parseFloat(e.target.value) })} className={inputClass} /></div>
              <div>
                <label className={labelClass}>Category</label>
                <select value={editModifierData.category_id ?? selectedModifier.category_id ?? ''} onChange={(e) => setEditModifierData({ ...editModifierData, category_id: e.target.value ? parseInt(e.target.value) : null })} className={inputClass}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Display Order</label><input type="number" value={editModifierData.display_order ?? selectedModifier.display_order} onChange={(e) => setEditModifierData({ ...editModifierData, display_order: parseInt(e.target.value) })} className={inputClass} /></div>
        </AppModal>
      )}

      {/* ── Delete Modal ── */}
      {isDeleteModalOpen && selectedModifier && (
        <AppModal
          title="Delete Modifier"
          onClose={() => { setIsDeleteModalOpen(false); setSelectedModifier(null); }}
          footer={(
            <div className="flex justify-end gap-3">
              <button onClick={() => { setIsDeleteModalOpen(false); setSelectedModifier(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => selectedModifier && deleteModifierMutation.mutate(selectedModifier.id)} disabled={deleteModifierMutation.isPending}
                className="px-5 py-2.5 bg-error text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all">
                {deleteModifierMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        >
          <p className="text-on-surface-variant text-sm">Are you sure you want to delete "{selectedModifier.name}"? This action cannot be undone.</p>
          {deleteModifierMutation.isError && (
            <div className="p-3 bg-error/5 text-error rounded text-sm">Failed to delete modifier.</div>
          )}
        </AppModal>
      )}
    </div>
  );
};

export default Modifiers;
