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

  // Rating fields for individual products
  rating: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Rating",
  },
  isRated: {
    type: Boolean,
    default: false,
  },
});

const orderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderNumber: {
      type: String,
      unique: true,
      default: () =>
        `ORD-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 6)
          .toUpperCase()}`,
    },
    items: [orderItemSchema],
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
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
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

    // Overall order rating
    rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rating",
    },
    isRated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customer: 1, status: 1 });

orderSchema.pre("save", function (next) {
  this.subtotal = this.items.reduce((total, item) => {
    item.subtotal = item.price * item.quantity;
    return total + item.subtotal;
  }, 0);

  this.totalAmount =
    this.subtotal + this.tax + this.shippingFee - this.discount;

  next();
});

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

orderSchema.methods.removeItem = function (productId) {
  this.items = this.items.filter(
    (item) => item.product.toString() !== productId.toString()
  );
};

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

orderSchema.methods.canBeCancelled = function () {
  return ["pending", "confirmed"].includes(this.status);
};

// Method to check if order can be rated
orderSchema.methods.canBeRated = function () {
  const canRate = this.status === "delivered" && !this.isRated;
  console.log(
    `Order ${this._id} canBeRated: ${canRate} (status: ${this.status}, isRated: ${this.isRated})`
  );
  return canRate;
};

// Method to check if specific product in order can be rated
orderSchema.methods.canRateProduct = function (productId) {
  if (this.status !== "delivered") {
    console.log(
      `Order ${this._id} is not delivered yet (status: ${this.status})`
    );
    return false;
  }

  const item = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (!item) {
    console.log(`Product ${productId} not found in order ${this._id}`);
    return false;
  }

  if (item.isRated) {
    console.log(`Product ${productId} already rated in order ${this._id}`);
    return false;
  }

  console.log(`Product ${productId} can be rated in order ${this._id}`);
  return true;
};

// Method to mark order as rated
orderSchema.methods.markAsRated = async function (ratingId) {
  this.isRated = true;
  this.rating = ratingId;
  await this.save();
  console.log(`✅ Order ${this._id} marked as rated with rating ${ratingId}`);
  return this;
};

// Method to mark product in order as rated
orderSchema.methods.markProductAsRated = async function (productId, ratingId) {
  const item = this.items.find(
    (item) => item.product.toString() === productId.toString()
  );

  if (item) {
    item.isRated = true;
    item.rating = ratingId;
    await this.save();
    console.log(
      `✅ Product ${productId} in order ${this._id} marked as rated with rating ${ratingId}`
    );
    return this;
  } else {
    console.log(`❌ Product ${productId} not found in order ${this._id}`);
    throw new Error("Product not found in order");
  }
};

// Get unrated products in this order
orderSchema.methods.getUnratedProducts = function () {
  return this.items.filter((item) => !item.isRated);
};

// Check if all products in order have been rated
orderSchema.methods.allProductsRated = function () {
  if (this.items.length === 0) return false;
  return this.items.every((item) => item.isRated);
};

// Method to rate the entire order
orderSchema.methods.rateOrder = async function (
  ratingValue,
  userId,
  comment = null
) {
  try {
    const Rating = mongoose.model("Rating");

    // Check if order can be rated
    if (!this.canBeRated()) {
      throw new Error("This order cannot be rated at this time");
    }

    // Check if user has already rated this order
    const existingRating = await Rating.findOne({
      rater: userId,
      "ratedEntity.type": "order",
      "ratedEntity.id": this._id,
    });

    if (existingRating) {
      throw new Error("You have already rated this order");
    }

    // Create new rating
    const newRating = new Rating({
      rater: userId,
      ratedEntity: {
        type: "order",
        id: this._id,
      },
      rating: ratingValue,
      comment: comment,
    });

    await newRating.save();

    // Mark order as rated
    await this.markAsRated(newRating._id);

    return newRating;
  } catch (error) {
    console.error("Error rating order:", error);
    throw error;
  }
};

// NEW: Method to update rating stats for the order
orderSchema.methods.updateRatingStats = async function () {
  try {
    const Rating = mongoose.model("Rating");

    // Get average rating for this order
    const ratingStats = await Rating.getAverageRating("order", this._id);

    // Update the order's rating information if needed
    if (ratingStats.totalRatings > 0) {
      console.log(
        `📊 Updated rating stats for order ${this._id}:`,
        ratingStats
      );
    }

    return ratingStats;
  } catch (error) {
    console.error(`Error updating rating stats for order ${this._id}:`, error);
  }
};

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
