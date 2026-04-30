// models/Favorites.js - ENHANCED for both Customer and Staff
import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  itemType: {
    type: String,
    enum: ["Product", "Service", "LearningModule", "Stylist"],
    required: true,
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "itemType",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create compound index to prevent duplicate favorites
favoriteSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });

// Static method to get user favorites by type
favoriteSchema.statics.getUserFavorites = function (userId, itemType) {
  return this.find({ userId, itemType })
    .populate("itemId")
    .sort({ createdAt: -1 });
};

// Static method to check if item is favorited
favoriteSchema.statics.isFavorited = function (userId, itemType, itemId) {
  return this.findOne({ userId, itemType, itemId });
};

const Favorite = mongoose.model("Favorite", favoriteSchema);

export default Favorite;
