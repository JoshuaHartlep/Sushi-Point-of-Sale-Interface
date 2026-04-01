import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ordersApi, Order, OrderCreate } from '../services/api';

export interface CartItem {
  menuItemId: number;
  name: string;
  price: number; // always the a la carte price; display as $0 for AYCE
  ayceSurcharge: number; // extra charge per item when order is AYCE
  quantity: number;
  notes?: string; // optional customer note (e.g. "no wasabi")
}

interface CustomerOrderContextType {
  // session info
  tableId: number | null;
  orderId: number | null;
  isAyce: boolean;
  partySize: number;
  mealPeriod: 'LUNCH' | 'DINNER';
  aycePrice: number; // flat price per person for current meal period

  // local cart (pre-submission)
  cart: CartItem[];
  totalItemCount: number;
  cartSubtotal: number; // 0 when AYCE

  // post-submission state
  lastSubmittedOrder: Order | null;
  lastSubmittedCart: CartItem[];

  // loading/error
  isLoading: boolean;
  submitError: string | null;

  // actions
  setupOrder: (tableId: number, isAyce: boolean, partySize: number, mealPeriod: 'LUNCH' | 'DINNER', aycePrice: number) => Promise<void>;
  addToCart: (menuItemId: number, name: string, price: number, ayceSurcharge?: number, notes?: string) => void;
  updateQty: (menuItemId: number, quantity: number) => void;
  removeFromCart: (menuItemId: number) => void;
  submitOrder: () => Promise<void>;
  resetAfterSubmit: () => void;
}

const CustomerOrderContext = createContext<CustomerOrderContextType | null>(null);

export function CustomerOrderProvider({ children }: { children: ReactNode }) {
  const [tableId, setTableId] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [isAyce, setIsAyce] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [mealPeriod, setMealPeriod] = useState<'LUNCH' | 'DINNER'>('LUNCH');
  const [aycePrice, setAycePrice] = useState(0);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<Order | null>(null);
  const [lastSubmittedCart, setLastSubmittedCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setupOrder = useCallback(async (
    tId: number,
    ayce: boolean,
    size: number,
    period: 'LUNCH' | 'DINNER',
    price: number,
  ) => {
    setIsLoading(true);
    try {
      const orderData: OrderCreate = {
        table_id: tId,
        status: 'pending',
        ayce_order: ayce,
        items: [],
        notes: `Party of ${size}`,
      };
      const newOrder = await ordersApi.create(orderData);
      setTableId(tId);
      setOrderId(newOrder.id);
      setIsAyce(ayce);
      setPartySize(size);
      setMealPeriod(period);
      setAycePrice(price);
      setCart([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add one unit of an item to the local cart; also updates the note if provided
  const addToCart = useCallback((menuItemId: number, name: string, price: number, ayceSurcharge = 0, notes?: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === menuItemId);
      if (existing) {
        return prev.map(i =>
          i.menuItemId === menuItemId
            ? { ...i, quantity: i.quantity + 1, ayceSurcharge, ...(notes !== undefined && { notes }) }
            : i
        );
      }
      return [...prev, { menuItemId, name, price, ayceSurcharge, quantity: 1, notes }];
    });
  }, []);

  const updateQty = useCallback((menuItemId: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(i => i.menuItemId !== menuItemId));
    } else {
      setCart(prev =>
        prev.map(i => (i.menuItemId === menuItemId ? { ...i, quantity } : i))
      );
    }
  }, []);

  const removeFromCart = useCallback((menuItemId: number) => {
    setCart(prev => prev.filter(i => i.menuItemId !== menuItemId));
  }, []);

  // Send all cart items to the API at once
  const submitOrder = useCallback(async () => {
    if (!orderId || cart.length === 0) return;
    setIsLoading(true);
    setSubmitError(null);
    try {
      const snapshot = [...cart]; // capture names/prices before clearing
      for (const item of cart) {
        await ordersApi.addItem(orderId, {
          menu_item_id: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes,
        });
      }
      const updated = await ordersApi.getById(orderId);
      setLastSubmittedOrder(updated);
      setLastSubmittedCart(snapshot);
      setCart([]);
    } catch (e) {
      setSubmitError('Failed to place order. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId, cart]);

  const resetAfterSubmit = useCallback(() => {
    setLastSubmittedOrder(null);
  }, []);

  const totalItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = isAyce
    ? cart.reduce((sum, i) => sum + i.ayceSurcharge * i.quantity, 0)
    : cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CustomerOrderContext.Provider value={{
      tableId, orderId, isAyce, partySize, mealPeriod, aycePrice,
      cart, totalItemCount, cartSubtotal,
      lastSubmittedOrder, lastSubmittedCart, isLoading, submitError,
      setupOrder, addToCart, updateQty, removeFromCart, submitOrder, resetAfterSubmit,
    }}>
      {children}
    </CustomerOrderContext.Provider>
  );
}

export function useCustomerOrder() {
  const ctx = useContext(CustomerOrderContext);
  if (!ctx) throw new Error('useCustomerOrder must be used within CustomerOrderProvider');
  return ctx;
}
