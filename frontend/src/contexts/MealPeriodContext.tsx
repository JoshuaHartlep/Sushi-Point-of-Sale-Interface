import React, { createContext, useContext, useEffect, useState } from 'react';

type MealPeriod = 'lunch' | 'dinner';

interface MealPeriodContextType {
  mealPeriod: MealPeriod;
  isDinner: boolean;
  isLunch: boolean;
  switchToLunch: () => void;
  switchToDinner: () => void;
  toggleMealPeriod: () => void;
}

const MealPeriodContext = createContext<MealPeriodContextType | undefined>(undefined);

export const useMealPeriod = () => {
  const context = useContext(MealPeriodContext);
  if (context === undefined) {
    throw new Error('useMealPeriod must be used within a MealPeriodProvider');
  }
  return context;
};

interface MealPeriodProviderProps {
  children: React.ReactNode;
}

export const MealPeriodProvider: React.FC<MealPeriodProviderProps> = ({ children }) => {
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(() => {
    const savedPeriod = localStorage.getItem('sushi-pos-meal-period');
    return (savedPeriod as MealPeriod) || 'lunch';
  });

  const switchToLunch = () => {
    setMealPeriod('lunch');
    localStorage.setItem('sushi-pos-meal-period', 'lunch');
  };

  const switchToDinner = () => {
    setMealPeriod('dinner');
    localStorage.setItem('sushi-pos-meal-period', 'dinner');
  };

  const toggleMealPeriod = () => {
    const newPeriod = mealPeriod === 'lunch' ? 'dinner' : 'lunch';
    setMealPeriod(newPeriod);
    localStorage.setItem('sushi-pos-meal-period', newPeriod);
  };

  const value = {
    mealPeriod,
    isDinner: mealPeriod === 'dinner',
    isLunch: mealPeriod === 'lunch',
    switchToLunch,
    switchToDinner,
    toggleMealPeriod,
  };

  return (
    <MealPeriodContext.Provider value={value}>
      {children}
    </MealPeriodContext.Provider>
  );
};