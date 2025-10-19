import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    rating: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
      default: 5.0,
    },
    totalRaters: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    image: {
      type: String,
      required: false,
    },
    description: {
      type: String,
      trim: true,
    },
    inStock: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better query performance
productSchema.index({ category: 1 });
productSchema.index({ name: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ price: 1 });

const Product = mongoose.model("Product", productSchema);

export default Product;
