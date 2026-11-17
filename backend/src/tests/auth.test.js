const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { protect, authorize } = require('../middleware/auth.middleware');
const User = require('../models/User');
const authController = require('../controllers/auth.controller');
const shared = require('../utils/intelligence/shared');

describe('Stage 1: Authentication & Customer Management Tests', () => {
  const secret = process.env.JWT_SECRET || 'retailsync_jwt_secret_key_2026';

  describe('User Model & Methods', () => {
    test('generateAuthToken produces valid JWT with id, role, and email', () => {
      const mockUser = new User({
        name: 'Jane Customer',
        email: 'jane@example.com',
        role: 'CUSTOMER',
      });
      const token = mockUser.generateAuthToken();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, secret);
      expect(decoded.id).toBe(mockUser._id.toString());
      expect(decoded.role).toBe('CUSTOMER');
      expect(decoded.email).toBe('jane@example.com');
    });

    test('matchPassword accurately validates hashed password', async () => {
      const plain = 'StrongPass123';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(plain, salt);

      const mockUser = new User({
        name: 'Test Customer',
        email: 'test@example.com',
        password: hash,
      });

      const isMatch = await mockUser.matchPassword(plain);
      const isMismatch = await mockUser.matchPassword('WrongPass');

      expect(isMatch).toBe(true);
      expect(isMismatch).toBe(false);
    });
  });

  describe('Auth Middleware (Person 3 Import Contract Compatibility)', () => {
    test('shared.js correctly imports protect and authorize from auth.middleware.js', () => {
      expect(typeof shared.protect).toBe('function');
      expect(typeof shared.authorize).toBe('function');
    });

    test('protect rejects requests without Authorization header', async () => {
      const req = { headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Not authorized, no token provided',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('protect rejects invalid tokens', async () => {
      const req = { headers: { authorization: 'Bearer invalid.token.signature' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Not authorized, token verification failed',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('authorize middleware allows authorized roles and blocks unauthorized roles', () => {
      const adminMiddleware = authorize('ADMIN', 'WAREHOUSE_MANAGER');

      // Test 1: CUSTOMER role should be forbidden (403)
      const reqCustomer = { user: { role: 'CUSTOMER' } };
      const resCustomer = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const nextCustomer = jest.fn();

      adminMiddleware(reqCustomer, resCustomer, nextCustomer);
      expect(resCustomer.status).toHaveBeenCalledWith(403);
      expect(nextCustomer).not.toHaveBeenCalled();

      // Test 2: ADMIN role should pass (next called)
      const reqAdmin = { user: { role: 'ADMIN' } };
      const resAdmin = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const nextAdmin = jest.fn();

      adminMiddleware(reqAdmin, resAdmin, nextAdmin);
      expect(nextAdmin).toHaveBeenCalled();

      // Test 3: WAREHOUSE_MANAGER role should pass
      const reqManager = { user: { role: 'WAREHOUSE_MANAGER' } };
      const resManager = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const nextManager = jest.fn();

      adminMiddleware(reqManager, resManager, nextManager);
      expect(nextManager).toHaveBeenCalled();
    });
  });

  describe('Customer Auth Controller Logic', () => {
    test('register rejects missing required fields', async () => {
      const req = { body: { name: 'Customer', email: '' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Name, email, and password are required',
        })
      );
    });

    test('register rejects passwords shorter than 6 characters', async () => {
      const req = { body: { name: 'Customer', email: 'test@example.com', password: '123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Password must be at least 6 characters long',
        })
      );
    });

    test('login rejects missing credentials', async () => {
      const req = { body: { email: 'test@example.com' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await authController.login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Please provide both email and password',
        })
      );
    });
  });
});
