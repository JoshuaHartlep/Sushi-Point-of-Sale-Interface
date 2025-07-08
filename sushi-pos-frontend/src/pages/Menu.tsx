import { useQuery } from '@tanstack/react-query';
import { menuApi } from '../services/api';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

const Menu = () => {
  const { data: menuItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['menu-items'],
    queryFn: menuApi.getMenuItems,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: menuApi.getCategories,
  });

  if (itemsLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getCategoryName = (categoryId: number) => {
    const category = categories?.find((cat: any) => cat.id === categoryId);
    return category?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
          <p className="text-gray-600">Manage your menu items and categories</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors">
          <PlusIcon className="h-5 w-5" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Menu Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {menuItems?.map((item: any) => (
          <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                  <p className="text-sm text-gray-500">{getCategoryName(item.category_id)}</p>
                </div>
                <div className="flex space-x-2">
                  <button className="text-blue-600 hover:text-blue-800">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button className="text-red-600 hover:text-red-800">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {item.description && (
                <p className="text-gray-600 text-sm mb-4">{item.description}</p>
              )}
              
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold text-gray-900">${item.price}</span>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  item.is_available 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {item.is_available ? 'Available' : 'Unavailable'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Categories Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Categories</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories?.map((category: any) => (
              <div key={category.id} className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900">{category.name}</h3>
                {category.description && (
                  <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">Order: {category.display_order}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Menu; 