import { useState } from 'react';
import { Users, UtensilsCrossed } from 'lucide-react';
import { useCustomerOrder } from '../../contexts/CustomerOrderContext';

interface Props {
  tableId: number;
  mealPeriod: 'LUNCH' | 'DINNER';
  ayceLunchPrice: number;
  ayceDinnerPrice: number;
  restaurantName: string;
}

export default function CustomerOnboarding({
  tableId,
  mealPeriod,
  ayceLunchPrice,
  ayceDinnerPrice,
  restaurantName,
}: Props) {
  const { setupOrder, isLoading } = useCustomerOrder();
  const [partySize, setPartySize] = useState(2);
  const [isAyce, setIsAyce] = useState(true);

  const aycePrice = mealPeriod === 'LUNCH' ? ayceLunchPrice : ayceDinnerPrice;

  const handleStart = () => {
    setupOrder(tableId, isAyce, partySize, mealPeriod, aycePrice);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <UtensilsCrossed className="text-primary" size={36} />
          </div>
          <h1 className="text-3xl font-headline italic text-on-surface">{restaurantName}</h1>
          <p className="text-xs uppercase tracking-[0.25em] text-on-surface-variant mt-2">Welcome</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className="text-sm text-on-surface-variant">Table {tableId}</span>
            <span className="text-on-surface-variant opacity-30">·</span>
            <span className="px-2.5 py-0.5 rounded-full border border-primary/30 text-[10px] font-bold tracking-[0.2em] text-primary uppercase">
              {mealPeriod}
            </span>
          </div>
        </div>

        {/* Party Size */}
        <div className="mb-7">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">
            <Users size={13} />
            Party Size
          </label>
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setPartySize(p => Math.max(1, p - 1))}
              className="w-11 h-11 rounded-full bg-surface-container-high flex items-center justify-center text-xl font-bold text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              −
            </button>
            <span className="text-4xl font-headline text-on-surface w-12 text-center">{partySize}</span>
            <button
              onClick={() => setPartySize(p => p + 1)}
              className="w-11 h-11 rounded-full bg-surface-container-high flex items-center justify-center text-xl font-bold text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Dining Style */}
        <div className="mb-8">
          <label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4 block">
            Dining Style
          </label>
          <div className="flex bg-surface-container-low rounded-xl p-1.5 gap-1">
            <button
              onClick={() => setIsAyce(true)}
              className={`flex-1 py-3 px-2 text-sm font-bold tracking-wide rounded-lg transition-all ${
                isAyce
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant opacity-60 hover:opacity-80'
              }`}
            >
              <span className="block">AYCE</span>
              <span className="block text-[10px] font-normal tracking-wider mt-0.5 opacity-80">
                ${aycePrice}/person
              </span>
            </button>
            <button
              onClick={() => setIsAyce(false)}
              className={`flex-1 py-3 px-2 text-sm font-bold tracking-wide rounded-lg transition-all ${
                !isAyce
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant opacity-60 hover:opacity-80'
              }`}
            >
              <span className="block">À La Carte</span>
              <span className="block text-[10px] font-normal tracking-wider mt-0.5 opacity-80">
                Pay per item
              </span>
            </button>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={isLoading}
          className="w-full py-4 bg-primary text-on-primary font-bold text-sm uppercase tracking-[0.15em] rounded-xl disabled:opacity-50 transition-opacity active:scale-[0.98]"
        >
          {isLoading ? 'Setting up…' : 'Start Ordering'}
        </button>

        <p className="text-center text-xs text-on-surface-variant opacity-40 mt-6">
          Scan the QR code again to restart
        </p>
      </div>
    </div>
  );
}
