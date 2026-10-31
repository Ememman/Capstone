import mongoose from "mongoose";

const promoSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      default: null, // null means no cap
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      default: null, // null = unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableTo: {
      type: String,
      enum: ["all", "products", "services"],
      default: "all",
    },
  },
  {
    timestamps: true,
  }
);

promoSchema.index({ code: 1 });
promoSchema.index({ isActive: 1, validUntil: 1 });

// Instance method to check if promo is valid for given amount and category
promoSchema.methods.checkEligibility = function (amount = 0, targetType = "all") {
  const now = new Date();

  if (!this.isActive) {
    return { valid: false, message: "This promo code is currently inactive" };
  }

  if (now < new Date(this.validFrom)) {
    return { valid: false, message: "This promo is not yet active" };
  }

  if (now > new Date(this.validUntil)) {
    return { valid: false, message: "This promo code has expired" };
  }

  if (this.usageLimit !== null && this.usedCount >= this.usageLimit) {
    return { valid: false, message: "This promo code has reached its usage limit" };
  }

  if (amount < this.minOrderAmount) {
    return {
      valid: false,
      message: `Minimum order amount of ₱${this.minOrderAmount} required for this promo`,
    };
  }

  if (
    this.applicableTo !== "all" &&
    targetType !== "all" &&
    this.applicableTo !== targetType
  ) {
    return {
      valid: false,
      message: `This promo is only valid for ${this.applicableTo}`,
    };
  }

  return { valid: true, message: "Promo code is valid" };
};

// Calculate discounted amount
promoSchema.methods.calculateDiscount = function (amount = 0) {
  let discount = 0;

  if (this.discountType === "percentage") {
    discount = (amount * this.discountValue) / 100;
    if (this.maxDiscount !== null && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }
  } else {
    discount = Math.min(this.discountValue, amount);
  }

  return Math.round(discount * 100) / 100;
};

const Promo = mongoose.model("Promo", promoSchema);

export default Promo;

