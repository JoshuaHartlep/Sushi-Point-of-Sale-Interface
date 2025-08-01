import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Home, List, Utensils, Settings, ListOrdered, PlusCircle, Tag, Moon, Sun, Clock } from 'lucide-react';
import { useRestaurant } from '../contexts/RestaurantContext';
import { useTheme } from '../contexts/ThemeContext';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { restaurantName } = useRestaurant();
  const { theme, toggleTheme, isDark } = useTheme();
  const { mealPeriod, isDinner, isLunch } = useMealPeriod();
  // Fetch restaurant name from settings API
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  // Generate display title based on settings
  const displayTitle = (() => {
    if (isLoading) return 'Hartlep POS';
    if (error || !settings?.restaurant_name) return 'Hartlep POS – Restaurant';
    return `Hartlep POS – ${settings.restaurant_name}`;
  })();

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/orders', icon: List, label: 'Orders' },
    { path: '/menu', icon: Utensils, label: 'Menu' },
    { path: '/modifiers', icon: Tag, label: 'Modifiers' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow transition-colors">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight font-['Poppins']">{displayTitle}</h1>
            <div className="flex items-center space-x-4">
              {/* Meal Period Indicator */}
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className={`text-sm font-medium ${
                  isDinner 
                    ? 'text-orange-600 dark:text-orange-400' 
                    : 'text-blue-600 dark:text-blue-400'
                }`}>
                  {isDinner ? 'Dinner' : 'Lunch'}
                </span>
              </div>
              
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-700" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
        {/* Sidebar */}
        <div className="w-64 bg-white dark:bg-gray-800 shadow-lg transition-colors">
          <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Sushi POS</h1>
          </div>
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === item.path
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
};

export default Layout; 