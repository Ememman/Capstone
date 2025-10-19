import express from "express";
import Product from "../models/Product.js";
import {
  optionalAuth,
  authMiddleware,
  customerOnly,
  staffOnly,
} from "../middleware/auth.js";

const router = express.Router();

// GET /api/products - Get all products
router.get("/", optionalAuth, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: products.length,
      data: products,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// GET /api/products/category/:category - Get products by category
router.get("/category/:category", optionalAuth, async (req, res) => {
  try {
    const { category } = req.params;
    const products = await Product.find({
      category: { $regex: new RegExp(category, "i") },
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: products.length,
      category: category,
      data: products,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// GET /api/products/categories - Get all unique categories
router.get("/categories", optionalAuth, async (req, res) => {
  try {
    const categories = await Product.distinct("category");
    res.json({
      success: true,
      count: categories.length,
      data: categories,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// GET /api/products/:id - Get product by ID
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// POST /api/products/:id/purchase - Purchase a product (requires login)
router.post("/:id/purchase", authMiddleware, customerOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity = 1 } = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check stock availability
    if (!product.inStock) {
      return res.status(400).json({
        success: false,
        message: "Product is out of stock",
      });
    }

    // Here you would typically process the purchase
    // For now, just return success with purchase details
    res.json({
      success: true,
      message: "Product purchase initiated",
      data: {
        product,
        quantity,
        totalPrice: product.price * quantity,
        customer: {
          _id: req.user._id,
          username: req.user.username,
          email: req.user.email,
        },
      },
      nextStep: "Please proceed to payment",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error processing purchase",
      error: error.message,
    });
  }
});

// POST /api/products - Create new product (staff only)
router.post("/", authMiddleware, staffOnly, async (req, res) => {
  try {
    const product = new Product(req.body);
    const savedProduct = await product.save();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: savedProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(400).json({
      success: false,
      message: "Error creating product",
      error: error.message,
    });
  }
});

// PUT /api/products/:id - Update product (staff only)
router.put("/:id", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(400).json({
      success: false,
      message: "Error updating product",
      error: error.message,
    });
  }
});

// DELETE /api/products/:id - Delete product (staff only)
router.delete("/:id", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
      data: deletedProduct,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

export default router;
