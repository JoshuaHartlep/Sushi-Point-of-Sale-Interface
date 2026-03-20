import { Link, useLocation } from 'react-router-dom';
import { Home, List, Utensils, Settings, Tag, Moon, Sun, Monitor, Clock } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../services/api';
import type { ThemeMode } from '../contexts/ThemeContext';

interface LayoutProps {
  children: React.ReactNode;
}

const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  light:  <Sun     className="w-4 h-4 text-amber-500" />,
  dark:   <Moon    className="w-4 h-4 text-indigo-400" />,
  system: <Monitor className="w-4 h-4 text-washi-500 dark:text-washi-400" />,
};

const THEME_LABELS: Record<ThemeMode, string> = {
  light:  'Light',
  dark:   'Dark',
  system: 'System',
};

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { mode, cycleTheme } = useTheme();
  const { isDinner } = useMealPeriod();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const displayTitle = (() => {
    if (isLoading) return 'Hartlep POS';
    if (error || !settings?.restaurant_name) return 'Hartlep POS – Restaurant';
    return `Hartlep POS – ${settings.restaurant_name}`;
  })();

  const navItems = [
    { path: '/',          icon: Home,     label: 'Dashboard' },
    { path: '/orders',    icon: List,     label: 'Orders'    },
    { path: '/menu',      icon: Utensils, label: 'Menu'      },
    { path: '/modifiers', icon: Tag,      label: 'Modifiers' },
    { path: '/settings',  icon: Settings, label: 'Settings'  },
  ];

  return (
    <div className="min-h-screen bg-washi-100 dark:bg-sumi-900 transition-colors">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-sumi-800 shadow-sm border-b border-washi-200 dark:border-sumi-700 transition-colors">
        <div className="px-6 py-3 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {displayTitle}
          </h1>

          <div className="flex items-center gap-3">
            {/* Meal period badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-washi-100 dark:bg-sumi-700 rounded-full border border-washi-200 dark:border-sumi-600 transition-colors">
              <Clock className="w-3.5 h-3.5 text-washi-500 dark:text-washi-400" />
              <span className={`text-xs font-semibold tracking-wide ${
                isDinner
                  ? 'text-akabeni-600 dark:text-akabeni-400'
                  : 'text-sky-600 dark:text-sky-400'
              }`}>
                {isDinner ? 'DINNER' : 'LUNCH'}
              </span>
            </div>

            {/* 3-way theme toggle */}
            <button
              onClick={cycleTheme}
              title={`Theme: ${THEME_LABELS[mode]} — click to cycle`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-washi-100 dark:bg-sumi-700 border border-washi-200 dark:border-sumi-600 hover:bg-washi-200 dark:hover:bg-sumi-600 transition-colors text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              {THEME_ICONS[mode]}
              <span>{THEME_LABELS[mode]}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex" style={{ height: 'calc(100vh - 57px)' }}>
        {/* ── Sidebar ── */}
        <aside className="w-56 flex-shrink-0 bg-white dark:bg-sumi-800 border-r border-washi-200 dark:border-sumi-700 shadow-sm transition-colors flex flex-col">
          {/* Sidebar brand */}
          <div className="px-5 py-5 border-b border-washi-200 dark:border-sumi-700">
            <div className="flex items-center gap-2">
              {/* Subtle torii-red dot accent */}
              <span className="w-2 h-2 rounded-full bg-akabeni-600 flex-shrink-0" />
              <span className="text-lg font-bold text-gray-800 dark:text-white tracking-wide">
                Sushi POS
              </span>
            </div>
            <p className="mt-0.5 text-xs text-washi-500 dark:text-washi-400 pl-4 tracking-widest uppercase">
              寿司 Management
            </p>
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {navItems.map(({ path, icon: Icon, label }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'nav-active-bar bg-akabeni-50 dark:bg-akabeni-950 text-akabeni-700 dark:text-akabeni-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-washi-100 dark:hover:bg-sumi-700 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 mr-3 flex-shrink-0 ${
                    isActive ? 'text-akabeni-600 dark:text-akabeni-400' : ''
                  }`} />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Footer decoration */}
          <div className="px-5 py-3 border-t border-washi-200 dark:border-sumi-700">
            <p className="text-xs text-washi-400 dark:text-washi-600 text-center tracking-wider">
              ― いらっしゃいませ ―
            </p>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
