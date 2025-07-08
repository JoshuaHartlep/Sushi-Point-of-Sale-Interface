import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Menu API
export const menuApi = {
  getMenuItems: () => api.get('/menu/menu-items/'),
  getCategories: () => api.get('/menu/categories/'),
  getModifiers: () => api.get('/menu/modifiers/'),
  createMenuItem: (data: any) => api.post('/menu/menu-items/', data),
  updateMenuItem: (id: number, data: any) => api.put(`/menu/menu-items/${id}`, data),
  deleteMenuItem: (id: number) => api.delete(`/menu/menu-items/${id}`),
};

// Orders API
export const ordersApi = {
  getOrders: () => api.get('/orders/'),
  getOrder: (id: number) => api.get(`/orders/${id}`),
  createOrder: (data: any) => api.post('/orders/', data),
  updateOrder: (id: number, data: any) => api.put(`/orders/${id}`, data),
  getTables: () => api.get('/orders/tables/'),
  getTable: (id: number) => api.get(`/orders/tables/${id}`),
  updateTableStatus: (id: number, status: string) => api.put(`/orders/tables/${id}/status`, { status }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentOrders: () => api.get('/dashboard/recent-orders'),
};

export default api; 