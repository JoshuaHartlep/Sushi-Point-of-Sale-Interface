import { createContext, useContext, useState, ReactNode } from 'react';

interface RestaurantContextType {
  restaurantName: string;
  setRestaurantName: (name: string) => void;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [restaurantName, setRestaurantName] = useState('Sushi API');

  return (
    <RestaurantContext.Provider value={{ restaurantName, setRestaurantName }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const context = useContext(RestaurantContext);
  if (context === undefined) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
} 