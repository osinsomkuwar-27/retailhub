const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const productBridge = require('../services/productBridge.service');

/**
 * Enriches cart items with fresh product details, current prices, and real stock.
 * Calculates server-side subtotals and grand totals.
 */
const enrichAndCalculateCart = async (cartDoc) => {
  if (!cartDoc || !cartDoc.items) {
    return {
      _id: cartDoc?._id,
      customer: cartDoc?.customer,
      items: [],
      subtotal: 0,
      total: 0,
      totalItems: 0,
      hasStockIssue: false,
    };
  }

  let subtotal = 0;
  let totalItems = 0;
  let hasStockIssue = false;

  const enrichedItems = await Promise.all(
    cartDoc.items.map(async (item) => {
      const product = await productBridge.getProductById(item.product);

      if (!product) {
        return {
          _id: item._id,
          productId: item.product,
          product: {
            _id: item.product,
            name: 'Unavailable Product',
            price: 0,
            stock: 0,
            isInStock: false,
          },
          quantity: item.quantity,
          unitPrice: 0,
          subtotal: 0,
          isAvailable: false,
          hasStockIssue: true,
          errorMessage: 'This product is no longer available.',
        };
      }

      const itemStock = product.stock || 0;
      const isStockSufficient = item.quantity <= itemStock;
      if (!isStockSufficient) {
        hasStockIssue = true;
      }

      const unitPrice = Number(product.price) || 0;
      const itemSubtotal = unitPrice * item.quantity;

      subtotal += itemSubtotal;
      totalItems += item.quantity;

      return {
        _id: item._id,
        productId: product._id,
        product: {
          _id: product._id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          price: unitPrice,
          images: product.images,
          stock: itemStock,
          isInStock: product.isInStock,
        },
        quantity: item.quantity,
        unitPrice,
        subtotal: itemSubtotal,
        isAvailable: true,
        hasStockIssue: !isStockSufficient,
        errorMessage: !isStockSufficient
          ? `Requested quantity (${item.quantity}) exceeds available stock (${itemStock}).`
          : null,
      };
    })
  );

  return {
    _id: cartDoc._id,
    customer: cartDoc.customer,
    items: enrichedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(subtotal * 100) / 100,
    totalItems,
    hasStockIssue,
  };
};

/**
 * @desc    Get authenticated customer's cart
 * @route   GET /api/cart
 * @access  Private (Customer)
 */
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ customer: req.user._id });
    if (!cart) {
      cart = await Cart.create({ customer: req.user._id, items: [] });
    }

    const calculatedCart = await enrichAndCalculateCart(cart);

    res.status(200).json({
      success: true,
      cart: calculatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve shopping cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Add product to cart or increase quantity
 * @route   POST /api/cart/items
 * @access  Private (Customer)
 */
const addItem = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid Product ID is required',
      });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive integer',
      });
    }

    const product = await productBridge.getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    let cart = await Cart.findOne({ customer: req.user._id });
    if (!cart) {
      cart = new Cart({ customer: req.user._id, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(
      (i) => i.product.toString() === productId.toString()
    );

    const currentQty = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
    const targetQty = currentQty + parsedQty;

    // Validate against real inventory stock
    if (targetQty > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Only ${product.stock} units available (you requested ${targetQty} in cart).`,
        availableStock: product.stock,
      });
    }

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity = targetQty;
    } else {
      cart.items.push({
        product: new mongoose.Types.ObjectId(String(productId)),
        quantity: targetQty,
      });
    }

    await cart.save();

    const calculatedCart = await enrichAndCalculateCart(cart);

    res.status(200).json({
      success: true,
      message: 'Product added to cart',
      cart: calculatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Update quantity of a specific item in the cart
 * @route   PUT /api/cart/items/:productId
 * @access  Private (Customer)
 */
const updateItemQuantity = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid Product ID is required',
      });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a non-negative integer',
      });
    }

    let cart = await Cart.findOne({ customer: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
      });
    }

    const itemIndex = cart.items.findIndex(
      (i) => i.product.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in your cart',
      });
    }

    // If quantity is 0, remove the item
    if (parsedQty === 0) {
      cart.items.splice(itemIndex, 1);
      await cart.save();
      const calculatedCart = await enrichAndCalculateCart(cart);
      return res.status(200).json({
        success: true,
        message: 'Item removed from cart',
        cart: calculatedCart,
      });
    }

    // Validate real stock
    const product = await productBridge.getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    if (parsedQty > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Only ${product.stock} units available (requested ${parsedQty}).`,
        availableStock: product.stock,
      });
    }

    cart.items[itemIndex].quantity = parsedQty;
    await cart.save();

    const calculatedCart = await enrichAndCalculateCart(cart);

    res.status(200).json({
      success: true,
      message: 'Cart item quantity updated',
      cart: calculatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update item quantity',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove a specific item from the cart
 * @route   DELETE /api/cart/items/:productId
 * @access  Private (Customer)
 */
const removeItem = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid Product ID is required',
      });
    }

    const cart = await Cart.findOne({ customer: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
      });
    }

    cart.items = cart.items.filter(
      (i) => i.product.toString() !== productId.toString()
    );

    await cart.save();

    const calculatedCart = await enrichAndCalculateCart(cart);

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      cart: calculatedCart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Clear all items in the customer's cart
 * @route   DELETE /api/cart
 * @access  Private (Customer)
 */
const clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ customer: req.user._id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      cart: {
        items: [],
        subtotal: 0,
        total: 0,
        totalItems: 0,
        hasStockIssue: false,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
      error: error.message,
    });
  }
};

module.exports = {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
  enrichAndCalculateCart,
};
