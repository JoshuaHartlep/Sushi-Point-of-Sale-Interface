import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Minus } from 'lucide-react';
import { menuApi, MenuItem, Modifier } from '../../services/api';
import { useCustomerOrder } from '../../contexts/CustomerOrderContext';

const API_ORIGIN = 'http://localhost:8000';
const NOTE_MAX = 50;

interface Props {
  item: MenuItem;
  onClose: () => void;
}

export default function MenuItemModal({ item, onClose }: Props) {
  const { isAyce, addToCart, updateQty, cart } = useCustomerOrder();

  const cartItem = cart.find(i => i.menuItemId === item.id);
  const qty = cartItem?.quantity ?? 0;
  // Pre-fill note from existing cart entry so edits are reflected
  const [note, setNote] = useState(cartItem?.notes ?? '');

  const displayPrice = isAyce ? 0 : Number(item.price);

  // Fetch modifiers for this item's category (global + category-specific)
  const { data: modifiers = [] } = useQuery<Modifier[]>({
    queryKey: ['customer-modifiers', item.category_id],
    queryFn: () => menuApi.getModifiers({ category_id: item.category_id }),
    staleTime: 5 * 60 * 1000,
  });

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const imageUrl = item.image_url ? `${API_ORIGIN}${item.image_url}` : null;
  const trimmedNote = note.trim() || undefined;

  return (
    // Backdrop — z-[60] to render above the bottom nav (z-50)
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
    >
      {/* Sheet / modal */}
      <div
        className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-modal-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Image area */}
        <div className="relative w-full h-48 bg-surface-container flex items-center justify-center overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <span className="text-7xl opacity-15 select-none">🍣</span>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content — max-h keeps it from taking over small screens */}
        <div className="px-5 pt-5 pb-6 overflow-y-auto max-h-[55vh]">
          {/* Name + price */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="font-headline text-2xl text-on-surface leading-tight flex-1">
              {item.name}
            </h2>
            <span className={`font-bold text-lg flex-shrink-0 pt-0.5 ${isAyce ? 'text-on-surface-variant opacity-50' : 'text-primary'}`}>
              {isAyce ? 'Included' : `$${displayPrice.toFixed(2)}`}
            </span>
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-sm text-on-surface-variant/75 leading-relaxed mb-4">
              {item.description}
            </p>
          )}

          {/* Modifiers */}
          {modifiers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/50 mb-2">
                Options & Extras
              </p>
              <div className="space-y-1.5">
                {modifiers.map(mod => (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between px-3 py-2.5 bg-surface-container-lowest rounded-xl border border-outline-variant/10"
                  >
                    <div>
                      <p className="text-sm font-medium text-on-surface">{mod.name}</p>
                      {mod.description && (
                        <p className="text-xs text-on-surface-variant/60 mt-0.5">{mod.description}</p>
                      )}
                    </div>
                    {mod.price > 0 && (
                      <span className="text-sm font-bold text-primary flex-shrink-0 ml-2">
                        +${Number(mod.price).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom note */}
          <div className="mb-5">
            <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/50 block mb-1.5">
              Custom Note <span className="font-normal normal-case tracking-normal opacity-70">(optional)</span>
            </label>
            <div className="relative">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="e.g. no wasabi, extra spicy…"
                rows={2}
                className="w-full resize-none bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-colors"
              />
              {note.length > 0 && (
                <span className="absolute bottom-2 right-3 text-[10px] text-on-surface-variant/40">
                  {note.length}/{NOTE_MAX}
                </span>
              )}
            </div>
          </div>

          {/* Add to cart controls */}
          <div className="flex items-center gap-3">
            {qty === 0 ? (
              <button
                onClick={() => addToCart(item.id, item.name, Number(item.price), trimmedNote)}
                className="flex-1 py-3.5 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl active:scale-[0.98] transition-transform"
              >
                Add to Order
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2">
                  <button
                    onClick={() => updateQty(item.id, qty - 1)}
                    className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center font-bold text-on-surface">{qty}</span>
                  <button
                    onClick={() => addToCart(item.id, item.name, Number(item.price), trimmedNote)}
                    className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl active:scale-[0.98] transition-transform"
                >
                  Done · {qty} added
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
