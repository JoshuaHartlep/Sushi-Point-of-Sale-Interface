import { useState, useEffect } from 'react';
import { useRestaurant } from '../contexts/RestaurantContext';
import { useMealPeriod } from '../contexts/MealPeriodContext';
import { settingsApi, Settings as SettingsType, SettingsUpdate } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

const inputClass = "w-full px-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm";
const labelClass = "block text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-1.5";

const tabIcons: Record<string, string> = {
  general:       'settings',
  notifications: 'notifications',
  security:      'lock',
  users:         'group',
  billing:       'credit_card',
};

const SettingsPage = () => {
  const { setRestaurantName } = useRestaurant();
  const { syncWithSettings } = useMealPeriod();
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

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const queryClient = useQueryClient();

  const tabs = [
    { id: 'general',       label: 'General'       },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security',      label: 'Security'      },
    { id: 'users',         label: 'Users'         },
    { id: 'billing',       label: 'Billing'       },
  ];

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.get();
      setSettings(data);
      setFormData({
        restaurant_name: data.restaurant_name,
        timezone: data.timezone,
        current_meal_period: data.current_meal_period,
        ayce_lunch_price: Number(data.ayce_lunch_price) || 0,
        ayce_dinner_price: Number(data.ayce_dinner_price) || 0
      });
      syncWithSettings(data.current_meal_period);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMealPeriodChange = (newMealPeriod: 'LUNCH' | 'DINNER') => {
    handleInputChange('current_meal_period', newMealPeriod);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updateData: SettingsUpdate = {};
      if (settings) {
        if (formData.restaurant_name !== settings.restaurant_name) updateData.restaurant_name = formData.restaurant_name;
        if (formData.timezone !== settings.timezone) updateData.timezone = formData.timezone;
        if (formData.current_meal_period !== settings.current_meal_period) updateData.current_meal_period = formData.current_meal_period;
        if (formData.ayce_lunch_price !== settings.ayce_lunch_price) updateData.ayce_lunch_price = formData.ayce_lunch_price;
        if (formData.ayce_dinner_price !== settings.ayce_dinner_price) updateData.ayce_dinner_price = formData.ayce_dinner_price;
      }
      if (Object.keys(updateData).length > 0) {
        const updated = await settingsApi.update(updateData);
        setSettings(updated);
        if (updateData.restaurant_name) setRestaurantName(updateData.restaurant_name);
        if (updateData.current_meal_period) syncWithSettings(updateData.current_meal_period);
        await loadSettings();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        queryClient.invalidateQueries({ queryKey: ['settings'] });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="px-8 py-8 space-y-10 max-w-5xl mx-auto w-full animate-pulse">
        <div className="h-10 w-40 bg-surface-container rounded" />
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-52 shrink-0 bg-surface-container-lowest dark:bg-sumi-800 rounded-xl h-52 border border-outline-variant/10" />
          <div className="flex-1 bg-surface-container-lowest dark:bg-sumi-800 rounded-xl h-80 border border-outline-variant/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 space-y-10 max-w-5xl mx-auto w-full">

      {/* ── Page header ── */}
      <section>
        <h2 className="text-5xl font-headline text-on-surface leading-none mb-2">Settings</h2>
        <p className="text-sm text-on-surface-variant">Configure restaurant preferences and system settings</p>
      </section>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Tab sidebar */}
        <div className="w-full md:w-52 shrink-0">
          <nav className="flex flex-col gap-0.5 bg-surface-container-lowest dark:bg-sumi-800 rounded-xl border border-outline-variant/10 dark:border-sumi-700 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm rounded transition-colors text-left ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary font-bold border-l-4 border-primary pl-3'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{tabIcons[tab.id]}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content panel */}
        <div className="flex-1 bg-surface-container-lowest dark:bg-sumi-800 rounded-xl border border-outline-variant/10 dark:border-sumi-700 p-6">

          {activeTab === 'general' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-headline text-on-surface">Restaurant Settings</h3>
              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Restaurant Name</label>
                  <input type="text" value={formData.restaurant_name} onChange={(e) => handleInputChange('restaurant_name', e.target.value)} placeholder="Enter restaurant name" className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Time Zone</label>
                  <select value={formData.timezone} onChange={(e) => handleInputChange('timezone', e.target.value)} className={inputClass}>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Current Meal Period</label>
                  <div className="p-4 bg-surface-container rounded border border-outline-variant/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">schedule</span>
                        <div>
                          <p className="text-sm font-medium text-on-surface">
                            Currently serving: {formData.current_meal_period === 'DINNER' ? 'Dinner' : 'Lunch'}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {formData.current_meal_period === 'DINNER' ? 'All menu items are available' : 'Dinner-only items are hidden'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMealPeriodChange('LUNCH')}
                          className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${formData.current_meal_period === 'LUNCH' ? 'bg-tertiary text-white' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'}`}
                        >
                          Lunch
                        </button>
                        <button
                          onClick={() => handleMealPeriodChange('DINNER')}
                          className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${formData.current_meal_period === 'DINNER' ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'}`}
                        >
                          Dinner
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>AYCE Lunch Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">$</span>
                      <input type="number" step="0.01" min="0" value={formData.ayce_lunch_price} onChange={(e) => handleInputChange('ayce_lunch_price', parseFloat(e.target.value) || 0)} placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>AYCE Dinner Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">$</span>
                      <input type="number" step="0.01" min="0" value={formData.ayce_dinner_price} onChange={(e) => handleInputChange('ayce_dinner_price', parseFloat(e.target.value) || 0)} placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-surface-container border border-outline-variant/30 dark:border-sumi-600 dark:bg-sumi-700 dark:text-white rounded focus:outline-none focus:ring-1 focus:ring-primary text-sm" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${saveSuccess ? '!from-tertiary !to-tertiary' : ''}`}
                  >
                    {saving ? (
                      <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Saving…</>
                    ) : saveSuccess ? (
                      <><span className="material-symbols-outlined text-[16px]">check_circle</span> Saved</>
                    ) : (
                      <><span className="material-symbols-outlined text-[16px]">save</span> Save Settings</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-headline text-on-surface">Notification Settings</h3>
              <div className="flex items-center justify-between p-4 bg-surface-container rounded border border-outline-variant/10">
                <div>
                  <p className="text-sm font-medium text-on-surface">Email Notifications</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Receive email alerts for new orders</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-headline text-on-surface">Security Settings</h3>
              <div className="space-y-4">
                <div><label className={labelClass}>Current Password</label><input type="password" className={inputClass} /></div>
                <div><label className={labelClass}>New Password</label><input type="password" className={inputClass} /></div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-headline text-on-surface">User Management</h3>
              <div className="overflow-hidden rounded border border-outline-variant/10">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="py-3 px-5 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Name</th>
                      <th className="py-3 px-5 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Role</th>
                      <th className="py-3 px-5 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    <tr className="hover:bg-surface-container-low/30">
                      <td className="py-4 px-5">
                        <p className="text-sm font-medium text-on-surface">John Doe</p>
                        <p className="text-xs text-on-surface-variant">john@example.com</p>
                      </td>
                      <td className="py-4 px-5">
                        <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-tertiary/10 text-tertiary">Admin</span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-tertiary/10 text-tertiary">
                          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
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
              <h3 className="text-2xl font-headline text-on-surface">Billing Information</h3>
              <div className="space-y-4">
                <div><label className={labelClass}>Card Number</label><input type="text" placeholder="**** **** **** ****" className={inputClass} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={labelClass}>Expiry Date</label><input type="text" placeholder="MM/YY" className={inputClass} /></div>
                  <div><label className={labelClass}>CVV</label><input type="text" placeholder="***" className={inputClass} /></div>
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
