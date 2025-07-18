import axios from 'axios';

// Define types for dashboard data
export interface DashboardStats {
  total_orders: number;
  total_revenue: number;
  average_order_time: number;
  active_orders: number;
}

export interface RecentOrder {
  id: number;
  table_number: number;
  status: string;
  total: number;
  created_at: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number;
  is_available: boolean;
  meal_period: 'BOTH' | 'LUNCH' | 'DINNER'; // Meal period support - required field
}

export interface Category {
  id: number;
  name: string;
  description: string;
}

export interface Modifier {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number | null;
  display_order: number;
}

export interface OrderItem {
  id: number;
  menu_item_id: number;
  quantity: number;
  name: string;
  price: number;
}

export interface Order {
  id: number;
  table_id: number;
  status: string;
  total: number;
  created_at: string;
  ayce_order: boolean;
  notes?: string;
  items?: OrderItem[];
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'completed';

export interface OrderCreate {
  table_id: number;
  status: OrderStatus;
  ayce_order: boolean;
  ayce_price: number;
  items: OrderItemCreate[];
  notes?: string;
}

export interface OrderItemCreate {
  menu_item_id: number;
  quantity: number;
  notes?: string;
}

export type DiscountType = 'percent' | 'fixed';

export interface DiscountCreate {
  type: DiscountType;
  value: number;
}

const API_BASE_URL = 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      url: response.config.url,
      method: response.config.method,
      status: response.status,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    
    // Handle specific error cases
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Server Error:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Network Error:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Add request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', {
      url: config.url,
      method: config.method,
      data: config.data,
      params: config.params,
    });
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Orders API
export const ordersApi = {
  getAll: (): Promise<Order[]> => api.get('/orders/').then(res => res.data),
  getById: (id: number): Promise<Order> => api.get(`/orders/${id}/`).then(res => res.data),
  create: (data: { table_id: number; ayce_order: boolean; notes?: string }): Promise<Order> => 
    api.post('/orders/', data).then(res => res.data),
  update: (id: number, data: Partial<Order>): Promise<Order> => 
    api.put(`/orders/${id}/`, data).then(res => res.data),
  delete: (id: number): Promise<void> => api.delete(`/orders/${id}/`).then(res => res.data),
  createOrder: async (order: OrderCreate): Promise<Order> => {
    const response = await api.post('/orders', order);
    return response.data;
  },
  getTotal: async (orderId: number): Promise<{ total: number }> => {
    const response = await api.get(`/orders/${orderId}/total`);
    return response.data;
  },
  addItem: (orderId: number, data: { menu_item_id: number; quantity: number }): Promise<OrderItem> => 
    api.post(`/orders/${orderId}/items/`, data).then(res => res.data),
  deleteItem: (orderId: number, itemId: number): Promise<void> => 
    api.delete(`/orders/${orderId}/items/${itemId}/`).then(res => res.data),
};

// Menu API
export const menuApi = {
  getItems: (params?: { skip?: number; limit?: number; category_id?: number }): Promise<MenuItem[]> => 
    api.get('/menu/menu-items/', { params }).then(res => res.data),
  getItem: (id: number): Promise<MenuItem> => api.get(`/menu/menu-items/${id}/`).then(res => res.data),
  createItem: (data: { name: string; description: string; price: number; category_id: number; meal_period: 'BOTH' | 'LUNCH' | 'DINNER' }): Promise<MenuItem> => 
    api.post('/menu/menu-items/', data).then(res => res.data),
  updateItem: (id: number, data: Partial<MenuItem>): Promise<MenuItem> => 
    api.patch(`/menu/menu-items/${id}/`, data).then(res => res.data),
  deleteItem: (id: number): Promise<void> => api.delete(`/menu/menu-items/${id}/`).then(res => res.data),
  getModifiers: (params?: { skip?: number; limit?: number; category_id?: number }): Promise<Modifier[]> => 
    api.get('/menu/modifiers/', { params }).then(res => res.data),
  updateModifier: (id: number, data: Partial<Modifier>): Promise<Modifier> => 
    api.patch(`/menu/modifiers/${id}/`, data).then(res => res.data),
  createModifier: (data: Omit<Modifier, 'id'>): Promise<Modifier> => 
    api.post('/menu/modifiers/', data).then(res => res.data),
  deleteModifier: (id: number): Promise<void> => api.delete(`/menu/modifiers/${id}/`).then(res => res.data),
};

// Categories API
export const categoriesApi = {
  getAll: (): Promise<Category[]> => api.get('/menu/categories/').then(res => res.data),
  getById: (id: number): Promise<Category> => api.get(`/menu/categories/${id}/`).then(res => res.data),
  create: (data: { name: string; description: string }): Promise<Category> => 
    api.post('/menu/categories/', data).then(res => res.data),
  update: (id: number, data: Partial<Category>): Promise<Category> => 
    api.patch(`/menu/categories/${id}/`, data).then(res => res.data),
  delete: (id: number): Promise<void> => api.delete(`/menu/categories/${id}/`).then(res => res.data),
};

// Dashboard API
export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard/stats/');
    return response.data;
  },
  getRecentOrders: async (): Promise<RecentOrder[]> => {
    const response = await api.get('/dashboard/recent-orders/');
    return response.data;
  },
};

export default api; 