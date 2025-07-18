import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import { RestaurantProvider } from './contexts/RestaurantContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MealPeriodProvider } from './contexts/MealPeriodContext';
import Dashboard from './pages/Dashboard';
import Menu from './pages/Menu';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import Modifiers from './pages/Modifiers';
import EditOrder from './pages/EditOrder';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MealPeriodProvider>
          <BrowserRouter>
            <RestaurantProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/menu" element={<Menu />} />
                  <Route path="/modifiers" element={<Modifiers />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/orders/:id/edit" element={<EditOrder />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </RestaurantProvider>
          </BrowserRouter>
        </MealPeriodProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App; 