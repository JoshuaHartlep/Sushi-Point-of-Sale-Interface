import { Link, useLocation } from 'react-router-dom';
import { Home, List, Utensils, Settings, ListOrdered, PlusCircle, Tag } from 'lucide-react';
import { useRestaurant } from '../contexts/RestaurantContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { restaurantName } = useRestaurant();

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/orders', icon: List, label: 'Orders' },
    { path: '/menu', icon: Utensils, label: 'Menu' },
    { path: '/modifiers', icon: Tag, label: 'Modifiers' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight font-['Poppins']">{restaurantName}</h1>
            {/* ... rest of the header ... */}
          </div>
        </div>
      </header>
      <div className="flex h-screen bg-gray-100">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg">
          <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-800">Sushi POS</h1>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                    location.pathname === item.path
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
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