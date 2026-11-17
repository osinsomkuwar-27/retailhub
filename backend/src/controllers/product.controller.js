const productBridge = require('../services/productBridge.service');

/**
 * @desc    Fetch products with search, filtering, sorting and pagination
 * @route   GET /api/products
 * @access  Public
 */
const getProducts = async (req, res) => {
  try {
    const { search, category, minPrice, maxPrice, inStock, sortBy, page, limit } = req.query;

    const data = await productBridge.listProducts({
      search,
      category,
      minPrice,
      maxPrice,
      inStock,
      sortBy,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve products',
      error: error.message,
    });
  }
};

/**
 * @desc    Fetch single product details by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productBridge.getProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve product details',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all distinct product categories
 * @route   GET /api/products/categories
 * @access  Public
 */
const getCategories = async (req, res) => {
  try {
    const categories = await productBridge.getCategories();
    res.status(200).json({
      success: true,
      categories: categories.filter(Boolean),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve categories',
      error: error.message,
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  getCategories,
};
