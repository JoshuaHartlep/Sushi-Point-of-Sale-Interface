import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Minus, Loader2 } from 'lucide-react';
import { menuApi, categoriesApi, MenuItem, Category, resolveImageUrl, getMenuImageStyle } from '../../services/api';
import { useCustomerOrder } from '../../contexts/CustomerOrderContext';
import MenuItemModal from './MenuItemModal';

// Combined height of the fixed app header + sticky category nav in px.
// Used for scroll offset when jumping to a section and for the IntersectionObserver rootMargin.
const STICKY_OFFSET = 108;

const sortMenuItemsByName = (a: MenuItem, b: MenuItem) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export default function CustomerMenuTab() {
  const { mealPeriod, addToCart, updateQty, cart, isAyce } = useCustomerOrder();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);

  // Map of catId -> section DOM element, populated by ref callbacks during render.
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  // Container ref for the scrollable nav pills (used to auto-scroll the active pill into view).
  const navScrollRef = useRef<HTMLDivElement>(null);
  // When true, IntersectionObserver callbacks are suppressed so programmatic scrolls
  // don't cause the active tab to flicker.
  const suppressScrollspy = useRef(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['customer-categories'],
    queryFn: () => categoriesApi.getAll(),
  });

  const { data: allItems = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ['customer-menu-items'],
    queryFn: () => menuApi.getItems({ limit: 500 }),
  });

  // Filter to items relevant to the current meal period.
  const periodItems = allItems.filter(item => {
    if (item.meal_period !== 'BOTH' && item.meal_period !== mealPeriod) return false;
    return true;
  });

  // Build per-category groups (available first, then unavailable, each sorted A–Z).
  // Categories with zero items in the current period are omitted entirely.
  const itemsByCategory = categories.reduce<Record<number, { available: MenuItem[]; unavailable: MenuItem[] }>>(
    (acc, cat) => {
      const catItems = periodItems.filter(i => i.category_id === cat.id);
      if (catItems.length === 0) return acc;
      acc[cat.id] = {
        available: catItems.filter(i => i.is_available).sort(sortMenuItemsByName),
        unavailable: catItems.filter(i => !i.is_available).sort(sortMenuItemsByName),
      };
      return acc;
    },
    {}
  );

  // Stable ordered list of category IDs to render (alphabetical by name, matches previous "All" behaviour).
  const orderedCategoryIds = Object.keys(itemsByCategory)
    .map(Number)
    .sort((a, b) => {
      const nameA = categories.find(c => c.id === a)?.name ?? '';
      const nameB = categories.find(c => c.id === b)?.name ?? '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });

  // Default the active nav tab to the first category once data is available.
  useEffect(() => {
    if (orderedCategoryIds.length > 0 && activeCategory === null) {
      setActiveCategory(orderedCategoryIds[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedCategoryIds.length]);

  // ── ScrollSpy ────────────────────────────────────────────────────────────────
  // Observe each section heading. When a section enters the "trigger band"
  // (just below the sticky headers), mark it as the active category.
  useEffect(() => {
    if (orderedCategoryIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressScrollspy.current) return;
        // Pick the intersecting entry closest to the top of the trigger band.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const catId = Number(visible[0].target.getAttribute('data-category-id'));
          if (!isNaN(catId)) setActiveCategory(catId);
        }
      },
      {
        // Trigger band: a 20px-tall horizontal strip that sits just below the
        // combined sticky offset.  Sections enter it from below as the user scrolls.
        rootMargin: `-${STICKY_OFFSET}px 0px -${window.innerHeight - STICKY_OFFSET - 20}px 0px`,
        threshold: 0,
      }
    );

    orderedCategoryIds.forEach(catId => {
      const el = sectionRefs.current[catId];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  // Re-run whenever the set of visible categories changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedCategoryIds.join(',')]);

  // Auto-scroll the nav bar horizontally so the active pill is always visible.
  useEffect(() => {
    if (activeCategory === null || !navScrollRef.current) return;
    const btn = navScrollRef.current.querySelector(
      `[data-nav-cat="${activeCategory}"]`
    ) as HTMLElement | null;
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeCategory]);

  // ── Navigation click ─────────────────────────────────────────────────────────
  const scrollToCategory = (catId: number | null) => {
    if (catId === null) {
      // "All" → scroll to very top of page.
      suppressScrollspy.current = true;
      setActiveCategory(orderedCategoryIds[0] ?? null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => { suppressScrollspy.current = false; }, 700);
      return;
    }
    const el = sectionRefs.current[catId];
    if (!el) return;
    // Suppress the observer while the browser is animating the scroll so we
    // don't get intermediate category flashes.
    suppressScrollspy.current = true;
    setActiveCategory(catId);
    const y = el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setTimeout(() => { suppressScrollspy.current = false; }, 700);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getCartQty = (menuItemId: number) =>
    cart.find(i => i.menuItemId === menuItemId)?.quantity ?? 0;

  const renderCard = (item: MenuItem, idx: number, isUnavailable = false) => {
    const qty = getCartQty(item.id);
    const isFeature = idx === 0 && !isUnavailable;
    const displayPrice = isAyce ? 0 : Number(item.price);

    return (
      <div
        key={item.id}
        onClick={() => !isUnavailable && setModalItem(item)}
        className={`bg-surface-container-lowest rounded-xl overflow-hidden border border-outline-variant/10 card-shadow flex flex-col transition-transform ${
          isFeature ? 'col-span-2' : ''
        } ${isUnavailable ? 'opacity-45 cursor-default' : 'cursor-pointer active:scale-[0.98]'}`}
      >
        {/* Image */}
        <div className={`bg-surface-container flex items-center justify-center flex-shrink-0 overflow-hidden relative ${isFeature ? 'h-36' : 'h-28'}`}>
          {item.image_url ? (
            <img
              src={resolveImageUrl(item.image_url) ?? undefined}
              alt={item.name}
              className="w-full h-full object-cover"
              style={getMenuImageStyle(item)}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <span className="text-4xl opacity-20 select-none">🍣</span>
          )}
          {isUnavailable && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-background/80 backdrop-blur-sm text-on-surface-variant text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-outline-variant/20">
                Unavailable
              </span>
            </div>
          )}
        </div>

        <div className={`flex justify-between items-end gap-2 flex-1 ${isFeature ? 'p-4' : 'p-3'}`}>
          <div className="flex-1 min-w-0">
            <h3 className={`font-headline leading-tight ${isFeature ? 'text-lg' : 'text-base'} ${isUnavailable ? 'text-on-surface-variant' : 'text-on-surface'}`}>
              {item.name}
            </h3>
            {item.description && isFeature && (
              <p className="text-xs text-on-surface-variant/60 mt-1 italic line-clamp-1">
                {item.description}
              </p>
            )}
            <p className={`font-bold text-sm mt-1.5 ${isUnavailable ? 'text-on-surface-variant opacity-40' : isAyce ? 'text-on-surface-variant opacity-40' : 'text-primary'}`}>
              {isUnavailable ? '—' : isAyce ? 'Included' : `$${displayPrice.toFixed(2)}`}
            </p>
          </div>

          {/* Qty controls — only for available items */}
          {!isUnavailable && (
            qty === 0 ? (
              <button
                onClick={e => { e.stopPropagation(); addToCart(item.id, item.name, Number(item.price)); }}
                className={`flex-shrink-0 flex items-center justify-center rounded-full transition-all active:scale-90 bg-surface-container-high text-on-surface hover:bg-primary hover:text-on-primary ${isFeature ? 'w-10 h-10' : 'w-9 h-9'}`}
              >
                <Plus size={15} />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => updateQty(item.id, qty - 1)}
                  className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-90"
                >
                  <Minus size={13} />
                </button>
                <span className="w-5 text-center text-sm font-bold text-on-surface">{qty}</span>
                <button
                  onClick={() => addToCart(item.id, item.name, Number(item.price))}
                  className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors active:scale-90"
                >
                  <Plus size={13} />
                </button>
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {modalItem && (
        <MenuItemModal item={modalItem} onClose={() => setModalItem(null)} />
      )}

      <div className="pb-28">

        {/* Sticky category nav */}
        <nav className="sticky top-[57px] z-30 bg-background/95 backdrop-blur-md border-b border-outline-variant/10 px-6 py-3">
          <div ref={navScrollRef} className="flex gap-6 overflow-x-auto hide-scrollbar">

            {/* "All" always scrolls to top — no active state of its own */}
            <button
              onClick={() => scrollToCategory(null)}
              className="flex-shrink-0 text-sm pb-1 transition-all font-medium text-on-surface-variant opacity-60 hover:opacity-100"
            >
              All
            </button>

            {orderedCategoryIds.map(catId => {
              const cat = categories.find(c => c.id === catId);
              if (!cat) return null;
              const isActive = activeCategory === catId;
              return (
                <button
                  key={catId}
                  data-nav-cat={catId}
                  onClick={() => scrollToCategory(catId)}
                  className={`flex-shrink-0 text-sm pb-1 transition-all ${
                    isActive
                      ? 'font-bold text-primary border-b-2 border-primary'
                      : 'font-medium text-on-surface-variant opacity-60'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Full scrollable menu — every category rendered in order */}
        <div className="px-4 pt-6 space-y-10">
          {orderedCategoryIds.map(catId => {
            const category = categories.find(c => c.id === catId);
            if (!category) return null;
            const { available, unavailable } = itemsByCategory[catId];

            return (
              <section
                key={catId}
                // data attribute read by IntersectionObserver
                data-category-id={catId}
                // Populate the sectionRefs map so we can scroll to this element
                ref={el => { sectionRefs.current[catId] = el; }}
              >
                <h2 className="font-headline text-2xl italic text-on-surface mb-4 px-1">
                  {category.name}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {available.map((item, idx) => renderCard(item, idx, false))}
                  {unavailable.map((item, idx) => renderCard(item, idx, true))}
                </div>
              </section>
            );
          })}

          {orderedCategoryIds.length === 0 && (
            <div className="text-center py-20 text-on-surface-variant opacity-40">
              <p className="font-headline text-xl">No items available</p>
              <p className="text-sm mt-2">Nothing on the {mealPeriod.toLowerCase()} menu right now</p>
            </div>
          )}

          <div className="text-center py-4 opacity-25">
            <p className="font-japanese text-xs leading-relaxed">
              素材の味を最大限に活かすため、<br />
              当店では新鮮な魚介のみを使用しております。
            </p>
          </div>
        </div>

      </div>
    </>
  );
}
