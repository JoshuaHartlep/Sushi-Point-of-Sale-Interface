import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UtensilsCrossed, BookOpen, ShoppingBag, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { settingsApi, tablesApi, Settings, TableData } from '../../services/api';
import { CustomerOrderProvider, useCustomerOrder } from '../../contexts/CustomerOrderContext';
import CustomerOnboarding from './CustomerOnboarding';
import CustomerMenuTab from './CustomerMenuTab';
import CustomerOrderTab from './CustomerOrderTab';

type Tab = 'menu' | 'order';

function CustomerInterface() {
  const [searchParams] = useSearchParams();
  const tableId = parseInt(searchParams.get('table') ?? '1', 10);
  const [activeTab, setActiveTab] = useState<Tab>('menu');

  const { orderId, totalItemCount } = useCustomerOrder();

  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useQuery<Settings>({
    queryKey: ['customer-settings'],
    queryFn: settingsApi.get,
  });

  const { data: tableData, isLoading: tableLoading, isError: tableError, refetch: refetchTable } = useQuery<TableData>({
    queryKey: ['customer-table', tableId],
    queryFn: () => tablesApi.getById(tableId),
    refetchInterval: 15000, // poll every 15s so customer sees when table is freed
  });

  if (settingsLoading || tableLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (settingsError || !settings || tableError || !tableData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-3">
        <AlertCircle className="text-error" size={36} />
        <p className="font-headline text-lg text-on-surface">Unable to connect</p>
        <p className="text-sm text-on-surface-variant opacity-60">
          Please ask your server for assistance.
        </p>
      </div>
    );
  }

  if (tableData.status === 'OCCUPIED') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <UtensilsCrossed className="text-on-surface-variant opacity-30" size={48} />
        <div className="flex flex-col gap-2">
          <p className="font-headline text-xl text-on-surface">This table is currently occupied</p>
          <p className="text-sm text-on-surface-variant opacity-60 max-w-xs">
            If you believe this is a mistake, please ask your server for assistance.
          </p>
        </div>
        <button
          onClick={() => refetchTable()}
          className="flex items-center gap-2 mt-2 px-4 py-2 rounded-full border border-outline-variant/30 text-sm text-on-surface-variant hover:bg-surface-variant/20 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
    );
  }

  // Show onboarding until order is created
  if (!orderId) {
    return (
      <CustomerOnboarding
        tableId={tableId}
        mealPeriod={settings.current_meal_period}
        ayceLunchPrice={Number(settings.ayce_lunch_price)}
        ayceDinnerPrice={Number(settings.ayce_dinner_price)}
        restaurantName={settings.restaurant_name}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans">

      {/* Top header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/90 backdrop-blur-md border-b border-outline-variant/10">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <UtensilsCrossed className="text-primary" size={18} />
            <span className="font-headline italic text-on-surface-variant text-lg">
              {settings.restaurant_name}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-on-surface-variant opacity-50">Table {tableId}</span>
            <div className="px-2.5 py-0.5 rounded-full border border-primary/25 bg-primary/5">
              <span className="text-[10px] font-bold tracking-[0.2em] text-primary uppercase">
                {settings.current_meal_period}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Decorative vertical text */}
      <div className="fixed right-2 top-36 pointer-events-none opacity-10 hidden sm:block">
        <p
          className="font-headline italic text-3xl text-on-surface-variant tracking-widest"
          style={{ writingMode: 'vertical-rl' }}
        >
          Menu
        </p>
      </div>

      {/* Page content */}
      <main className="pt-[60px]">
        {activeTab === 'menu' ? (
          <CustomerMenuTab />
        ) : (
          <CustomerOrderTab onGoToMenu={() => setActiveTab('menu')} />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-around items-center px-8 pb-6 pt-3 bg-background/90 backdrop-blur-xl border-t border-outline-variant/10 rounded-t-2xl">

        <button
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'menu'
              ? 'text-primary'
              : 'text-on-surface-variant opacity-45 hover:opacity-70'
          }`}
        >
          <div className={`${activeTab === 'menu' ? 'border-t-2 border-primary pt-0.5' : 'pt-0.5'}`}>
            <BookOpen size={22} />
          </div>
          <span className="font-headline text-[10px] uppercase tracking-[0.15em]">Menu</span>
        </button>

        <button
          onClick={() => setActiveTab('order')}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === 'order'
              ? 'text-primary'
              : 'text-on-surface-variant opacity-45 hover:opacity-70'
          }`}
        >
          <div className={`relative ${activeTab === 'order' ? 'border-t-2 border-primary pt-0.5' : 'pt-0.5'}`}>
            <ShoppingBag size={22} />
            {totalItemCount > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-primary text-on-primary text-[8px] w-4 h-4 flex items-center justify-center rounded-full font-bold leading-none">
                {totalItemCount > 99 ? '99+' : totalItemCount}
              </span>
            )}
          </div>
          <span className="font-headline text-[10px] uppercase tracking-[0.15em]">My Order</span>
        </button>

      </nav>
    </div>
  );
}

export default function CustomerApp() {
  return (
    <CustomerOrderProvider>
      <CustomerInterface />
    </CustomerOrderProvider>
  );
}
