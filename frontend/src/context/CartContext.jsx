import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import customerService from '../services/customerService';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshCart = useCallback(async () => {
    if (!customerService.isAuthenticated()) {
      setCart(null);
      return;
    }
    try {
      setLoading(true);
      const data = await customerService.getCart();
      setCart(data?.cart || null);
      setError(null);
    } catch (err) {
      if (err.response?.status === 401) {
        customerService.logout();
        setCart(null);
      } else {
        setError(err.response?.data?.message || 'Failed to load cart');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = async (productId, quantity = 1) => {
    if (!customerService.isAuthenticated()) {
      return { success: false, requireAuth: true };
    }
    try {
      const data = await customerService.addToCart(productId, quantity);
      setCart(data?.cart || null);
      return { success: true, message: data.message };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to add item to cart';
      return { success: false, message, stock: err.response?.data?.availableStock };
    }
  };

  const updateQuantity = async (productId, quantity) => {
    try {
      const data = await customerService.updateCartItem(productId, quantity);
      setCart(data?.cart || null);
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to update quantity';
      return { success: false, message, stock: err.response?.data?.availableStock };
    }
  };

  const removeItem = async (productId) => {
    try {
      const data = await customerService.removeCartItem(productId);
      setCart(data?.cart || null);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const clearCart = async () => {
    try {
      const data = await customerService.clearCart();
      setCart(data?.cart || { items: [], subtotal: 0, total: 0, totalItems: 0 });
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const cartCount = cart?.totalItems || 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        cartCount,
        loading,
        error,
        refreshCart,
        addToCart,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
