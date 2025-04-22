import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Edit2, Trash2 } from 'lucide-react';

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  isAvailable: boolean;
}

interface Category {
  id: number;
  name: string;
  items: MenuItem[];
}

const Menu = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isAddingItem, setIsAddingItem] = useState(false);

  // TODO: Replace with actual API call
  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ['menu-items'],
    queryFn: async () => {
      // Simulated data for now
      return [
        {
          id: 1,
          name: 'Appetizers',
          items: [
            {
              id: 1,
              name: 'Edamame',
              description: 'Steamed soybeans with sea salt',
              price: 5.99,
              category: 'Appetizers',
              isAvailable: true,
            },
            {
              id: 2,
              name: 'Miso Soup',
              description: 'Traditional Japanese soup with tofu and seaweed',
              price: 4.99,
              category: 'Appetizers',
              isAvailable: true,
            },
          ],
        },
        {
          id: 2,
          name: 'Sushi Rolls',
          items: [
            {
              id: 3,
              name: 'California Roll',
              description: 'Crab, avocado, and cucumber',
              price: 8.99,
              category: 'Sushi Rolls',
              isAvailable: true,
            },
          ],
        },
      ];
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  const allItems = categories?.flatMap((category) => category.items) || [];
  const filteredItems = selectedCategory === 'All' 
    ? allItems 
    : allItems.filter((item) => item.category === selectedCategory);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Menu Management</h1>
        <button
          onClick={() => setIsAddingItem(true)}
          className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Menu Item
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex space-x-4 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-4 py-2 rounded-lg ${
            selectedCategory === 'All'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All
        </button>
        {categories?.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.name)}
            className={`px-4 py-2 rounded-lg ${
              selectedCategory === category.name
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Menu Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">{item.name}</h3>
                <p className="text-gray-600 mt-1">{item.description}</p>
                <p className="text-lg font-medium text-gray-800 mt-2">
                  ${item.price.toFixed(2)}
                </p>
              </div>
              <div className="flex space-x-2">
                <button className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                  <Edit2 className="w-5 h-5" />
                </button>
                <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="mt-4">
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  item.isAvailable
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {item.isAvailable ? 'Available' : 'Unavailable'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Menu Item Modal */}
      {isAddingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Add Menu Item</h2>
            {/* TODO: Add form for new menu item */}
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => setIsAddingItem(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Menu; 