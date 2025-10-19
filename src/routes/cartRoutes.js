// routes/cartRoutes.js
import express from "express";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import { authMiddleware, customerOnly } from "../middleware/auth.js";

const router = express.Router();

// GET /api/cart - Get user's cart
router.get("/", authMiddleware, customerOnly, async (req, res) => {
  try {
    console.log("🛒 Fetching cart for user:", req.user._id);

    let cart = await Cart.findOne({ userId: req.user._id }).populate(
      "items.productId"
    );

    // If cart doesn't exist, create a new one
    if (!cart) {
      cart = new Cart({
        userId: req.user._id,
        items: [],
        totalAmount: 0,
      });
      await cart.save();
    }

    // Calculate total amount
    let totalAmount = 0;
    cart.items.forEach((item) => {
      if (item.productId && item.productId.price) {
        totalAmount += item.productId.price * item.quantity;
      }
    });
    cart.totalAmount = totalAmount;
    await cart.save();

    console.log("✅ Cart fetched:", cart.items.length, "items");

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("❌ Error fetching cart:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cart",
      error: error.message,
    });
  }
});

// POST /api/cart/add - Add product to cart
router.post("/add", authMiddleware, customerOnly, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const userId = req.user._id;

    console.log("➕ Adding to cart:", { userId, productId, quantity });

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if product is in stock
    if (!product.inStock) {
      return res.status(400).json({
        success: false,
        message: "Product is out of stock",
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
        totalAmount: 0,
      });
    }

    // Check if product already in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (existingItemIndex > -1) {
      // Update quantity if product already in cart
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      cart.items.push({
        productId,
        quantity,
        addedAt: new Date(),
      });
    }

    // Calculate total amount
    await cart.populate("items.productId");
    let totalAmount = 0;
    cart.items.forEach((item) => {
      if (item.productId && item.productId.price) {
        totalAmount += item.productId.price * item.quantity;
      }
    });
    cart.totalAmount = totalAmount;

    await cart.save();

    console.log("✅ Added to cart");

    res.json({
      success: true,
      message: "Product added to cart",
      data: cart,
    });
  } catch (error) {
    console.error("❌ Error adding to cart:", error);
    res.status(500).json({
      success: false,
      message: "Error adding to cart",
      error: error.message,
    });
  }
});

// PUT /api/cart/update/:cartItemId - Update cart item quantity
router.put(
  "/update/:cartItemId",
  authMiddleware,
  customerOnly,
  async (req, res) => {
    try {
      const { cartItemId } = req.params;
      const { quantity } = req.body;
      const userId = req.user._id;

      console.log("🔄 Updating cart item:", { userId, cartItemId, quantity });

      if (quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be at least 1",
        });
      }

      // Find cart
      const cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      // Find item in cart
      const itemIndex = cart.items.findIndex(
        (item) => item._id.toString() === cartItemId
      );

      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Item not found in cart",
        });
      }

      // Update quantity
      cart.items[itemIndex].quantity = quantity;

      // Recalculate total amount
      await cart.populate("items.productId");
      let totalAmount = 0;
      cart.items.forEach((item) => {
        if (item.productId && item.productId.price) {
          totalAmount += item.productId.price * item.quantity;
        }
      });
      cart.totalAmount = totalAmount;

      await cart.save();

      console.log("✅ Cart item updated");

      res.json({
        success: true,
        message: "Cart item updated",
        data: cart,
      });
    } catch (error) {
      console.error("❌ Error updating cart item:", error);
      res.status(500).json({
        success: false,
        message: "Error updating cart item",
        error: error.message,
      });
    }
  }
);

// DELETE /api/cart/remove/:cartItemId - Remove item from cart
router.delete(
  "/remove/:cartItemId",
  authMiddleware,
  customerOnly,
  async (req, res) => {
    try {
      const { cartItemId } = req.params;
      const userId = req.user._id;

      console.log("🗑️ Removing from cart:", { userId, cartItemId });

      // Find cart
      const cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      // Remove item from cart
      cart.items = cart.items.filter(
        (item) => item._id.toString() !== cartItemId
      );

      // Recalculate total amount
      await cart.populate("items.productId");
      let totalAmount = 0;
      cart.items.forEach((item) => {
        if (item.productId && item.productId.price) {
          totalAmount += item.productId.price * item.quantity;
        }
      });
      cart.totalAmount = totalAmount;

      await cart.save();

      console.log("✅ Item removed from cart");

      res.json({
        success: true,
        message: "Item removed from cart",
        data: cart,
      });
    } catch (error) {
      console.error("❌ Error removing from cart:", error);
      res.status(500).json({
        success: false,
        message: "Error removing from cart",
        error: error.message,
      });
    }
  }
);

// DELETE /api/cart/clear - Clear entire cart
router.delete("/clear", authMiddleware, customerOnly, async (req, res) => {
  try {
    const userId = req.user._id;

    console.log("🗑️ Clearing cart for user:", userId);

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    console.log("✅ Cart cleared");

    res.json({
      success: true,
      message: "Cart cleared",
      data: cart,
    });
  } catch (error) {
    console.error("❌ Error clearing cart:", error);
    res.status(500).json({
      success: false,
      message: "Error clearing cart",
      error: error.message,
    });
  }
});

export default router;
