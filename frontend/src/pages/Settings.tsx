import { useState, useEffect } from 'react';
import { Settings, Bell, Lock, Users, CreditCard, Clock, DollarSign } from 'lucide-react';
import { useRestaurant } from '../contexts/RestaurantContext';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import { settingsApi, Settings as SettingsType, SettingsUpdate } from '../services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const SettingsPage = () => {
  const { restaurantName, setRestaurantName } = useRestaurant();
  const { mealPeriod, isDinner, isLunch, switchToLunch, switchToDinner, toggleMealPeriod } = useMealPeriod();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [formData, setFormData] = useState({
    restaurant_name: '',
    timezone: '',
    current_meal_period: 'DINNER' as 'LUNCH' | 'DINNER',
    ayce_lunch_price: 0,
    ayce_dinner_price: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const queryClient = useQueryClient();

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.get();
      setSettings(data);
      setFormData({
        restaurant_name: data.restaurant_name,
        timezone: data.timezone,
        current_meal_period: data.current_meal_period,
        ayce_lunch_price: data.ayce_lunch_price,
        ayce_dinner_price: data.ayce_dinner_price
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mutation for updating meal period
  const mealPeriodMutation = useMutation({
    mutationFn: settingsApi.updateMealPeriod,
    onSuccess: (updatedSettings) => {
      // Update local state
      setSettings(updatedSettings);
      setFormData(prev => ({
        ...prev,
        current_meal_period: updatedSettings.current_meal_period
      }));
      
      // Invalidate queries to refresh any other components using settings
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      
      console.log('Meal period updated successfully');
    },
    onError: (error) => {
      console.error('Failed to update meal period:', error);
    }
  });

  const handleMealPeriodChange = (newMealPeriod: 'LUNCH' | 'DINNER') => {
    mealPeriodMutation.mutate(newMealPeriod);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updateData: SettingsUpdate = {};
      
      // Only include changed fields
      if (settings) {
        if (formData.restaurant_name !== settings.restaurant_name) {
          updateData.restaurant_name = formData.restaurant_name;
        }
        if (formData.timezone !== settings.timezone) {
          updateData.timezone = formData.timezone;
        }
        if (formData.current_meal_period !== settings.current_meal_period) {
          updateData.current_meal_period = formData.current_meal_period;
        }
        if (formData.ayce_lunch_price !== settings.ayce_lunch_price) {
          updateData.ayce_lunch_price = formData.ayce_lunch_price;
        }
        if (formData.ayce_dinner_price !== settings.ayce_dinner_price) {
          updateData.ayce_dinner_price = formData.ayce_dinner_price;
        }
      }

      if (Object.keys(updateData).length > 0) {
        const updatedSettings = await settingsApi.update(updateData);
        setSettings(updatedSettings);
        
        // Update restaurant context if name changed
        if (updateData.restaurant_name) {
          setRestaurantName(updateData.restaurant_name);
        }
        
        console.log('Settings saved successfully');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600 dark:text-gray-300">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Settings</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation */}
        <div className="w-full md:w-64 bg-white dark:bg-gray-800 rounded-lg shadow p-4 border dark:border-gray-700">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-6 border dark:border-gray-700">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Restaurant Settings</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="restaurant-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Restaurant Name
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="restaurant-name"
                      value={formData.restaurant_name}
                      onChange={(e) => handleInputChange('restaurant_name', e.target.value)}
                      className="block w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Enter restaurant name"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Time Zone
                  </label>
                  <select 
                    id="timezone"
                    value={formData.timezone}
                    onChange={(e) => handleInputChange('timezone', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Current Meal Period
                  </label>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center">
                      <Clock className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Currently serving: {formData.current_meal_period === 'DINNER' ? 'Dinner' : 'Lunch'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formData.current_meal_period === 'DINNER' 
                            ? 'All menu items are available' 
                            : 'Dinner-only items are hidden from ordering'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleMealPeriodChange('LUNCH')}
                        disabled={mealPeriodMutation.isPending}
                        className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 ${
                          formData.current_meal_period === 'LUNCH' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        {mealPeriodMutation.isPending && formData.current_meal_period !== 'LUNCH' ? '...' : 'Lunch'}
                      </button>
                      <button
                        onClick={() => handleMealPeriodChange('DINNER')}
                        disabled={mealPeriodMutation.isPending}
                        className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 ${
                          formData.current_meal_period === 'DINNER' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        {mealPeriodMutation.isPending && formData.current_meal_period !== 'DINNER' ? '...' : 'Dinner'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ayce-lunch-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      <DollarSign className="w-4 h-4 inline mr-1" />
                      AYCE Lunch Price
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 sm:text-sm">$</span>
                      </div>
                      <input
                        type="number"
                        id="ayce-lunch-price"
                        step="0.01"
                        min="0"
                        value={formData.ayce_lunch_price}
                        onChange={(e) => handleInputChange('ayce_lunch_price', parseFloat(e.target.value) || 0)}
                        className="block w-full pl-7 pr-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="ayce-dinner-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      <DollarSign className="w-4 h-4 inline mr-1" />
                      AYCE Dinner Price
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 sm:text-sm">$</span>
                      </div>
                      <input
                        type="number"
                        id="ayce-dinner-price"
                        step="0.01"
                        min="0"
                        value={formData.ayce_dinner_price}
                        onChange={(e) => handleInputChange('ayce_dinner_price', parseFloat(e.target.value) || 0)}
                        className="block w-full pl-7 pr-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Current Meal Period
                  </label>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center">
                      <Clock className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Currently serving: {isDinner ? 'Dinner' : 'Lunch'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {isDinner 
                            ? 'All menu items are available' 
                            : 'Dinner-only items are hidden from ordering'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={switchToLunch}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          isLunch 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        Lunch
                      </button>
                      <button
                        onClick={switchToDinner}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          isDinner 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        Dinner
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Notification Settings</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Notifications</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Receive email notifications for new orders</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Security Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Current Password
                  </label>
                  <input
                    type="password"
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    New Password
                  </label>
                  <input
                    type="password"
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">User Management</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">John Doe</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">john@example.com</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                          Admin
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                          Active
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Billing Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Card Number
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="**** **** **** ****"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Expiry Date
                    </label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="MM/YY"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      CVV
                    </label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="***"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 