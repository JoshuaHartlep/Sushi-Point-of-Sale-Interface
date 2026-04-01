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
  image_url?: string | null;
  image_position_x?: number;
  image_position_y?: number;
  image_zoom?: number;
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
  total_amount: number;
  created_at: string;
  ayce_order: boolean;
  notes?: string;
  items?: OrderItem[];
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

export interface TableData {
  id: number;
  number: number;
  capacity: number;
  status: TableStatus;
  party_size?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'completed';

export interface OrderCreate {
  table_id: number;
  status: OrderStatus;
  ayce_order: boolean;
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

export interface Settings {
  id: number;
  restaurant_name: string;
  timezone: string;
  current_meal_period: 'LUNCH' | 'DINNER';
  ayce_lunch_price: string | number; // API returns string, but can be number
  ayce_dinner_price: string | number; // API returns string, but can be number
  created_at: string;
  updated_at?: string;
}

export interface SettingsUpdate {
  restaurant_name?: string;
  timezone?: string;
  current_meal_period?: 'LUNCH' | 'DINNER';
  ayce_lunch_price?: string | number;
  ayce_dinner_price?: string | number;
}

export interface MenuItemImage {
  id: number;
  menu_item_id: number;
  menu_item_name: string | null;
  image_url: string;
  uploaded_at: string;
  reviewed_at: string | null;
  report_count: number;
  status: 'pending' | 'approved' | 'rejected';
}

// API origin (no trailing slash) — used for constructing image URLs in components.
// Set VITE_API_URL in .env.local (localhost) or run with --mode network (.env.network).
export const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const resolveImageUrl = (imageUrl?: string | null): string | null => {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_ORIGIN}${imageUrl}`;
};

export const getMenuImageStyle = (item: Pick<MenuItem, 'image_position_x' | 'image_position_y' | 'image_zoom'>) => ({
  objectPosition: `${item.image_position_x ?? 50}% ${item.image_position_y ?? 50}%`,
  transform: `scale(${item.image_zoom ?? 1})`,
  transformOrigin: 'center',
});

const API_BASE_URL = `${API_ORIGIN}/api/v1`;

// Log active API URL in development so you know which backend you're hitting.
if (import.meta.env.DEV) {
  console.log('[API] Base URL:', API_BASE_URL);
}

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
  create: (data: OrderCreate): Promise<Order> => 
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
  addItem: (orderId: number, data: { menu_item_id: number; quantity: number; notes?: string }): Promise<Order> =>
    api.post(`/orders/${orderId}/items/`, { items: [data] }).then(res => res.data),
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
  uploadImage: (id: number, file: File): Promise<MenuItem> => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/menu/menu-items/${id}/upload-image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },
  deleteImage: (id: number): Promise<MenuItem> =>
    api.delete(`/menu/menu-items/${id}/image`).then(res => res.data),
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

// Settings API
export const settingsApi = {
  get: async (): Promise<Settings> => {
    const response = await api.get('/settings/');
    return response.data;
  },
  update: async (data: SettingsUpdate): Promise<Settings> => {
    const response = await api.patch('/settings/', data);
    return response.data;
  },
  updateMealPeriod: async (mealPeriod: 'LUNCH' | 'DINNER'): Promise<Settings> => {
    const response = await api.patch(`/settings/meal-period?meal_period=${mealPeriod}`);
    return response.data;
  },
};

// Tables API
export const tablesApi = {
  getAll: (): Promise<TableData[]> => api.get('/orders/tables/').then(res => res.data),
  getById: (id: number): Promise<TableData> => api.get(`/orders/tables/${id}`).then(res => res.data),
  create: (data: { number: number; capacity: number }): Promise<TableData> =>
    api.post('/orders/tables/', data).then(res => res.data),
  update: (id: number, data: { number?: number; capacity?: number }): Promise<TableData> =>
    api.patch(`/orders/tables/${id}`, data).then(res => res.data),
  updateStatus: (id: number, status: TableStatus): Promise<TableData> =>
    api.put(`/orders/tables/${id}/status`, null, { params: { status } }).then(res => res.data),
  delete: (id: number): Promise<void> => api.delete(`/orders/tables/${id}`).then(res => res.data),
};

// User-generated menu item images API
export const menuItemImagesApi = {
  // customer-facing: returns only approved images
  getImages: (menuItemId: number): Promise<MenuItemImage[]> =>
    api.get(`/menu-items/${menuItemId}/images`).then(res => res.data),
  uploadImage: (menuItemId: number, file: File): Promise<MenuItemImage> => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/menu-items/${menuItemId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },
  reportImage: (imageId: number, reason?: string): Promise<any> =>
    api.post(`/images/${imageId}/report`, { reason }).then(res => res.data),
  deleteImage: (imageId: number): Promise<void> =>
    api.delete(`/images/${imageId}`).then(res => res.data),
  // manager-facing: images awaiting moderation
  getPending: (): Promise<MenuItemImage[]> =>
    api.get('/images/pending').then(res => res.data),
  getReported: (): Promise<MenuItemImage[]> =>
    api.get('/images/reported').then(res => res.data),
  // approve an image (rejection = delete)
  approve: (imageId: number): Promise<MenuItemImage> =>
    api.patch(`/images/${imageId}/status`, { status: 'approved' }).then(res => res.data),
};

// ---------------------------------------------------------------------------
// Analytics API — "The Lens"
// ---------------------------------------------------------------------------

export interface SummaryGroup {
  group_key: string;
  order_count: number;
  total_revenue: number;
  avg_order_value: number;
}

export interface AnalyticsSummary {
  total_revenue: number;
  order_count: number;
  avg_order_value: number;
  groups: SummaryGroup[] | null;
}

// DrillRow uses a generic metadata bag instead of per-field IDs.
// metadata keys: item_id, category_id, table_id, order_type — whatever
// the backend populates for the current dimension. Frontend reads this
// to accumulate filters when the user drills deeper.
export interface DrillRow {
  label: string;
  value: number;
  order_count: number;
  metadata: Record<string, number | string>;
}

export interface DrillResponse {
  metric: string;
  dimension: string;
  rows: DrillRow[];
  total: number;
}

export interface CompareRow {
  label: string;
  a_value: number;
  b_value: number;
  delta: number;
  pct_change: number | null;
}

export interface CompareResponse {
  dimension: string;
  metric: string;
  rows: CompareRow[];
}

export interface DecomposeResponse {
  total: AnalyticsSummary;
  timeseries: SummaryGroup[];
}

export type AnalyticsMetric = 'revenue' | 'order_count' | 'avg_order_value' | 'item_count';
export type AnalyticsDimension = 'item' | 'category' | 'day_of_week' | 'hour' | 'order_type' | 'table';
export type AnalyticsGroupBy = 'day' | 'week' | 'day_of_week' | 'hour' | 'item' | 'category' | 'order_type';

// Shared filter params accepted by summary, drill, decompose
export interface AnalyticsFilterParams {
  start_date?: string;
  end_date?: string;
  meal_period?: string;
  order_type?: string;
  category_id?: number;
  item_id?: number;
  table_id?: number;
}

export interface SummaryParams extends AnalyticsFilterParams {
  group_by?: AnalyticsGroupBy;
}

export interface DrillParams extends AnalyticsFilterParams {
  metric?: AnalyticsMetric;
  dimension?: AnalyticsDimension;
}

export interface CompareParams {
  metric?: AnalyticsMetric;
  dimension?: AnalyticsDimension;
  // Cohort A
  a_start_date?: string;
  a_end_date?: string;
  a_meal_period?: string;
  a_order_type?: string;
  // Cohort B
  b_start_date?: string;
  b_end_date?: string;
  b_meal_period?: string;
  b_order_type?: string;
  // Shared dimensional filters
  category_id?: number;
  item_id?: number;
}

export interface Signal {
  metric: string;
  date: string;
  value: number;
  mean: number;
  z_score: number;
  severity: 'high' | 'medium';
  direction: 'increase' | 'decrease';
  message: string;
}

export interface SignalParams {
  window_days?: number;
  meal_period?: string;
  order_type?: string;
}

export interface HourOrderItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface HourOrder {
  id: number;
  table_number: number | null;
  status: string;
  total_amount: number;
  ayce_order: boolean;
  created_at: string;
  items: HourOrderItem[];
}

export interface HourOrdersParams {
  start_date?: string;
  end_date?: string;
  hour: number;
  meal_period?: string;
}

export const analyticsApi = {
  getSummary: (params: SummaryParams): Promise<AnalyticsSummary> =>
    api.get('/analytics/summary', { params }).then(r => r.data),

  getDrill: (params: DrillParams): Promise<DrillResponse> =>
    api.get('/analytics/drill', { params }).then(r => r.data),

  getDecompose: (params: AnalyticsFilterParams): Promise<DecomposeResponse> =>
    api.get('/analytics/decompose', { params }).then(r => r.data),

  getCompare: (params: CompareParams): Promise<CompareResponse> =>
    api.get('/analytics/compare', { params }).then(r => r.data),

  getSignals: (params?: SignalParams): Promise<Signal[]> =>
    api.get('/analytics/signals', { params }).then(r => r.data),

  getHourOrders: (params: HourOrdersParams): Promise<HourOrder[]> =>
    api.get('/analytics/orders', { params }).then(r => r.data),
};

export default api;