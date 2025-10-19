import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
});

const orderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Order details
    orderNumber: {
      type: String,
      unique: true, // this already creates a unique index
      default: () =>
        `ORD-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 6)
          .toUpperCase()}`,
    },
    items: [orderItemSchema],
    // Pricing
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Order status
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },
    // Delivery information
    deliveryInfo: {
      type: {
        type: String,
        enum: ["pickup", "delivery"],
        default: "pickup",
      },
      address: {
        street: String,
        city: String,
        province: String,
        postalCode: String,
        country: {
          type: String,
          default: "Philippines",
        },
      },
      contactNumber: String,
      specialInstructions: {
        type: String,
        maxlength: 300,
      },
      estimatedDelivery: Date,
      actualDelivery: Date,
    },
    // Payment reference
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    // Order tracking
    tracking: {
      orderPlaced: {
        date: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          default: "Order placed successfully",
        },
      },
      paymentConfirmed: {
        date: Date,
        status: String,
      },
      processing: {
        date: Date,
        status: String,
      },
      shipped: {
        date: Date,
        status: String,
        trackingNumber: String,
        courier: String,
      },
      delivered: {
        date: Date,
        status: String,
        receivedBy: String,
      },
    },
    // Additional information
    customerNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    adminNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    // Cancellation
    cancellationReason: {
      type: String,
      maxlength: 200,
      trim: true,
    },
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customer: 1, status: 1 });

// Pre-save middleware to calculate totals
orderSchema.pre("save", function (next) {
  this.subtotal = this.items.reduce((total, item) => {
    item.subtotal = item.price * item.quantity;
    return total + item.subtotal;
  }, 0);

  this.totalAmount =
    this.subtotal + this.tax + this.shippingFee - this.discount;

  next();
});

// Method to add item to order
orderSchema.methods.addItem = function (productId, quantity, price) {
  const existingItem = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.subtotal = existingItem.price * existingItem.quantity;
  } else {
    this.items.push({
      product: productId,
      quantity,
      price,
      subtotal: price * quantity,
    });
  }
};

// Method to remove item from order
orderSchema.methods.removeItem = function (productId) {
  this.items = this.items.filter(
    (item) => item.product.toString() !== productId.toString()
  );
};

// Method to update order status with tracking
orderSchema.methods.updateStatus = function (newStatus, notes) {
  this.status = newStatus;

  const now = new Date();
  const statusMessage = notes || `Order ${newStatus}`;

  switch (newStatus) {
    case "confirmed":
      this.tracking.paymentConfirmed = {
        date: now,
        status: statusMessage,
      };
      break;
    case "processing":
      this.tracking.processing = {
        date: now,
        status: statusMessage,
      };
      break;
    case "shipped":
      this.tracking.shipped = {
        date: now,
        status: statusMessage,
      };
      break;
    case "delivered":
      this.tracking.delivered = {
        date: now,
        status: statusMessage,
      };
      this.deliveryInfo.actualDelivery = now;
      break;
  }
};

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function () {
  return ["pending", "confirmed"].includes(this.status);
};

// Static method to get order statistics
orderSchema.statics.getOrderStats = async function (startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
      },
    },
  ]);

  return stats;
};

const Order = mongoose.model("Order", orderSchema);

export default Order;
