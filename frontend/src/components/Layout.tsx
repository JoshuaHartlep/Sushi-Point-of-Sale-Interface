import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/',          icon: 'dashboard',         label: 'Dashboard' },
  { path: '/orders',    icon: 'receipt_long',      label: 'Orders'    },
  { path: '/tables',    icon: 'table_restaurant',  label: 'Tables'    },
  { path: '/menu',      icon: 'menu_book',         label: 'Menu'      },
  { path: '/modifiers', icon: 'tune',              label: 'Modifiers' },
  { path: '/settings',  icon: 'settings',          label: 'Settings'  },
];

const pageTitles: Record<string, string> = {
  '/':          'Dashboard',
  '/orders':    'Orders',
  '/tables':    'Tables',
  '/menu':      'Menu',
  '/modifiers': 'Modifiers',
  '/settings':  'Settings',
};

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { mode, cycleTheme } = useTheme();
  const { isDinner } = useMealPeriod();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const restaurantName = settings?.restaurant_name || 'Sushi POS';

  // derive page title — also handles /orders/:id/edit
  const pageTitle = pageTitles[location.pathname]
    ?? (location.pathname.startsWith('/orders') ? 'Orders' : 'Dashboard');

  const themeIcon = mode === 'dark' ? 'light_mode' : 'dark_mode';

  return (
    <div className="flex min-h-screen bg-background text-on-background antialiased dark:bg-sumi-900 dark:text-inverse-on-surface">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-[224px] h-screen sticky top-0 left-0 flex flex-col py-8 px-0 bg-surface-container-low dark:bg-sumi-800 overflow-y-auto shrink-0 z-50 border-r border-outline-variant/10 dark:border-sumi-700">

        {/* Brand */}
        <div className="px-8 mb-10">
          <h1 className="text-xl font-headline italic text-primary leading-none">
            {restaurantName}
          </h1>
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mt-1 opacity-70">
            Premium Management
          </p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-0.5">
          {navItems.map(({ path, icon, label }) => {
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className={
                  isActive
                    ? 'flex items-center gap-3 border-l-4 border-primary text-primary font-bold pl-7 py-2.5 bg-surface-container/50 dark:bg-sumi-700/50 transition-all'
                    : 'flex items-center gap-3 text-on-surface-variant hover:text-primary pl-8 py-2.5 transition-colors hover:bg-surface-container-high dark:hover:bg-sumi-700'
                }
              >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                <span className="text-sm tracking-tight">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer ornament */}
        <div className="px-8 mt-auto pt-8 border-t border-outline-variant/10 dark:border-sumi-700">
          <div className="flex flex-col items-center gap-2 opacity-40">
            <span className="material-symbols-outlined text-primary text-[18px]">spa</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-center leading-relaxed">
              ― いらっしゃいませ ―
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top header */}
        <header className="h-[57px] w-full sticky top-0 z-40 bg-background/80 dark:bg-sumi-900/80 backdrop-blur-xl flex justify-between items-center px-8 border-b border-outline-variant/10 dark:border-sumi-700">
          <div className="flex items-center gap-6">
            <span className="text-base font-headline italic text-primary">{pageTitle}</span>
            <div className="h-4 w-px bg-outline-variant/30" />
            <span className={`text-sm font-semibold ${isDinner ? 'text-primary' : 'text-tertiary'}`}>
              {isDinner ? 'Dinner Service' : 'Lunch Service'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              title={`Theme: ${mode} — click to cycle`}
              className="text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">{themeIcon}</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
