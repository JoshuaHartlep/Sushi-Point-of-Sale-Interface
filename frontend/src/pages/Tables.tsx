import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tablesApi, TableData, TableStatus } from '../services/api';
import ProgressLoader from '../components/ProgressLoader';

const inputClass = "w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm";
const labelClass = "block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5";

const STATUS_META: Record<TableStatus, { label: string; color: string; icon: string }> = {
  available: { label: 'Available', color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', icon: 'check_circle' },
  occupied:  { label: 'Occupied',  color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',       icon: 'person' },
  reserved:  { label: 'Reserved',  color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', icon: 'event' },
  cleaning:  { label: 'Cleaning',  color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',   icon: 'cleaning_services' },
};

const ALL_STATUSES: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning'];

export default function Tables() {
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen]     = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected]         = useState<TableData | null>(null);
  const [createForm, setCreateForm]     = useState({ number: '', capacity: '' });
  const [editForm, setEditForm]         = useState({ number: '', capacity: '' });
  const [error, setError]               = useState('');

  const { data: tables = [], isLoading, isSuccess: tablesSuccess } = useQuery<TableData[]>({
    queryKey: ['tables'],
    queryFn: tablesApi.getAll,
  });

  // ── Progress loader ────────────────────────────────────────────────────────
  const [simProgress, setSimProgress] = useState(0);
  const [showLoader, setShowLoader] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let current = 0;
    intervalRef.current = setInterval(() => {
      current += 1.5;
      if (current >= 50) { setSimProgress(50); if (intervalRef.current) clearInterval(intervalRef.current); }
      else setSimProgress(current);
    }, 45);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const tablesProgress = tablesSuccess ? Math.max(simProgress, 100) : simProgress;

  useEffect(() => {
    if (isLoading || !showLoader) return;
    const fadeTimer = setTimeout(() => setFadeOut(true), 300);
    const hideTimer = setTimeout(() => setShowLoader(false), 650);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, [isLoading, showLoader]);

  const createMutation = useMutation({
    mutationFn: (data: { number: number; capacity: number }) => tablesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsCreateOpen(false);
      setCreateForm({ number: '', capacity: '' });
      setError('');
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Failed to create table'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { number?: number; capacity?: number } }) =>
      tablesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsEditOpen(false);
      setSelected(null);
      setError('');
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Failed to update table'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TableStatus }) =>
      tablesApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tablesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsDeleteOpen(false);
      setSelected(null);
      setError('');
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Failed to delete table'),
  });

  function openEdit(t: TableData) {
    setSelected(t);
    setEditForm({ number: String(t.number), capacity: String(t.capacity) });
    setError('');
    setIsEditOpen(true);
  }

  function openDelete(t: TableData) {
    setSelected(t);
    setError('');
    setIsDeleteOpen(true);
  }

  function handleCreate() {
    const num = parseInt(createForm.number);
    const cap = parseInt(createForm.capacity);
    if (!num || num < 1) { setError('Table number must be a positive integer'); return; }
    if (!cap || cap < 1) { setError('Capacity must be a positive integer'); return; }
    createMutation.mutate({ number: num, capacity: cap });
  }

  function handleEdit() {
    if (!selected) return;
    const num = parseInt(editForm.number);
    const cap = parseInt(editForm.capacity);
    if (!num || num < 1) { setError('Table number must be a positive integer'); return; }
    if (!cap || cap < 1) { setError('Capacity must be a positive integer'); return; }
    updateMutation.mutate({ id: selected.id, data: { number: num, capacity: cap } });
  }

  const statusCounts = tables.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (showLoader) {
    return (
      <div className="transition-opacity duration-300" style={{ opacity: fadeOut ? 0 : 1 }}>
        <ProgressLoader progress={tablesProgress} />
      </div>
    );
  }

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-headline font-bold text-on-surface dark:text-white">Dining Hall</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">{tables.length} table{tables.length !== 1 ? 's' : ''} configured</p>
        </div>
        <button
          onClick={() => { setCreateForm({ number: '', capacity: '' }); setError(''); setIsCreateOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Table
        </button>
      </div>

      {/* Status summary bar */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {ALL_STATUSES.map(s => {
          const meta = STATUS_META[s];
          return (
            <div key={s} className="bg-surface-container dark:bg-sumi-800 rounded-xl px-4 py-3 flex items-center gap-3 border border-outline-variant/10 dark:border-sumi-700">
              <span className={`material-symbols-outlined text-[20px] ${meta.color.split(' ')[0]}`}>{meta.icon}</span>
              <div>
                <p className="text-xs text-on-surface-variant">{meta.label}</p>
                <p className="text-xl font-bold text-on-surface dark:text-white">{statusCounts[s] || 0}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table grid */}
      {tables.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-[48px] mb-3 block opacity-30">table_restaurant</span>
          <p className="text-sm">No tables configured yet. Add your first table.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tables.map(table => {
            const meta = STATUS_META[table.status];
            return (
              <div
                key={table.id}
                className="bg-surface-container dark:bg-sumi-800 rounded-2xl border border-outline-variant/10 dark:border-sumi-700 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Table number */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Table</p>
                    <p className="text-3xl font-headline font-bold text-on-surface dark:text-white leading-none mt-0.5">{table.number}</p>
                  </div>
                  <span className={`material-symbols-outlined text-[20px] ${meta.color.split(' ')[0]}`}>{meta.icon}</span>
                </div>

                {/* Capacity */}
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px]">group</span>
                  <span className="text-xs">{table.capacity} seats</span>
                </div>

                {/* Status badge */}
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border text-center ${meta.color}`}>
                  {meta.label}
                </span>

                {/* Status dropdown */}
                <select
                  value={table.status}
                  onChange={e => statusMutation.mutate({ id: table.id, status: e.target.value as TableStatus })}
                  className="w-full text-xs px-2 py-1.5 bg-surface-container-high dark:bg-sumi-700 border border-outline-variant/20 dark:border-sumi-600 rounded text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                  ))}
                </select>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-outline-variant/10 dark:border-sumi-700">
                  <button
                    onClick={() => openEdit(table)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors py-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={() => openDelete(table)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs text-on-surface-variant hover:text-error transition-colors py-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface dark:bg-sumi-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-headline font-bold text-on-surface dark:text-white">Add New Table</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Table Number</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 1"
                  value={createForm.number}
                  onChange={e => setCreateForm(f => ({ ...f, number: e.target.value }))}
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Capacity (seats)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 4"
                  value={createForm.capacity}
                  onChange={e => setCreateForm(f => ({ ...f, capacity: e.target.value }))}
                  className={inputClass}
                />
              </div>
              {error && <p className="text-xs text-error">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="flex-1 py-2 text-sm text-on-surface-variant border border-outline-variant/30 dark:border-sumi-600 rounded-lg hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="flex-1 py-2 text-sm bg-primary text-on-primary rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────── */}
      {isEditOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface dark:bg-sumi-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-headline font-bold text-on-surface dark:text-white">Edit Table {selected.number}</h3>
              <button onClick={() => setIsEditOpen(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Table Number</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.number}
                  onChange={e => setEditForm(f => ({ ...f, number: e.target.value }))}
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Capacity (seats)</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.capacity}
                  onChange={e => setEditForm(f => ({ ...f, capacity: e.target.value }))}
                  className={inputClass}
                />
              </div>
              {error && <p className="text-xs text-error">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsEditOpen(false)}
                className="flex-1 py-2 text-sm text-on-surface-variant border border-outline-variant/30 dark:border-sumi-600 rounded-lg hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={updateMutation.isPending}
                className="flex-1 py-2 text-sm bg-primary text-on-primary rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ─────────────────────────────────────────── */}
      {isDeleteOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface dark:bg-sumi-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-error text-[28px]">warning</span>
              <h3 className="text-lg font-headline font-bold text-on-surface dark:text-white">Delete Table {selected.number}?</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-2">
              This will permanently remove Table {selected.number} ({selected.capacity} seats).
            </p>
            <p className="text-xs text-on-surface-variant opacity-70 mb-6">Tables with active orders cannot be deleted.</p>
            {error && <p className="text-xs text-error mb-4">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setIsDeleteOpen(false)}
                className="flex-1 py-2 text-sm text-on-surface-variant border border-outline-variant/30 dark:border-sumi-600 rounded-lg hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(selected.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 text-sm bg-error text-on-error rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
