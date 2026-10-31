import express from "express";
import Product from "../models/Product.js";
import Rating from "../models/Rating.js";
import {
  optionalAuth,
  authMiddleware,
  customerOnly,
  staffOnly,
} from "../middleware/auth.js";

const router = express.Router();

// GET /api/products - Get all products with filtering & sorting
router.get("/", optionalAuth, async (req, res) => {
  try {
    const {
      sortBy,
      sortOrder,
      category,
      minRating,
      inStock,
      minPrice,
      maxPrice,
      page,
      limit,
    } = req.query;

    let query = {};
    let sortObj = { createdAt: -1 };

    // Filter by category
    if (category && category !== "all") {
      query.category = { $regex: new RegExp(category, "i") };
    }

    // Filter by minimum rating
    if (minRating) {
      query["rating.average"] = { $gte: parseFloat(minRating) };
    }

    // Filter by stock availability
    if (inStock !== undefined && inStock !== "") {
      query.inStock = inStock === "true" || inStock === true;
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Handle sorting
    switch (sortBy) {
      case "price-low":
        sortObj = { price: 1 };
        break;
      case "price-high":
        sortObj = { price: -1 };
        break;
      case "rating":
        sortObj = { "rating.average": -1, "rating.totalRaters": -1 };
        break;
      case "name-asc":
        sortObj = { name: 1 };
        break;
      case "name-desc":
        sortObj = { name: -1 };
        break;
      case "newest":
        sortObj = { createdAt: -1 };
        break;
      case "popular":
        sortObj = { "rating.totalRaters": -1, "rating.average": -1 };
        break;
    }

    // Apply custom sort order if specified
    if (sortOrder === "asc" || sortOrder === "desc") {
      const direction = sortOrder === "asc" ? 1 : -1;
      const firstKey = Object.keys(sortObj)[0];
      if (firstKey) {
        sortObj[firstKey] = direction;
      }
    }

    let productsQuery = Product.find(query).sort(sortObj);

    if (page && limit) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      productsQuery = productsQuery.skip(skip).limit(parseInt(limit));
    }

    const products = await productsQuery;
    const totalCount = await Product.countDocuments(query);

    res.json({
      success: true,
      count: products.length,
      total: totalCount,
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

// GET /api/products/search - Smart full-text search with filters
router.get("/search", optionalAuth, async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, inStock, minRating, sortBy } = req.query;

    let query = {};

    if (q && q.trim()) {
      const searchRegex = new RegExp(q.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ];
    }

    if (category && category !== "all") {
      query.category = { $regex: new RegExp(category, "i") };
    }

    if (minRating) {
      query["rating.average"] = { $gte: parseFloat(minRating) };
    }

    if (inStock !== undefined && inStock !== "") {
      query.inStock = inStock === "true" || inStock === true;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    let sortObj = { createdAt: -1 };
    if (sortBy === "price-low") sortObj = { price: 1 };
    else if (sortBy === "price-high") sortObj = { price: -1 };
    else if (sortBy === "rating") sortObj = { "rating.average": -1, "rating.totalRaters": -1 };
    else if (sortBy === "popular") sortObj = { "rating.totalRaters": -1 };

    const products = await Product.find(query).sort(sortObj);

    res.json({
      success: true,
      query: q || "",
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({
      success: false,
      message: "Error searching products",
      error: error.message,
    });
  }
});

// GET /api/products/categories - Get all unique categories
router.get("/categories", optionalAuth, async (req, res) => {
  try {
    const categories = await Product.distinct("category");
    categories.sort();
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

// GET /api/products/category/:category - Get products by category
router.get("/category/:category", optionalAuth, async (req, res) => {
  try {
    const { category } = req.params;
    const { sortBy } = req.query;

    let sortObj = { createdAt: -1 };
    if (sortBy === "rating") {
      sortObj = { "rating.average": -1, "rating.totalRaters": -1 };
    } else if (sortBy === "price-low") {
      sortObj = { price: 1 };
    } else if (sortBy === "price-high") {
      sortObj = { price: -1 };
    }

    const products = await Product.find({
      category: { $regex: new RegExp(category, "i") },
    }).sort(sortObj);

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

// GET /api/products/featured/top-rated - Get top rated products
router.get("/featured/top-rated", optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const products = await Product.find({
      $or: [
        { "rating.average": { $gte: 4.0 }, "rating.totalRaters": { $gt: 0 } },
        { inStock: true },
      ],
    })
      .sort({ "rating.average": -1, "rating.totalRaters": -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
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
    console.error("Error fetching top rated products:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// GET /api/products/featured/recommendations - Smart recommendations
router.get("/featured/recommendations", optionalAuth, async (req, res) => {
  try {
    const { limit = 6, category } = req.query;
    let query = { inStock: true };

    if (category && category !== "all") {
      query.category = { $regex: new RegExp(category, "i") };
    }

    const recommended = await Product.find(query)
      .sort({ "rating.average": -1, price: 1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: recommended.length,
      data: recommended,
    });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recommendations",
      error: error.message,
    });
  }
});

// GET /api/products/featured - General featured products
router.get("/featured", optionalAuth, async (req, res) => {
  try {
    const { limit = 8 } = req.query;
    const products = await Product.find({ inStock: true })
      .sort({ "rating.average": -1, createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching featured products",
      error: error.message,
    });
  }
});

// GET /api/products/stats/overview - Product catalog summary stats
router.get("/stats/overview", optionalAuth, async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const inStockCount = await Product.countDocuments({ inStock: true });
    const outOfStockCount = totalProducts - inStockCount;
    const categories = await Product.distinct("category");

    res.json({
      success: true,
      data: {
        totalProducts,
        inStockCount,
        outOfStockCount,
        categoriesCount: categories.length,
        categories,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching product stats",
      error: error.message,
    });
  }
});

// GET /api/products/:id - Get product by ID (Must be after named routes!)
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

    // Update rating stats in case they're outdated
    await product.updateRatingStats();

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

// GET /api/products/:id/ratings - Get product ratings
router.get("/:id/ratings", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

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

    const skip = (page - 1) * limit;
    const query = {
      "ratedEntity.type": "product",
      "ratedEntity.id": id,
      status: "active",
    };

    if (rating) {
      query.rating = parseInt(rating);
    }

    const ratings = await Rating.find(query)
      .populate("rater", "username firstName profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments(query);

    // Update product rating stats
    await product.updateRatingStats();

    res.json({
      success: true,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          rating: product.rating,
        },
        ratings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching product ratings:", error);
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

// POST /api/products - Create new product (staff only) with real-time broadcast
router.post("/", authMiddleware, staffOnly, async (req, res) => {
  try {
    const product = new Product(req.body);
    const savedProduct = await product.save();

    // Real-time broadcast to connected clients
    if (req.io) {
      req.io.emit("product-update", {
        action: "created",
        product: savedProduct,
      });
      req.io.to("admin-dashboard").emit("dashboard-update", {
        type: "inventory",
        action: "product-created",
        data: savedProduct,
        timestamp: new Date().toISOString(),
      });
    }

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

// PUT /api/products/:id - Update product (staff only) with real-time broadcast
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

    // Real-time broadcast to connected clients
    if (req.io) {
      req.io.emit("product-update", {
        action: "updated",
        product: updatedProduct,
      });
      req.io.to("admin-dashboard").emit("dashboard-update", {
        type: "inventory",
        action: "product-updated",
        data: updatedProduct,
        timestamp: new Date().toISOString(),
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

    // Real-time broadcast
    if (req.io) {
      req.io.emit("product-update", {
        action: "deleted",
        productId: id,
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

// PUT /api/products/:id/update-rating - Update rating stats manually
router.put("/:id/update-rating", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await product.updateRatingStats();

    res.json({
      success: true,
      message: "Product rating stats updated successfully",
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating product rating stats",
      error: error.message,
    });
  }
});

export default router;
