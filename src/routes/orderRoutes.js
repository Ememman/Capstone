import express from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { authMiddleware, customerOnly, staffOnly } from "../middleware/auth.js";

const router = express.Router();

// GET /api/orders - Get all orders (admin) or user's orders
router.get("/", authMiddleware, async (req, res) => {
  try {
    const query = {};

    // If customer, only show their orders
    if (req.user.role === "customer") {
      query.customer = req.user._id;
    }

    const { status, startDate, endDate } = req.query;

    // Add filters
    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const orders = await Order.find(query)
      .populate("customer", "username email phoneNumber")
      .populate("items.product", "name price image")
      .populate("payment")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
});

// GET /api/orders/:id - Get specific order
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "username email phoneNumber")
      .populate("items.product", "name price image description")
      .populate("payment");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user can access this order
    if (
      req.user.role === "customer" &&
      order.customer._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order",
      error: error.message,
    });
  }
});

// POST /api/orders/create - Create new order
router.post("/create", authMiddleware, customerOnly, async (req, res) => {
  try {
    const {
      items, // Array of { productId, quantity }
      deliveryType,
      deliveryAddress,
      contactNumber,
      specialInstructions,
      customerNotes,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order items are required",
      });
    }

    // Validate products and calculate pricing
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product with ID ${item.productId} not found`,
        });
      }

      if (!product.inStock) {
        return res.status(400).json({
          success: false,
          message: `Product "${product.name}" is out of stock`,
        });
      }

      const itemSubtotal = product.price * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
        subtotal: itemSubtotal,
      });
    }

    // Calculate shipping fee (simple logic - can be enhanced)
    const shippingFee = deliveryType === "delivery" ? 100 : 0;

    // Create order
    const order = new Order({
      customer: req.user._id,
      items: orderItems,
      subtotal,
      shippingFee,
      totalAmount: subtotal + shippingFee,
      deliveryInfo: {
        type: deliveryType || "pickup",
        address: deliveryAddress,
        contactNumber,
        specialInstructions,
      },
      customerNotes,
    });

    await order.save();

    // Populate the order for response
    await order.populate("items.product", "name price image");

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
      nextStep: "Please proceed to payment",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error creating order",
      error: error.message,
    });
  }
});

// PUT /api/orders/:id/cancel - Cancel order
router.put("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { cancellationReason } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user can cancel this order
    if (
      req.user.role === "customer" &&
      order.customer.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled at this time",
      });
    }

    order.status = "cancelled";
    order.cancellationReason = cancellationReason;
    order.cancelledAt = new Date();
    order.cancelledBy = req.user._id;

    await order.save();

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error cancelling order",
      error: error.message,
    });
  }
});

// PUT /api/orders/:id/status - Update order status (staff only)
router.put("/:id/status", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { status, notes, trackingNumber, courier, receivedBy } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update order status with tracking
    order.updateStatus(status, notes);

    // Add additional tracking info for shipped status
    if (status === "shipped" && trackingNumber) {
      order.tracking.shipped.trackingNumber = trackingNumber;
      order.tracking.shipped.courier = courier;
    }

    // Add received by info for delivered status
    if (status === "delivered" && receivedBy) {
      order.tracking.delivered.receivedBy = receivedBy;
    }

    if (notes) {
      order.adminNotes = notes;
    }

    await order.save();

    res.json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
});

// GET /api/orders/:id/tracking - Get order tracking information
router.get("/:id/tracking", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .select("orderNumber status tracking deliveryInfo")
      .populate("customer", "username");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user can access this order
    if (
      req.user.role === "customer" &&
      order.customer._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        tracking: order.tracking,
        estimatedDelivery: order.deliveryInfo.estimatedDelivery,
        actualDelivery: order.deliveryInfo.actualDelivery,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order tracking",
      error: error.message,
    });
  }
});

// GET /api/orders/stats/overview - Get order statistics (admin only)
router.get("/stats/overview", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await Order.getOrderStats(start, end);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order statistics",
      error: error.message,
    });
  }
});

export default router;
