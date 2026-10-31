import express from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Promo from "../models/Promo.js";
import { authMiddleware, customerOnly, staffOnly } from "../middleware/auth.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

// GET /api/orders/my-orders - Get current user's orders
router.get("/my-orders", authMiddleware, async (req, res) => {
  try {
    const { status, limit = 10, page = 1 } = req.query;

    const query = { customer: req.user._id };

    if (status && status !== "all") {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate("customer", "username email phoneNumber")
      .populate("items.product", "name price image")
      .populate("payment")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders,
      count: orders.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user orders",
      error: error.message,
    });
  }
});

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

// GET /api/orders/:id/can-rate - Check if order can be rated
router.get("/:id/can-rate", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user can access this order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const canRate = order.canBeRated();

    res.json({
      success: true,
      canRate,
      reason: canRate ? "Order can be rated" : "Order cannot be rated yet",
      orderStatus: order.status,
      isRated: order.isRated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error checking rating eligibility",
      error: error.message,
    });
  }
});

// GET /api/orders/:id/rateable-items - Get unrated products in order
router.get("/:id/rateable-items", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "items.product",
      "name price image"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user can access this order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const rateableItems = order.items
      .filter((item) => !item.isRated)
      .map((item) => ({
        itemId: item._id,
        product: item.product,
        quantity: item.quantity,
        canBeRated: order.canRateProduct(item.product._id),
      }));

    res.json({
      success: true,
      data: rateableItems,
      count: rateableItems.length,
      orderCanBeRated: order.canBeRated(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching rateable items",
      error: error.message,
    });
  }
});

