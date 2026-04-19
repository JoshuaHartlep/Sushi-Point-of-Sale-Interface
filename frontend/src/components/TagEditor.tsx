import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tagsApi, Tag } from '../services/api';

// Groups displayed in the "Recommended" quick-add area, in order
const RECOMMENDED_GROUPS = [
  { key: 'dietary', label: 'Dietary' },
  { key: 'spice',   label: 'Spice' },
  { key: 'protein', label: 'Protein' },
  { key: 'prep',    label: 'Prep Style' },
  { key: 'flavor',  label: 'Flavor & Texture' },
  { key: 'portion', label: 'Portion' },
  { key: 'rice',    label: 'Rice' },
];

const GROUP_COLORS: Record<string, string> = {
  dietary: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  spice:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  protein: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  prep:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  flavor:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  portion: 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300',
  rice:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

function chipClass(group: string | null): string {
  return GROUP_COLORS[group ?? ''] ?? 'bg-surface-container text-on-surface-variant';
}

interface TagEditorProps {
  /** Menu item whose tags we are editing */
  itemId: number;
}

export default function TagEditor({ itemId }: TagEditorProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // debounce typeahead
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // fetch this item's current tags
  const { data: selectedTags = [], isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ['item-tags', itemId],
    queryFn: () => tagsApi.getItemTags(itemId),
    staleTime: 0,
  });

  // fetch all tags for typeahead suggestions
  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ['all-tags'],
    queryFn: () => tagsApi.getAll(),
    staleTime: 60_000,
  });

  // search suggestions (filtered client-side for instant feel)
  const selectedIds = new Set(selectedTags.map(t => t.id));
  const suggestions = debouncedSearch
    ? allTags.filter(
        t => !selectedIds.has(t.id) && t.name.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : [];

  const exactMatch = debouncedSearch
    ? allTags.some(t => t.name.toLowerCase() === debouncedSearch.toLowerCase())
    : false;

  // mutation: set full tag list on save
  const setTagsMutation = useMutation({
    mutationFn: (tagIds: number[]) => tagsApi.setItemTags(itemId, tagIds),
    onSuccess: (updated) => {
      queryClient.setQueryData(['item-tags', itemId], updated);
    },
  });

  // create new tag inline then attach it
  const createTagMutation = useMutation({
    mutationFn: (name: string) => tagsApi.create({ name }),
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      const nextIds = [...Array.from(selectedIds), newTag.id];
      setTagsMutation.mutate(nextIds);
    },
  });

  const attach = useCallback((tag: Tag) => {
    if (selectedIds.has(tag.id)) return;
    setTagsMutation.mutate([...Array.from(selectedIds), tag.id]);
    setSearch('');
    setDropdownOpen(false);
  }, [selectedIds, setTagsMutation]);

  const detach = useCallback((tagId: number) => {
    setTagsMutation.mutate(Array.from(selectedIds).filter(id => id !== tagId));
  }, [selectedIds, setTagsMutation]);

  const handleCreateInline = () => {
    const name = search.trim();
    if (!name || exactMatch) return;
    createTagMutation.mutate(name);
    setSearch('');
    setDropdownOpen(false);
  };

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // group recommended tags by group key
  const recommendedByGroup: Record<string, Tag[]> = {};
  for (const tag of allTags) {
    const g = tag.tag_group ?? 'other';
    if (!recommendedByGroup[g]) recommendedByGroup[g] = [];
    recommendedByGroup[g].push(tag);
  }

  if (tagsLoading) {
    return <div className="h-8 bg-surface-container animate-pulse rounded" />;
  }

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map(tag => (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${chipClass(tag.tag_group)}`}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => detach(tag.id)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${tag.name}`}
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
      {selectedTags.length === 0 && (
        <p className="text-xs text-on-surface-variant/50 italic">No tags yet — add some below.</p>
      )}

      {/* Typeahead input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
          onFocus={() => setDropdownOpen(true)}
          placeholder="Search or create a tag…"
          className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Dropdown */}
        {dropdownOpen && debouncedSearch && (
          <div
            ref={dropdownRef}
            className="absolute z-10 mt-1 w-full bg-surface-container-lowest dark:bg-sumi-800 border border-outline-variant/20 dark:border-sumi-700 rounded-lg shadow-lg max-h-48 overflow-y-auto"
          >
            {suggestions.map(tag => (
              <button
                key={tag.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); attach(tag); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-container dark:hover:bg-sumi-700 transition-colors"
              >
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${chipClass(tag.tag_group)}`}>
                  {tag.name}
                </span>
                {tag.tag_group && (
                  <span className="text-xs text-on-surface-variant/50">{tag.tag_group}</span>
                )}
              </button>
            ))}

            {/* Create inline option */}
            {!exactMatch && debouncedSearch && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleCreateInline(); }}
                disabled={createTagMutation.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-primary hover:bg-primary/5 transition-colors border-t border-outline-variant/10"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Create tag "{debouncedSearch}"
              </button>
            )}

            {suggestions.length === 0 && exactMatch && (
              <p className="px-3 py-2 text-xs text-on-surface-variant/50">Tag already added or no matches.</p>
            )}
          </div>
        )}
      </div>

      {/* Recommended tags grouped */}
      <div className="space-y-2 pt-1">
        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Recommended</p>
        {RECOMMENDED_GROUPS.map(({ key, label }) => {
          const group = recommendedByGroup[key];
          if (!group || group.length === 0) return null;
          return (
            <div key={key}>
              <p className="text-[10px] text-on-surface-variant/60 font-medium mb-1">{label}</p>
              <div className="flex flex-wrap gap-1">
                {group.map(tag => {
                  const active = selectedIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => active ? detach(tag.id) : attach(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                        active
                          ? `${chipClass(tag.tag_group)} border-transparent opacity-100 ring-1 ring-current`
                          : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {active && <span className="mr-0.5 opacity-70">✓</span>}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {(setTagsMutation.isPending || createTagMutation.isPending) && (
        <p className="text-xs text-on-surface-variant/50">Saving…</p>
      )}
      {(setTagsMutation.isError || createTagMutation.isError) && (
        <p className="text-xs text-error">Error saving tags.</p>
      )}
    </div>
  );
}
