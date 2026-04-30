// models/Notification.js - FIXED VERSION
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        // Authentication & Profile
        "user_registered",
        "user_logged_in",
        "password_changed",
        "profile_updated",
        "profile_picture_updated",

        // Purchases & Orders
        "product_purchased",
        "order_created",
        "order_status_updated",
        "order_cancelled",
        "order_delivered",

        // Services & Bookings
        "service_booked",
        "booking_created",
        "booking_confirmed",
        "booking_completed",
        "booking_cancelled",
        "appointment_scheduled",
        "appointment_completed",
        "appointment_cancelled",

        // Cart & Favorites
        "cart_updated",
        "item_added_to_cart",
        "item_removed_from_cart",
        "product_added_to_favorites",
        "product_removed_from_favorites",

        // Payments
        "payment_initiated",
        "payment_completed",
        "payment_failed",
        "payment_refunded",

        // Ratings & Reviews
        "rating_submitted",
        "review_added",
        "rating_updated",

        // System & Admin
        "admin_action",
        "system_alert",
        "maintenance_notice",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    relatedEntity: {
      type: {
        type: String,
        enum: [
          "user",
          "product",
          "service",
          "order",
          "booking",
          "appointment",
          "payment",
          "rating",
        ],
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        // FIX: Remove refPath to avoid model registration issues
      },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    actionUrl: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to create notifications
notificationSchema.statics.createNotification = async function (
  notificationData
) {
  try {
    const notification = new this(notificationData);
    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

// FIXED: Static method to get user notifications without problematic populate
notificationSchema.statics.getUserNotifications = async function (
  userId,
  options = {}
) {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    types = [],
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const query = { user: userId };

  if (unreadOnly) {
    query.isRead = false;
  }

  if (types.length > 0) {
    query.type = { $in: types };
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // FIX: Remove problematic populate calls
  const notifications = await this.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select("-__v") // Exclude version key
    .lean(); // Use lean for better performance

  const total = await this.countDocuments(query);
  const unreadCount = await this.countDocuments({
    user: userId,
    isRead: false,
  });

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount,
  };
};

// Method to mark as read
notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  await this.save();
  return this;
};

// Method to mark all as read for a user
notificationSchema.statics.markAllAsRead = async function (userId) {
  await this.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true } }
  );
};

// Pre-save middleware to set title and message if not provided
notificationSchema.pre("save", function (next) {
  if (!this.title || !this.message) {
    const { title, message } = this.generateNotificationContent();
    this.title = this.title || title;
    this.message = this.message || message;
  }
  next();
});

// Method to generate notification content based on type
notificationSchema.methods.generateNotificationContent = function () {
  const templates = {
    user_registered: {
      title: "Welcome to SandreaLee Salon!",
      message:
        "Your account has been successfully created. Start exploring our services!",
    },
    user_logged_in: {
      title: "Login Successful",
      message: "You have successfully logged into your account.",
    },
    password_changed: {
      title: "Password Updated",
      message: "Your password has been changed successfully.",
    },
    profile_updated: {
      title: "Profile Updated",
      message: "Your profile information has been updated successfully.",
    },
    profile_picture_updated: {
      title: "Profile Picture Updated",
      message: "Your profile picture has been updated successfully.",
    },
    product_purchased: {
      title: "Purchase Completed",
      message: "Your product purchase has been completed successfully.",
    },
    order_created: {
      title: "Order Placed",
      message: "Your order has been placed successfully.",
    },
    order_status_updated: {
      title: "Order Status Updated",
      message: "Your order status has been updated.",
    },
    order_cancelled: {
      title: "Order Cancelled",
      message: "Your order has been cancelled.",
    },
    order_delivered: {
      title: "Order Delivered",
      message: "Your order has been delivered successfully.",
    },
    service_booked: {
      title: "Service Booked",
      message: "Your service has been booked successfully.",
    },
    booking_created: {
      title: "Booking Created",
      message: "Your booking has been created successfully.",
    },
    booking_confirmed: {
      title: "Booking Confirmed",
      message: "Your booking has been confirmed.",
    },
    booking_completed: {
      title: "Booking Completed",
      message: "Your booking has been completed successfully.",
    },
    booking_cancelled: {
      title: "Booking Cancelled",
      message: "Your booking has been cancelled.",
    },
    appointment_scheduled: {
      title: "Appointment Scheduled",
      message: "Your appointment has been scheduled successfully.",
    },
    appointment_completed: {
      title: "Appointment Completed",
      message: "Your appointment has been completed successfully.",
    },
    appointment_cancelled: {
      title: "Appointment Cancelled",
      message: "Your appointment has been cancelled.",
    },
    cart_updated: {
      title: "Cart Updated",
      message: "Your shopping cart has been updated.",
    },
    item_added_to_cart: {
      title: "Item Added to Cart",
      message: "An item has been added to your shopping cart.",
    },
    item_removed_from_cart: {
      title: "Item Removed from Cart",
      message: "An item has been removed from your shopping cart.",
    },
    product_added_to_favorites: {
      title: "Added to Favorites",
      message: "A product has been added to your favorites.",
    },
    product_removed_from_favorites: {
      title: "Removed from Favorites",
      message: "A product has been removed from your favorites.",
    },
    payment_initiated: {
      title: "Payment Initiated",
      message: "Your payment has been initiated.",
    },
    payment_completed: {
      title: "Payment Completed",
      message: "Your payment has been completed successfully.",
    },
    payment_failed: {
      title: "Payment Failed",
      message: "Your payment has failed. Please try again.",
    },
    payment_refunded: {
      title: "Payment Refunded",
      message: "Your payment has been refunded.",
    },
    rating_submitted: {
      title: "Rating Submitted",
      message: "Thank you for your rating!",
    },
    review_added: {
      title: "Review Added",
      message: "Your review has been added successfully.",
    },
    rating_updated: {
      title: "Rating Updated",
      message: "Your rating has been updated successfully.",
    },
  };

  return (
    templates[this.type] || {
      title: "Notification",
      message: "You have a new notification.",
    }
  );
};

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
