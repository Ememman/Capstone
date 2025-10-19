import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  itemType: {
    type: String,
    enum: ["Product", "Service"], // ✅ Capitalized to match model names
    default: "Product",
    required: true,
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "itemType", // This will now look for "Product" or "Service" models
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create compound index to prevent duplicate favorites
favoriteSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });

const Favorite = mongoose.model("Favorite", favoriteSchema);

export default Favorite;