// POST /api/orders/:id/rate - Rate entire order
router.post("/:id/rate", authMiddleware, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user can access this order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Use the rateOrder method from your model
    const newRating = await order.rateOrder(rating, req.user._id, comment);

    // Track rating activity
    await notificationService.trackUserActivity(
      req.user._id,
      "rating_submitted",
      {
        orderId: order._id,
        orderNumber: order.orderNumber,
        ratingId: newRating._id,
        ratingValue: rating,
      }
    );

    res.json({
      success: true,
      message: "Order rated successfully",
      data: newRating,
      order: await Order.findById(req.params.id).populate(
        "items.product",
        "name price image"
      ),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
});

// POST /api/orders/:id/products/:productId/rate - Rate specific product in order
router.post(
  "/:id/products/:productId/rate",
  authMiddleware,
  async (req, res) => {
    try {
      const { rating, comment } = req.body;
      const { id: orderId, productId } = req.params;

      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Check if user can access this order
      if (order.customer.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      // Check if product can be rated
      if (!order.canRateProduct(productId)) {
        return res.status(400).json({
          success: false,
          message: "This product cannot be rated at this time",
        });
      }

      const Rating = mongoose.model("Rating");

      // Create rating for the product
      const newRating = new Rating({
        rater: req.user._id,
        ratedEntity: {
          type: "product",
          id: productId,
        },
        rating: rating,
        comment: comment,
        order: orderId,
      });

      await newRating.save();

      // Mark product as rated in the order
      await order.markProductAsRated(productId, newRating._id);

      // Track rating activity
      await notificationService.trackUserActivity(
        req.user._id,
        "rating_submitted",
        {
          orderId: order._id,
          productId: productId,
          ratingId: newRating._id,
          ratingValue: rating,
        }
      );

      res.json({
        success: true,
        message: "Product rated successfully",
        data: newRating,
        order: await Order.findById(orderId).populate(
          "items.product",
          "name price image"
        ),
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
        error: error.message,
      });
    }
  }
);

// GET /api/orders/:id/summary - Get order summary
router.get("/:id/summary", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "username email phoneNumber")
      .populate("items.product", "name price image")
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

    const summary = {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      customer: order.customer,
      items: order.items,
      pricing: {
        subtotal: order.subtotal,
        tax: order.tax,
        discount: order.discount,
        shippingFee: order.shippingFee,
        totalAmount: order.totalAmount,
      },
      deliveryInfo: order.deliveryInfo,
      payment: order.payment,
      canBeRated: order.canBeRated(),
      unratedItems: order.getUnratedProducts().length,
      allItemsRated: order.allProductsRated(),
    };

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order summary",
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
      promoCode,
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

    // Apply promo code discount if provided
    let discount = 0;
    let appliedPromo = null;
    if (promoCode && typeof promoCode === "string" && promoCode.trim()) {
      const cleanCode = promoCode.trim().toUpperCase();
      const promo = await Promo.findOne({ code: cleanCode });
      if (promo) {
        const eligibility = promo.checkEligibility(subtotal, "products");
        if (eligibility.valid) {
          discount = promo.calculateDiscount(subtotal);
          appliedPromo = promo.code;
          promo.usedCount = (promo.usedCount || 0) + 1;
          await promo.save();
        }
      }
    }

    const totalAmount = Math.max(0, subtotal + shippingFee - discount);

    // Create order
    const order = new Order({
      customer: req.user._id,
      items: orderItems,
      subtotal,
      shippingFee,
      discount,
      totalAmount,
      deliveryInfo: {
        type: deliveryType || "pickup",
        address: deliveryAddress,
        contactNumber,
        specialInstructions,
      },
      customerNotes,
      promoCode,
    });

    await order.save();

    // Real-time broadcast to dashboard and customer
    if (req.io) {
      req.io.to("admin-dashboard").emit("dashboard-update", {
        type: "order",
        action: "order-created",
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customer: req.user.username || "Customer",
          totalAmount: order.totalAmount,
          discount: order.discount,
          status: order.status,
        },
        timestamp: new Date().toISOString(),
      });
      req.io.to(`user-${req.user._id}`).emit("order-update", {
        action: "order-created",
        order,
      });
    }

    // Populate the order for response
    await order.populate("items.product", "name price image");

    // Track order creation activity
    await notificationService.trackUserActivity(req.user._id, "order_created", {
      orderId: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      itemCount: order.items.length,
    });

    // Track product purchase activity for each item
    for (const item of order.items) {
      await notificationService.trackUserActivity(
        req.user._id,
        "product_purchased",
        {
          productId: item.product._id,
          productName: item.product.name,
          quantity: item.quantity,
          amount: item.subtotal,
          orderId: order._id,
        }
      );
    }

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

    // Real-time broadcast to dashboard and customer
    if (req.io) {
      req.io.to("admin-dashboard").emit("dashboard-update", {
        type: "order",
        action: "order-created",
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customer: req.user.username || "Customer",
          totalAmount: order.totalAmount,
          discount: order.discount,
          status: order.status,
        },
        timestamp: new Date().toISOString(),
      });
      req.io.to(`user-${req.user._id}`).emit("order-update", {
        action: "order-created",
        order,
      });
    }

    // Track order cancellation activity
    await notificationService.trackUserActivity(
      req.user._id,
      "order_cancelled",
      {
        orderId: order._id,
        orderNumber: order.orderNumber,
        cancellationReason: cancellationReason,
      }
    );

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

    const oldStatus = order.status;
    order.updateStatus(status, notes);

    if (status === "shipped" && trackingNumber) {
      order.tracking.shipped.trackingNumber = trackingNumber;
      order.tracking.shipped.courier = courier;
    }

    if (status === "delivered" && receivedBy) {
      order.tracking.delivered.receivedBy = receivedBy;
    }

    if (notes) {
      order.adminNotes = notes;
    }

    await order.save();

    // Real-time broadcast to dashboard and customer
    if (req.io) {
      req.io.to("admin-dashboard").emit("dashboard-update", {
        type: "order",
        action: "order-created",
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customer: req.user.username || "Customer",
          totalAmount: order.totalAmount,
          discount: order.discount,
          status: order.status,
        },
        timestamp: new Date().toISOString(),
      });
      req.io.to(`user-${req.user._id}`).emit("order-update", {
        action: "order-created",
        order,
      });
    }

    // Track order status update activity
    await notificationService.trackUserActivity(
      order.customer,
      "order_status_updated",
      {
        orderId: order._id,
        orderNumber: order.orderNumber,
        oldStatus: oldStatus,
        newStatus: status,
        notes: notes,
      }
    );

    // Track order delivered activity
    if (status === "delivered") {
      await notificationService.trackUserActivity(
        order.customer,
        "order_delivered",
        {
          orderId: order._id,
          orderNumber: order.orderNumber,
          receivedBy: receivedBy,
        }
      );
    }

    const response = {
      success: true,
      message: "Order status updated successfully",
      data: order,
    };

    if (status === "delivered") {
      response.canRate = true;
      response.message += ". Customer can now rate the products.";
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
});

// PUT /api/orders/:id/delivery-info - Update delivery information
router.put(
  "/:id/delivery-info",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { address, contactNumber, specialInstructions, estimatedDelivery } =
        req.body;

      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (address)
        order.deliveryInfo.address = {
          ...order.deliveryInfo.address,
          ...address,
        };
      if (contactNumber) order.deliveryInfo.contactNumber = contactNumber;
      if (specialInstructions)
        order.deliveryInfo.specialInstructions = specialInstructions;
      if (estimatedDelivery)
        order.deliveryInfo.estimatedDelivery = new Date(estimatedDelivery);

      await order.save();

    // Real-time broadcast to dashboard and customer
    if (req.io) {
      req.io.to("admin-dashboard").emit("dashboard-update", {
        type: "order",
        action: "order-created",
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customer: req.user.username || "Customer",
          totalAmount: order.totalAmount,
          discount: order.discount,
          status: order.status,
        },
        timestamp: new Date().toISOString(),
      });
      req.io.to(`user-${req.user._id}`).emit("order-update", {
        action: "order-created",
        order,
      });
    }

      res.json({
        success: true,
        message: "Delivery information updated successfully",
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating delivery information",
        error: error.message,
      });
    }
  }
);

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
