import { Cog6ToothIcon, UserIcon, BellIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const Settings = () => {
  const settingsSections = [
    {
      title: 'General Settings',
      icon: Cog6ToothIcon,
      items: [
        { name: 'Restaurant Name', value: 'Sushi POS' },
        { name: 'Currency', value: 'USD ($)' },
        { name: 'Timezone', value: 'Eastern Time' },
        { name: 'Language', value: 'English' },
      ]
    },
    {
      title: 'User Management',
      icon: UserIcon,
      items: [
        { name: 'Current User', value: 'Admin' },
        { name: 'Role', value: 'Administrator' },
        { name: 'Last Login', value: 'Today at 2:30 PM' },
        { name: 'Session Timeout', value: '8 hours' },
      ]
    },
    {
      title: 'Notifications',
      icon: BellIcon,
      items: [
        { name: 'Order Alerts', value: 'Enabled' },
        { name: 'Email Notifications', value: 'Disabled' },
        { name: 'Sound Alerts', value: 'Enabled' },
        { name: 'Auto-refresh', value: '30 seconds' },
      ]
    },
    {
      title: 'Security',
      icon: ShieldCheckIcon,
      items: [
        { name: 'Two-Factor Auth', value: 'Disabled' },
        { name: 'Session Management', value: 'Enabled' },
        { name: 'API Access', value: 'Enabled' },
        { name: 'Backup Frequency', value: 'Daily' },
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your Sushi POS configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {settingsSections.map((section) => (
          <div key={section.title} className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center">
                <section.icon className="h-5 w-5 mr-2" />
                {section.title}
              </h2>
            </div>
            <div className="p-6">
              <dl className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.name} className="flex justify-between items-center">
                    <dt className="text-sm font-medium text-gray-600">{item.name}</dt>
                    <dd className="text-sm text-gray-900">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-4">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
          <button className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
            Reset to Defaults
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            Export Settings
          </button>
          <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
            Clear Cache
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings; 