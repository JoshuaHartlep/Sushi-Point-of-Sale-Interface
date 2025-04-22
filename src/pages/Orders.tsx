import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, CheckCircle2, XCircle, Plus } from 'lucide-react';

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: number;
  tableNumber: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  items: OrderItem[];
  total: number;
  createdAt: string;
}

const Orders = () => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // TODO: Replace with actual API call
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: async () => {
      // Simulated data for now
      return [
        {
          id: 1,
          tableNumber: 5,
          status: 'pending',
          items: [
            { id: 1, name: 'California Roll', quantity: 2, price: 8.99 },
            { id: 2, name: 'Miso Soup', quantity: 1, price: 4.99 },
          ],
          total: 22.97,
          createdAt: '2024-03-20T12:30:00Z',
        },
        {
          id: 2,
          tableNumber: 3,
          status: 'preparing',
          items: [
            { id: 3, name: 'Spicy Tuna Roll', quantity: 1, price: 9.99 },
          ],
          total: 9.99,
          createdAt: '2024-03-20T12:35:00Z',
        },
      ];
    },
  });

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'preparing':
        return 'bg-blue-100 text-blue-800';
      case 'ready':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5" />;
      case 'preparing':
        return <Clock className="w-5 h-5" />;
      case 'ready':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Orders</h1>
        <button className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          <Plus className="w-5 h-5 mr-2" />
          New Order
        </button>
      </div>

      {/* Orders List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orders?.map((order) => (
          <div
            key={order.id}
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setSelectedOrder(order)}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">
                  Table {order.tableNumber}
                </h3>
                <p className="text-gray-600 mt-1">
                  {new Date(order.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${getStatusColor(
                  order.status
                )}`}
              >
                {getStatusIcon(order.status)}
                <span className="ml-1 capitalize">{order.status}</span>
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-gray-600">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-800">Total</span>
                <span className="font-semibold text-gray-800">
                  ${order.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Order #{selectedOrder.id}
                </h2>
                <p className="text-gray-600">
                  Table {selectedOrder.tableNumber} •{' '}
                  {new Date(selectedOrder.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium flex items-center ${getStatusColor(
                  selectedOrder.status
                )}`}
              >
                {getStatusIcon(selectedOrder.status)}
                <span className="ml-1 capitalize">{selectedOrder.status}</span>
              </span>
            </div>

            <div className="space-y-4">
              {selectedOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center py-2 border-b border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-800">{item.name}</p>
                    <p className="text-sm text-gray-600">
                      Quantity: {item.quantity}
                    </p>
                  </div>
                  <p className="font-medium text-gray-800">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}

              <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                <span className="text-lg font-medium text-gray-800">Total</span>
                <span className="text-xl font-semibold text-gray-800">
                  ${selectedOrder.total.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Close
              </button>
              {selectedOrder.status === 'pending' && (
                <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  Start Preparing
                </button>
              )}
              {selectedOrder.status === 'preparing' && (
                <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                  Mark as Ready
                </button>
              )}
              {selectedOrder.status === 'ready' && (
                <button className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">
                  Complete Order
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders; 