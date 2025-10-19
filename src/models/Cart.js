// models/Cart.js
// CREATE THIS NEW FILE - You don't have this model yet

import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Each user can only have one cart
    },
    items: [cartItemSchema],
    totalAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// Create index for faster queries
cartSchema.index({ userId: 1 });

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
