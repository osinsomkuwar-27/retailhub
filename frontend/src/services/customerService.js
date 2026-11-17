import api from './api';

export const customerService = {
  // Products
  getProducts: async (params = {}) => {
    const response = await api.get('/products', { params });
    return response.data;
  },

  getProductById: async (id) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get('/products/categories');
    return response.data;
  },

  // Shopping Cart
  getCart: async () => {
    const response = await api.get('/cart');
    return response.data;
  },

  addToCart: async (productId, quantity = 1) => {
    const response = await api.post('/cart/items', { productId, quantity });
    return response.data;
  },

  updateCartItem: async (productId, quantity) => {
    const response = await api.put(`/cart/items/${productId}`, { quantity });
    return response.data;
  },

  removeCartItem: async (productId) => {
    const response = await api.delete(`/cart/items/${productId}`);
    return response.data;
  },

  clearCart: async () => {
    const response = await api.delete('/cart');
    return response.data;
  },

  // Orders
  checkout: async (payload) => {
    const response = await api.post('/orders/checkout', payload);
    return response.data;
  },

  getMyOrders: async () => {
    const response = await api.get('/orders');
    return response.data;
  },

  getOrderById: async (id) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
  },

  cancelOrder: async (id, reason) => {
    const response = await api.patch(`/orders/${id}/cancel`, { reason });
    return response.data;
  },

  // Payments (Stage 5)
  processPayment: async (payload) => {
    const response = await api.post('/payments/process', payload);
    return response.data;
  },

  getPaymentHistory: async () => {
    const response = await api.get('/payments');
    return response.data;
  },

  getPaymentByOrderId: async (orderId) => {
    const response = await api.get(`/payments/order/${orderId}`);
    return response.data;
  },

  // Product Reviews (Stage 6)
  getProductReviews: async (productId, params = {}) => {
    const response = await api.get(`/reviews/product/${productId}`, { params });
    return response.data;
  },

  checkReviewEligibility: async (productId) => {
    const response = await api.get(`/reviews/product/${productId}/eligibility`);
    return response.data;
  },

  submitReview: async (payload) => {
    const response = await api.post('/reviews', payload);
    return response.data;
  },

  updateReview: async (id, payload) => {
    const response = await api.put(`/reviews/${id}`, payload);
    return response.data;
  },

  deleteReview: async (id) => {
    const response = await api.delete(`/reviews/${id}`);
    return response.data;
  },

  getMyReviews: async () => {
    const response = await api.get('/reviews/my-reviews');
    return response.data;
  },

  // Auth
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    if (response.data?.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    if (response.data?.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  updateProfile: async (data) => {
    const response = await api.put('/auth/profile', data);
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch (_) {
      return null;
    }
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },
};

export default customerService;
