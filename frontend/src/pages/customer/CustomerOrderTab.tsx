import { ShoppingBag, Trash2, Plus, Minus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useCustomerOrder } from '../../contexts/CustomerOrderContext';

export default function CustomerOrderTab({ onGoToMenu }: { onGoToMenu: () => void }) {
  const {
    cart, isAyce, partySize, aycePrice, mealPeriod,
    cartSubtotal, totalItemCount,
    updateQty, removeFromCart,
    submitOrder, resetAfterSubmit,
    lastSubmittedOrder, lastSubmittedCart, isLoading, submitError,
  } = useCustomerOrder();

  // ── Post-submission confirmation ──────────────────────────────────────────
  if (lastSubmittedOrder) {
    const submittedTotal = lastSubmittedCart.reduce((s, i) => s + i.price * i.quantity, 0);
    return (
      <div className="pb-28 px-5 pt-6 flex flex-col">
        <div className="flex flex-col items-center text-center mb-8">
          <CheckCircle className="text-tertiary mb-3" size={44} strokeWidth={1.5} />
          <h2 className="font-headline text-2xl text-on-surface">Order Placed!</h2>
          <p className="text-sm text-on-surface-variant mt-1.5 opacity-70">
            Your server has been notified.
          </p>
        </div>

        {/* Summary using cart snapshot (which has names + prices) */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 divide-y divide-outline-variant/10 mb-6">
          {lastSubmittedCart.map(item => (
            <div key={item.menuItemId} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-on-surface-variant bg-surface-container rounded-full w-6 h-6 flex items-center justify-center">
                  {item.quantity}
                </span>
                <span className="font-headline text-on-surface text-sm">{item.name}</span>
              </div>
              {!isAyce && (
                <span className="text-primary font-bold text-sm">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>

        {!isAyce && (
          <div className="flex justify-between items-baseline px-1 mb-6">
            <span className="text-sm text-on-surface-variant">Total sent to kitchen</span>
            <span className="font-headline font-bold text-on-surface text-lg">
              ${submittedTotal.toFixed(2)}
            </span>
          </div>
        )}

        <button
          onClick={resetAfterSubmit}
          className="w-full py-4 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl active:scale-[0.98] transition-transform"
        >
          Order More Items
        </button>
      </div>
    );
  }

  // ── Empty cart ─────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 px-6 text-center">
        <ShoppingBag className="text-on-surface-variant mb-4 opacity-20" size={52} strokeWidth={1.5} />
        <h3 className="font-headline text-xl text-on-surface">Your order is empty</h3>
        <p className="text-sm text-on-surface-variant mt-1.5 opacity-60">
          Add items from the menu to get started
        </p>
        <button
          onClick={onGoToMenu}
          className="mt-6 px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-full tracking-wider hover:opacity-90 transition-opacity"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  // ── Cart review ────────────────────────────────────────────────────────────
  return (
    <div className="pb-28 px-4 pt-3">

      {/* Metadata badges */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary border border-primary/30 rounded-full px-3 py-1">
          {isAyce ? 'All You Can Eat' : 'À La Carte'}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant border border-outline-variant/40 rounded-full px-3 py-1">
          {mealPeriod}
        </span>
        {isAyce && (
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant border border-outline-variant/40 rounded-full px-3 py-1">
            {partySize} {partySize === 1 ? 'guest' : 'guests'}
          </span>
        )}
      </div>

      {/* Cart item rows */}
      <div className="space-y-2.5 mb-5">
        {cart.map(item => (
          <div
            key={item.menuItemId}
            className="flex items-center gap-3 bg-surface-container-lowest rounded-xl px-4 py-3.5 border border-outline-variant/10 card-shadow"
          >
            {/* Qty controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => updateQty(item.menuItemId, item.quantity - 1)}
                className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-90"
              >
                <Minus size={12} />
              </button>
              <span className="w-5 text-center text-sm font-bold text-on-surface">{item.quantity}</span>
              <button
                onClick={() => updateQty(item.menuItemId, item.quantity + 1)}
                className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-90"
              >
                <Plus size={12} />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-headline text-on-surface text-sm leading-tight truncate">{item.name}</p>
            </div>

            {/* Price — $0.00 for AYCE, real price for a la carte */}
            <p className={`text-sm font-bold flex-shrink-0 ${isAyce ? 'text-on-surface-variant opacity-35' : 'text-primary'}`}>
              {isAyce ? '$0.00' : `$${(item.price * item.quantity).toFixed(2)}`}
            </p>

            <button
              onClick={() => removeFromCart(item.menuItemId)}
              className="flex-shrink-0 text-on-surface-variant opacity-30 hover:opacity-60 hover:text-error transition-all ml-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-outline-variant/15 pt-5 mb-4 space-y-3">
        {isAyce ? (
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-primary">AYCE — {partySize} × ${aycePrice.toFixed(2)}</span>
              <span className="font-headline font-bold text-on-surface text-lg">
                ${(partySize * aycePrice).toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1.5 opacity-60">
              Flat rate covers all items. Individual items show as $0.
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-baseline px-1">
              <span className="text-sm text-on-surface-variant">
                Subtotal ({totalItemCount} {totalItemCount === 1 ? 'item' : 'items'})
              </span>
              <span className="font-headline font-bold text-on-surface text-lg">
                ${cartSubtotal.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant opacity-40 px-1">
              Tax and gratuity will be added at the end.
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {submitError && (
        <div className="flex items-center gap-2 bg-error/5 border border-error/20 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={15} className="text-error flex-shrink-0" />
          <p className="text-sm text-error">{submitError}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={submitOrder}
        disabled={isLoading || cart.length === 0}
        className="w-full py-4 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <><Loader2 size={16} className="animate-spin" /> Placing Order…</>
        ) : (
          <>Place Order · {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}</>
        )}
      </button>
    </div>
  );
}
