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
      average: {
        type: Number,
        required: true,
        min: 0,
        max: 5,
        default: 0,
      },
      totalRaters: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      breakdown: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
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

productSchema.index({ category: 1 });
productSchema.index({ name: 1 });
productSchema.index({ "rating.average": -1 });
productSchema.index({ price: 1 });

// FIXED: Improved rating update method with better error handling
productSchema.methods.updateRatingStats = async function () {
  try {
    const Rating = mongoose.model("Rating");
    const ratingStats = await Rating.getAverageRating("product", this._id);

    // Only update if we have valid rating data
    if (ratingStats && ratingStats.totalRatings >= 0) {
      this.rating = {
        average: ratingStats.averageRating || 0,
        totalRaters: ratingStats.totalRatings || 0,
        breakdown: ratingStats.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };

      await this.save({ validateBeforeSave: false });
      console.log(`✅ Updated rating stats for product: ${this.name}`);
    } else {
      console.log(`⚠️ No rating data found for product: ${this.name}`);
    }

    return this;
  } catch (error) {
    console.error("Error updating product rating stats:", error);
    // Don't throw error to prevent breaking the main flow
    return this;
  }
};

// FIXED: Static method to update rating stats by product ID
productSchema.statics.updateProductRating = async function (productId) {
  try {
    const product = await this.findById(productId);
    if (product) {
      return await product.updateRatingStats();
    }
    return null;
  } catch (error) {
    console.error("Error in updateProductRating:", error);
    throw error;
  }
};

// NEW: Method to add a rating directly (alternative approach)
productSchema.methods.addRating = async function (ratingValue, userId) {
  try {
    const Rating = mongoose.model("Rating");

    // Check if user has already rated this product
    const existingRating = await Rating.findOne({
      rater: userId,
      "ratedEntity.type": "product",
      "ratedEntity.id": this._id,
    });

    if (existingRating) {
      throw new Error("You have already rated this product");
    }

    // Create new rating
    const newRating = new Rating({
      rater: userId,
      ratedEntity: {
        type: "product",
        id: this._id,
      },
      ratedProduct: this._id,
      rating: ratingValue,
    });

    await newRating.save();

    // Update product rating stats
    await this.updateRatingStats();

    return newRating;
  } catch (error) {
    console.error("Error adding rating to product:", error);
    throw error;
  }
};

// Virtual for star rating percentages
productSchema.virtual("rating.percentages").get(function () {
  const total = this.rating.totalRaters;
  if (total === 0) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  return {
    1: Math.round((this.rating.breakdown[1] / total) * 100),
    2: Math.round((this.rating.breakdown[2] / total) * 100),
    3: Math.round((this.rating.breakdown[3] / total) * 100),
    4: Math.round((this.rating.breakdown[4] / total) * 100),
    5: Math.round((this.rating.breakdown[5] / total) * 100),
  };
});

// NEW: Pre-save middleware to ensure rating structure
productSchema.pre("save", function (next) {
  // Ensure rating structure exists
  if (!this.rating) {
    this.rating = {
      average: 0,
      totalRaters: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
  next();
});

const Product = mongoose.model("Product", productSchema);
export default Product;
