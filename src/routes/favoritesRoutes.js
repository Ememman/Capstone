// routes/favoritesRoutes.js
import express from "express";
import Favorite from "../models/Favorites.js";
import Product from "../models/Product.js";
import { authMiddleware, customerOnly } from "../middleware/auth.js";

const router = express.Router();

// GET /api/favorites - Get all favorites for logged-in user
router.get("/", authMiddleware, customerOnly, async (req, res) => {
  try {
    console.log("📋 Fetching favorites for user:", req.user._id);

    const favorites = await Favorite.find({ userId: req.user._id })
      .populate("itemId")
      .sort({ createdAt: -1 });

    // Filter only product favorites and transform to match frontend expectations
    const productFavorites = favorites
      .filter((fav) => fav.itemType === "Product") // ✅ Changed to "Product" (capitalized)
      .map((fav) => ({
        _id: fav._id,
        userId: fav.userId,
        productId: fav.itemId,
        addedAt: fav.createdAt,
      }));

    console.log("✅ Favorites fetched:", productFavorites.length);

    res.json({
      success: true,
      count: productFavorites.length,
      data: productFavorites,
    });
  } catch (error) {
    console.error("❌ Error fetching favorites:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching favorites",
      error: error.message,
    });
  }
});

// POST /api/favorites/add - Add product to favorites
router.post("/add", authMiddleware, customerOnly, async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    console.log("➕ Adding to favorites:", { userId, productId });

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if already in favorites
    const existingFavorite = await Favorite.findOne({
      userId,
      itemType: "Product", // ✅ Changed to "Product" (capitalized)
      itemId: productId,
    });

    if (existingFavorite) {
      return res.status(400).json({
        success: false,
        message: "Product already in favorites",
      });
    }

    // Create new favorite
    const favorite = new Favorite({
      userId: userId,
      itemType: "Product", // ✅ Changed to "Product" (capitalized)
      itemId: productId,
    });

    await favorite.save();
    console.log("✅ Saved with itemId/itemType structure");

    // Populate product data before sending response
    await favorite.populate("itemId");

    const response = {
      _id: favorite._id,
      userId: favorite.userId,
      productId: favorite.itemId,
      addedAt: favorite.createdAt,
    };

    console.log("✅ Added to favorites:", favorite._id);

    res.status(201).json({
      success: true,
      message: "Product added to favorites",
      data: response,
    });
  } catch (error) {
    console.error("❌ Error adding to favorites:", error);
    console.error("Error details:", error.message);
    res.status(500).json({
      success: false,
      message: "Error adding to favorites",
      error: error.message,
    });
  }
});

// DELETE /api/favorites/remove/:favoriteId - Remove from favorites
router.delete(
  "/remove/:favoriteId",
  authMiddleware,
  customerOnly,
  async (req, res) => {
    try {
      const { favoriteId } = req.params;
      const userId = req.user._id;

      console.log("🗑️ Removing from favorites:", { userId, favoriteId });

      if (!favoriteId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: "Invalid favorite ID format",
        });
      }

      const favorite = await Favorite.findOneAndDelete({
        _id: favoriteId,
        userId: userId,
      });

      if (!favorite) {
        return res.status(404).json({
          success: false,
          message: "Favorite not found",
        });
      }

      console.log("✅ Removed from favorites:", favoriteId);

      res.json({
        success: true,
        message: "Product removed from favorites",
        data: favorite,
      });
    } catch (error) {
      console.error("❌ Error removing from favorites:", error);
      res.status(500).json({
        success: false,
        message: "Error removing from favorites",
        error: error.message,
      });
    }
  }
);

// GET /api/favorites/check/:productId - Check if product is in favorites
router.get(
  "/check/:productId",
  authMiddleware,
  customerOnly,
  async (req, res) => {
    try {
      const { productId } = req.params;
      const userId = req.user._id;

      console.log("🔍 Checking favorite status:", { userId, productId });

      if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID format",
        });
      }

      const favorite = await Favorite.findOne({
        userId,
        itemType: "Product", // ✅ Changed to "Product" (capitalized)
        itemId: productId,
      });

      res.json({
        success: true,
        isFavorite: !!favorite,
        favoriteId: favorite?._id,
      });
    } catch (error) {
      console.error("❌ Error checking favorite status:", error);
      res.status(500).json({
        success: false,
        message: "Error checking favorite status",
        error: error.message,
      });
    }
  }
);

export default router;
