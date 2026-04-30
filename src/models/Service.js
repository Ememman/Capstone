import mongoose from "mongoose";

// Define the schema for MongoDB
const ServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    duration: String,
    priceRange: String,
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      totalRaters: {
        type: Number,
        default: 0,
      },
      breakdown: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
      percentages: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },
    totalBookings: { type: Number, default: 0 },
    category: { type: String, required: true },
    isPromo: { type: Boolean, default: false },
    availability: {
      type: String,
      enum: ["available", "limited", "unavailable"],
      default: "available",
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ServiceSchema.index({ totalBookings: -1 });
ServiceSchema.index({ "rating.average": -1 });
ServiceSchema.index({ createdAt: -1 });
ServiceSchema.index({ category: 1 });

// FIXED: Improved rating update method with better error handling
ServiceSchema.methods.updateRatingStats = async function () {
  try {
    const Rating = mongoose.model("Rating");
    // FIX: Use getServiceAverageRating instead of getAverageRating
    // This queries by ratedService field instead of ratedEntity.type
    const ratingStats = await Rating.getServiceAverageRating(this._id);

    console.log(`📊 Service rating stats calculation:`, {
      serviceId: this._id,
      serviceName: this.name,
      averageRating: ratingStats.averageRating,
      totalRatings: ratingStats.totalRatings,
      breakdown: ratingStats.breakdown,
    });

    // Only update if we have valid rating data
    if (ratingStats && ratingStats.totalRatings >= 0) {
      this.rating = {
        average: ratingStats.averageRating || 0,
        totalRaters: ratingStats.totalRatings || 0,
        breakdown: ratingStats.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };

      // Calculate percentages for display
      const total = this.rating.totalRaters;
      if (total > 0) {
        this.rating.percentages = {
          1: Math.round((this.rating.breakdown[1] / total) * 100),
          2: Math.round((this.rating.breakdown[2] / total) * 100),
          3: Math.round((this.rating.breakdown[3] / total) * 100),
          4: Math.round((this.rating.breakdown[4] / total) * 100),
          5: Math.round((this.rating.breakdown[5] / total) * 100),
        };
      } else {
        this.rating.percentages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      }

      await this.save({ validateBeforeSave: false });
      console.log(`✅ Updated rating stats for service: ${this.name}`, {
        average: this.rating.average,
        totalRaters: this.rating.totalRaters,
      });
    } else {
      console.log(`⚠️ No rating data found for service: ${this.name}`);
      // Initialize default rating structure if none exists
      if (!this.rating) {
        this.rating = {
          average: 0,
          totalRaters: 0,
          breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          percentages: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
        await this.save({ validateBeforeSave: false });
      }
    }

    return this;
  } catch (error) {
    console.error("Error updating service rating stats:", error);
    // Don't throw error to prevent breaking the main flow
    return this;
  }
};

// FIXED: Static method to update rating stats by service ID
ServiceSchema.statics.updateServiceRating = async function (serviceId) {
  try {
    const service = await this.findById(serviceId);
    if (service) {
      return await service.updateRatingStats();
    }
    return null;
  } catch (error) {
    console.error("Error in updateServiceRating:", error);
    throw error;
  }
};

// NEW: Method to add a rating directly
ServiceSchema.methods.addRating = async function (
  ratingValue,
  userId,
  comment = null,
  staffId = null
) {
  try {
    const Rating = mongoose.model("Rating");

    // Check if user has already rated this service
    const existingRating = await Rating.findOne({
      rater: userId,
      "ratedEntity.type": "service",
      "ratedEntity.id": this._id,
    });

    if (existingRating) {
      throw new Error("You have already rated this service");
    }

    // Create new rating
    const newRating = new Rating({
      rater: userId,
      ratedEntity: {
        type: "service",
        id: this._id,
      },
      ratedService: this._id,
      ratedStaff: staffId,
      rating: ratingValue,
      comment: comment,
    });

    await newRating.save();

    // Update service rating stats
    await this.updateRatingStats();

    return newRating;
  } catch (error) {
    console.error("Error adding rating to service:", error);
    throw error;
  }
};

// NEW: Pre-save middleware to ensure rating structure
ServiceSchema.pre("save", function (next) {
  // Ensure rating structure exists
  if (!this.rating) {
    this.rating = {
      average: 0,
      totalRaters: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      percentages: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  // Ensure percentages are calculated if not present
  if (this.rating && !this.rating.percentages) {
    const total = this.rating.totalRaters;
    if (total > 0) {
      this.rating.percentages = {
        1: Math.round((this.rating.breakdown[1] / total) * 100),
        2: Math.round((this.rating.breakdown[2] / total) * 100),
        3: Math.round((this.rating.breakdown[3] / total) * 100),
        4: Math.round((this.rating.breakdown[4] / total) * 100),
        5: Math.round((this.rating.breakdown[5] / total) * 100),
      };
    } else {
      this.rating.percentages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    }
  }

  next();
});

// Create the Mongoose model
const ServiceModel = mongoose.model("Service", ServiceSchema);

// Service class with static methods and complete service data
class Service {
  constructor(
    id,
    name,
    duration,
    priceRange,
    rating,
    totalRaters,
    category,
    totalBookings = 0,
    isPromo = false,
    availability = "available",
    description = ""
  ) {
    this.id = id;
    this.name = name;
    this.duration = duration;
    this.priceRange = priceRange;

    // Updated rating structure
    if (typeof rating === "object") {
      this.rating = rating;
    } else {
      this.rating = {
        average: rating || 0,
        totalRaters: totalRaters || 0,
        breakdown: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
        percentages: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      };
      // If we have a numeric rating and totalRaters, distribute breakdown logically
      if (rating && totalRaters) {
        this.distributeBreakdown(rating, totalRaters);
      }
    }

    this.category = category;
    this.totalBookings = totalBookings;
    this.isPromo = isPromo;
    this.availability = availability;
    this.description = description;
  }

  // Helper method to distribute ratings logically based on average
  distributeBreakdown(averageRating, totalRaters) {
    const avg = averageRating;
    const total = totalRaters;

    // Simple distribution logic based on average rating
    if (avg >= 4.5) {
      this.rating.breakdown = {
        1: Math.round(total * 0.02),
        2: Math.round(total * 0.03),
        3: Math.round(total * 0.1),
        4: Math.round(total * 0.3),
        5: Math.round(total * 0.55),
      };
    } else if (avg >= 4.0) {
      this.rating.breakdown = {
        1: Math.round(total * 0.05),
        2: Math.round(total * 0.08),
        3: Math.round(total * 0.15),
        4: Math.round(total * 0.35),
        5: Math.round(total * 0.37),
      };
    } else if (avg >= 3.5) {
      this.rating.breakdown = {
        1: Math.round(total * 0.08),
        2: Math.round(total * 0.12),
        3: Math.round(total * 0.25),
        4: Math.round(total * 0.35),
        5: Math.round(total * 0.2),
      };
    } else {
      this.rating.breakdown = {
        1: Math.round(total * 0.15),
        2: Math.round(total * 0.2),
        3: Math.round(total * 0.3),
        4: Math.round(total * 0.25),
        5: Math.round(total * 0.1),
      };
    }

    // Ensure total matches
    const currentTotal = Object.values(this.rating.breakdown).reduce(
      (a, b) => a + b,
      0
    );
    if (currentTotal !== total) {
      this.rating.breakdown[5] += total - currentTotal;
    }

    // Calculate percentages
    if (total > 0) {
      this.rating.percentages = {
        1: Math.round((this.rating.breakdown[1] / total) * 100),
        2: Math.round((this.rating.breakdown[2] / total) * 100),
        3: Math.round((this.rating.breakdown[3] / total) * 100),
        4: Math.round((this.rating.breakdown[4] / total) * 100),
        5: Math.round((this.rating.breakdown[5] / total) * 100),
      };
    }
  }

  // Static method to get all services
  static getAllServices() {
    return [
      // Haircuts & Basic Services ✂️
      new Service(
        1,
        "TRIM",
        "30min",
        "₱150",
        4.8,
        289,
        "Haircuts & Basic Services",
        289
      ),
      new Service(
        2,
        "HAIRCUT",
        "45min",
        "₱350",
        4.9,
        345,
        "Haircuts & Basic Services",
        345,
        true
      ),
      new Service(
        3,
        "HAIRCUT(TRIM)",
        "30min",
        "₱200",
        4.7,
        267,
        "Haircuts & Basic Services",
        267
      ),
      new Service(
        4,
        "HAIRCUT W/ SHAM/CONDI AND BLOW",
        "1hr",
        "₱450",
        4.6,
        234,
        "Haircuts & Basic Services",
        234
      ),
      new Service(
        5,
        "HAIRCUT W/ HAIRGOAL SHAM/ CONDI AND BLOW DRY",
        "1hr",
        "₱500",
        4.8,
        198,
        "Haircuts & Basic Services",
        198
      ),
      new Service(
        6,
        "SHAMPOO",
        "30min",
        "₱150",
        4.5,
        456,
        "Haircuts & Basic Services",
        456,
        true
      ),
      new Service(
        7,
        "BLOW DRY",
        "45min",
        "₱250",
        4.7,
        378,
        "Haircuts & Basic Services",
        378
      ),
      new Service(
        8,
        "HAIR STYLE",
        "1hr",
        "₱350",
        4.4,
        189,
        "Haircuts & Basic Services",
        189
      ),
      new Service(
        9,
        "HAIR CURL SET",
        "1hr",
        "₱400",
        4.6,
        234,
        "Haircuts & Basic Services",
        234
      ),
      new Service(
        10,
        "HAIR IRON",
        "45min",
        "₱300",
        4.3,
        167,
        "Haircuts & Basic Services",
        167
      ),
      new Service(
        11,
        "SHAVING(EYEBROWS)",
        "30min",
        "₱100",
        4.9,
        289,
        "Haircuts & Basic Services",
        289
      ),

      // Hair Coloring 🎨
      new Service(
        12,
        "BASIC COLOR",
        "2hr",
        "₱1,000",
        4.7,
        345,
        "Hair Coloring",
        345,
        true
      ),
      new Service(
        13,
        "FASHION COLOR",
        "2.5hr",
        "₱1,500",
        4.8,
        267,
        "Hair Coloring",
        267
      ),
      new Service(
        14,
        "BLEACH ONLY",
        "2hr",
        "₱1,000",
        4.5,
        234,
        "Hair Coloring",
        234
      ),
      new Service(
        15,
        "HIGHLIGHTS ONLY",
        "2hr",
        "₱1,500",
        4.6,
        198,
        "Hair Coloring",
        198
      ),
      new Service(
        16,
        "BASIC HIGHLIGHTS ONLY",
        "2hr",
        "₱1,999",
        4.4,
        167,
        "Hair Coloring",
        167
      ),
      new Service(
        17,
        "COLOR HIGHLIGHTS",
        "2.5hr",
        "₱1,200",
        4.7,
        189,
        "Hair Coloring",
        189
      ),
      new Service(
        18,
        "BALAYAGE",
        "3hr",
        "₱2,000",
        4.9,
        145,
        "Hair Coloring",
        145
      ),
      new Service(
        19,
        "PEEK A BOO",
        "2hr",
        "₱1,500",
        4.8,
        123,
        "Hair Coloring",
        123
      ),

      // Perming & Texture Services 〰️
      new Service(
        20,
        "PERM ANY LENGTH",
        "2hr",
        "₱1,888",
        4.6,
        234,
        "Perming & Texture Services",
        234
      ),
      new Service(
        21,
        "PERM + TREATMENT ANY LENGTH",
        "2.5hr",
        "₱2,288",
        4.7,
        198,
        "Perming & Texture Services",
        198
      ),
      new Service(
        22,
        "PERM + HAIRCOLOR ANY LENGTH",
        "3hr",
        "₱2,488",
        4.5,
        178,
        "Perming & Texture Services",
        178
      ),
      new Service(
        23,
        "AIR PERMING",
        "2hr",
        "₱1,588",
        4.8,
        145,
        "Perming & Texture Services",
        145
      ),
      new Service(
        24,
        "BASIC COLOR + AIR PERM",
        "3hr",
        "₱2,188",
        4.6,
        167,
        "Perming & Texture Services",
        167
      ),

      // Rebonding/Straightening ➖
      new Service(
        25,
        "REBOND ONLY",
        "3hr",
        "₱3,000",
        4.8,
        234,
        "Rebonding/Straightening",
        234,
        true
      ),
      new Service(
        26,
        "REBOND + HAIRCUT",
        "3.5hr",
        "₱3,299",
        4.7,
        189,
        "Rebonding/Straightening",
        189
      ),
      new Service(
        27,
        "REBOND + HAIR MASK",
        "3.5hr",
        "₱3,300",
        4.9,
        178,
        "Rebonding/Straightening",
        178
      ),
      new Service(
        28,
        "REBOND + HOTOIL",
        "3.5hr",
        "₱3,399",
        4.6,
        167,
        "Rebonding/Straightening",
        167
      ),
      new Service(
        29,
        "REBOND + BASIC COLOR",
        "4hr",
        "₱3,288",
        4.5,
        145,
        "Rebonding/Straightening",
        145
      ),
      new Service(
        30,
        "REBOND + HAIR MASK + HAIR CUT",
        "4hr",
        "₱3,599",
        4.7,
        156,
        "Rebonding/Straightening",
        156
      ),

      // Hair Treatments 💆
      new Service(
        31,
        "HOT OIL",
        "1hr",
        "₱300",
        4.6,
        127,
        "Hair Treatments",
        127
      ),
      new Service(
        32,
        "HAIR SPA",
        "1.5hr",
        "₱350",
        4.7,
        156,
        "Hair Treatments",
        156
      ),
      new Service(
        33,
        "HAIR MASK",
        "1hr",
        "₱300",
        4.5,
        203,
        "Hair Treatments",
        203
      ),
      new Service(
        34,
        "U COLAGENT",
        "1.5hr",
        "₱400",
        4.4,
        89,
        "Hair Treatments",
        89
      ),
      new Service(
        35,
        "U-COLLAGENT TREATMENT",
        "2hr",
        "₱500",
        4.3,
        78,
        "Hair Treatments",
        78
      ),
      new Service(
        36,
        "CYSTEINE TREATMENT",
        "3hr",
        "₱3,500",
        4.8,
        78,
        "Hair Treatments",
        78
      ),
      new Service(
        37,
        "CYSTEINE",
        "3hr",
        "₱3,500",
        4.7,
        92,
        "Hair Treatments",
        92
      ),
      new Service(
        38,
        "HAIR BOTOX",
        "2hr",
        "₱2,000",
        4.9,
        134,
        "Hair Treatments",
        134,
        true
      ),
      new Service(
        39,
        "XBOOTER",
        "2hr",
        "₱1,800",
        4.2,
        67,
        "Hair Treatments",
        67
      ),
      new Service(
        40,
        "KERADOSE",
        "2.5hr",
        "₱2,500",
        4.6,
        89,
        "Hair Treatments",
        89
      ),
      new Service(
        41,
        "KERABOND TREATMENT",
        "2.5hr",
        "₱2,800",
        4.5,
        76,
        "Hair Treatments",
        76
      ),
      new Service(
        42,
        "BRAZILLIAN BLOWOUT",
        "3hr",
        "₱3,500",
        4.8,
        156,
        "Hair Treatments",
        156
      ),
      new Service(
        43,
        "KERATIN BLOWOUT TREATMENT",
        "3hr",
        "₱3,200",
        4.7,
        145,
        "Hair Treatments",
        145
      ),
      new Service(
        44,
        "SPLEX #1 BOND CREATOR",
        "2hr",
        "₱2,500",
        4.4,
        45,
        "Hair Treatments",
        45
      ),
      new Service(
        45,
        "COLORPLEX 1",
        "2hr",
        "₱2,500",
        4.3,
        54,
        "Hair Treatments",
        54
      ),
      new Service(
        46,
        "OLAPLEX #1",
        "2hr",
        "₱2,500",
        4.4,
        45,
        "Hair Treatments",
        45
      ),

      // Combination Services 🔄
      new Service(
        47,
        "REBOND + CYSTEINE",
        "4hr",
        "₱4,500",
        4.7,
        123,
        "Combination Services",
        123
      ),
      new Service(
        48,
        "REBOND + U COLAGENT",
        "4hr",
        "₱4,000",
        4.6,
        98,
        "Combination Services",
        98
      ),
      new Service(
        49,
        "REBOND + HAIR BOTOX",
        "4hr",
        "₱4,200",
        4.8,
        112,
        "Combination Services",
        112
      ),
      new Service(
        50,
        "REBOND + KERADOSE",
        "4.5hr",
        "₱4,800",
        4.5,
        87,
        "Combination Services",
        87
      ),
      new Service(
        51,
        "REBOND + BOTOX",
        "4hr",
        "₱4,200",
        4.7,
        95,
        "Combination Services",
        95
      ),
      new Service(
        52,
        "REBOND + BRAZILLIAN BLOWOUT",
        "5hr",
        "₱5,500",
        4.9,
        78,
        "Combination Services",
        78
      ),
      new Service(
        53,
        "REBOND + KERATIN",
        "4.5hr",
        "₱5,000",
        4.8,
        134,
        "Combination Services",
        134
      ),
      new Service(
        54,
        "REBOND + HAIRSPA",
        "4hr",
        "₱3,500",
        4.6,
        145,
        "Combination Services",
        145
      ),
      new Service(
        55,
        "REBOND + HOT OIL",
        "3.5hr",
        "₱3,399",
        4.5,
        167,
        "Combination Services",
        167
      ),
      new Service(
        56,
        "REBOND + KERATIN BLOWOUT",
        "4.5hr",
        "₱4,800",
        4.7,
        123,
        "Combination Services",
        123
      ),
      new Service(
        57,
        "BASIC COLOR + HAIR SPA",
        "2.5hr",
        "₱1,350",
        4.6,
        189,
        "Combination Services",
        189
      ),
      new Service(
        58,
        "BASIC COLOR + HOT OIL",
        "2.5hr",
        "₱1,300",
        4.5,
        198,
        "Combination Services",
        198
      ),
      new Service(
        59,
        "BASIC COLOR + HAIR MASK",
        "2.5hr",
        "₱1,300",
        4.4,
        176,
        "Combination Services",
        176
      ),
      new Service(
        60,
        "BASIC COLOR + BOTOX",
        "3hr",
        "₱2,500",
        4.7,
        145,
        "Combination Services",
        145
      ),
      new Service(
        61,
        "BASIC COLOR + KERADOSE",
        "3.5hr",
        "₱3,000",
        4.6,
        134,
        "Combination Services",
        134
      ),
      new Service(
        62,
        "BASIC COLOR + KERABOND",
        "3.5hr",
        "₱3,200",
        4.5,
        123,
        "Combination Services",
        123
      ),
      new Service(
        63,
        "BASIC COLOR + BRAZILLIAN",
        "4hr",
        "₱3,800",
        4.8,
        112,
        "Combination Services",
        112
      ),
      new Service(
        64,
        "BASIC COLOR + KERATIN",
        "4hr",
        "₱3,500",
        4.7,
        128,
        "Combination Services",
        128
      ),
      new Service(
        65,
        "BASIC COLOR + U-COLLAGENT",
        "3hr",
        "₱1,500",
        4.4,
        109,
        "Combination Services",
        109
      ),
      new Service(
        66,
        "BASIC COLOR + CYSTEINE",
        "4hr",
        "₱4,000",
        4.6,
        98,
        "Combination Services",
        98
      ),
      new Service(
        67,
        "HAIR COLOR + HAIR MASK",
        "3hr",
        "₱1,800",
        4.5,
        167,
        "Combination Services",
        167
      ),
      new Service(
        68,
        "HAIR COLOR + HAIRCUT",
        "2.5hr",
        "₱1,500",
        4.7,
        189,
        "Combination Services",
        189
      ),
      new Service(
        69,
        "HAIR COLOR + HAIR BOTOX",
        "3.5hr",
        "₱2,800",
        4.8,
        145,
        "Combination Services",
        145
      ),
      new Service(
        70,
        "HAIR COLOR + KERATIN BLOW OUT",
        "4hr",
        "₱2,999",
        4.6,
        89,
        "Combination Services",
        89
      ),
      new Service(
        71,
        "COLOR HIGHLIGHTS + KERABOND",
        "4hr",
        "₱3,500",
        4.5,
        87,
        "Combination Services",
        87
      ),
      new Service(
        72,
        "COLOR HIGHLIGHTS + BRAZILLIAN",
        "4.5hr",
        "₱4,000",
        4.7,
        76,
        "Combination Services",
        76
      ),
      new Service(
        73,
        "COLOR HIGHLIGHTS + KERATIN",
        "4hr",
        "₱3,800",
        4.6,
        82,
        "Combination Services",
        82
      ),
      new Service(
        74,
        "BALAYAGE + KERABOND",
        "4.5hr",
        "₱4,200",
        4.8,
        67,
        "Combination Services",
        67
      ),
      new Service(
        75,
        "BALAYAGE + BRAZILLIAN",
        "5hr",
        "₱4,800",
        4.9,
        54,
        "Combination Services",
        54
      ),
      new Service(
        76,
        "BALAYAGE + KERATIN",
        "4.5hr",
        "₱4,500",
        4.7,
        61,
        "Combination Services",
        61
      ),
      new Service(
        77,
        "PEEK A BOO + BRAZILLIAN",
        "4hr",
        "₱4,200",
        4.6,
        58,
        "Combination Services",
        58
      ),
      new Service(
        78,
        "PEEK A BOO + KERATIN",
        "4hr",
        "₱3,800",
        4.5,
        63,
        "Combination Services",
        63
      ),
      new Service(
        79,
        "FASHION COLOR(FULL BLEACH) + BRAZILLIAN",
        "5hr",
        "₱4,500",
        4.7,
        45,
        "Combination Services",
        45
      ),
      new Service(
        80,
        "FASHION COLOR(FULL BLEACH) + KERATIN",
        "5hr",
        "₱4,200",
        4.6,
        48,
        "Combination Services",
        48
      ),
      new Service(
        81,
        "REBOND + BASIC COLOR + HAIR MASK",
        "5hr",
        "₱4,200",
        4.5,
        112,
        "Combination Services",
        112
      ),
      new Service(
        82,
        "REBOND + BASIC COLOR + BRAZILLIAN",
        "6hr",
        "₱5,800",
        4.8,
        78,
        "Combination Services",
        78
      ),
      new Service(
        83,
        "REBOND + BASIC COLOR + KERATIN",
        "5.5hr",
        "₱5,399",
        4.7,
        89,
        "Combination Services",
        89
      ),
      new Service(
        84,
        "REBOND + BASIC COLOR + U-COLLAGENT",
        "5hr",
        "₱4,500",
        4.6,
        76,
        "Combination Services",
        76
      ),
      new Service(
        85,
        "REBOND + BASIC COLOR + CYSTEINE",
        "6hr",
        "₱6,000",
        4.9,
        67,
        "Combination Services",
        67
      ),
      new Service(
        86,
        "REBOND + BASIC COLOR + KERADOSE",
        "5.5hr",
        "₱5,500",
        4.7,
        71,
        "Combination Services",
        71
      ),
      new Service(
        87,
        "REBOND + HAIR COLOR + HAIR BOTOX",
        "5hr",
        "₱4,800",
        4.8,
        82,
        "Combination Services",
        82
      ),
      new Service(
        88,
        "REBOND + HAIR COLOR + HAIR MASK + HAIRCUT",
        "5hr",
        "₱3,999",
        4.6,
        78,
        "Combination Services",
        78
      ),
      new Service(
        89,
        "REBOND + HAIR COLOR + HIGHLIGHTS + HAIRCUT + HOTOIL",
        "6hr",
        "₱5,999",
        4.7,
        56,
        "Combination Services",
        56
      ),
      new Service(
        90,
        "REBOND + HAIR COLOR + HAIR BOTOX + HAIR CUT",
        "5hr",
        "₱4,599",
        4.5,
        67,
        "Combination Services",
        67
      ),
      new Service(
        91,
        "REBOND + KERADOSE + HAIRCUT",
        "4.5hr",
        "₱4,999",
        4.6,
        73,
        "Combination Services",
        73
      ),
      new Service(
        92,
        "REBOND + KERADOSE + HAIRCOLOR + HAIRCUT",
        "5.5hr",
        "₱5,399",
        4.7,
        45,
        "Combination Services",
        45
      ),
      new Service(
        93,
        "CYSTEINE + U COLAGENT",
        "4hr",
        "₱4,000",
        4.5,
        54,
        "Combination Services",
        54
      ),
      new Service(
        94,
        "HAIR BOTOX + HAIRCUT",
        "3hr",
        "₱2,499",
        4.8,
        156,
        "Combination Services",
        156
      ),
      new Service(
        95,
        "HOTOIL + HAIRCUT",
        "1.5hr",
        "₱450",
        4.6,
        187,
        "Combination Services",
        187
      ),
      new Service(
        96,
        "HAIRSPA + HAIRCUT",
        "2hr",
        "₱550",
        4.7,
        165,
        "Combination Services",
        165
      ),
      new Service(
        97,
        "KERADOSE TREATMENT + HAIRCUT",
        "3hr",
        "₱2,699",
        4.5,
        98,
        "Combination Services",
        98
      ),
      new Service(
        98,
        "KERADOSE TREATMENT + HAIRCOLOR + HAIRCUT",
        "4hr",
        "₱3,699",
        4.6,
        78,
        "Combination Services",
        78
      ),

      // Hair Extensions 📎
      new Service(
        99,
        "HAIR EXTENSION ONLY(STARTING)",
        "2hr",
        "₱10,000",
        4.8,
        45,
        "Hair Extensions",
        45
      ),
      new Service(
        100,
        "HAIR EXTENSION REMOVAL",
        "1hr",
        "₱3,000",
        4.7,
        67,
        "Hair Extensions",
        67
      ),

      // Styling & Special Services ✨
      new Service(
        101,
        "HAIR AND MAKE UP",
        "1.5hr",
        "₱1,500",
        4.9,
        123,
        "Styling & Special Services",
        123
      ),
      new Service(
        102,
        "VIP",
        "2hr",
        "₱2,500",
        4.8,
        67,
        "Styling & Special Services",
        67
      ),
      new Service(
        103,
        "MC",
        "1hr",
        "₱1,500",
        4.7,
        89,
        "Styling & Special Services",
        89
      ),
      new Service(
        104,
        "DIAMOND",
        "3hr",
        "₱8,000",
        4.9,
        34,
        "Styling & Special Services",
        34
      ),

      // Package Sets/Codes 📦
      new Service(
        105,
        "THM",
        "2hr",
        "₱1,800",
        4.6,
        234,
        "Package Sets/Codes",
        234
      ),
      new Service(
        106,
        "TSF SET",
        "2.5hr",
        "₱2,200",
        4.7,
        189,
        "Package Sets/Codes",
        189
      ),
      new Service(
        107,
        "TKM",
        "2hr",
        "₱1,900",
        4.5,
        167,
        "Package Sets/Codes",
        167
      ),
      new Service(
        108,
        "MH SET",
        "1.5hr",
        "₱1,500",
        4.8,
        156,
        "Package Sets/Codes",
        156
      ),
      new Service(
        109,
        "LHS",
        "2hr",
        "₱1,700",
        4.6,
        145,
        "Package Sets/Codes",
        145
      ),
      new Service(
        110,
        "EWS",
        "2.5hr",
        "₱2,000",
        4.7,
        134,
        "Package Sets/Codes",
        134
      ),
      new Service(
        111,
        "FMS",
        "3hr",
        "₱2,500",
        4.5,
        123,
        "Package Sets/Codes",
        123
      ),
      new Service(
        112,
        "KV SET",
        "2hr",
        "₱1,800",
        4.6,
        112,
        "Package Sets/Codes",
        112
      ),
      new Service(
        113,
        "LHMB",
        "2.5hr",
        "₱2,100",
        4.7,
        98,
        "Package Sets/Codes",
        98
      ),
      new Service(
        114,
        "REV",
        "2hr",
        "₱1,900",
        4.5,
        87,
        "Package Sets/Codes",
        87
      ),
      new Service(
        115,
        "KS",
        "2hr",
        "₱1,800",
        4.6,
        76,
        "Package Sets/Codes",
        76
      ),
      new Service(
        116,
        "D.O",
        "1.5hr",
        "₱1,400",
        4.7,
        89,
        "Package Sets/Codes",
        89
      ),
      new Service(
        117,
        "NHRM",
        "2hr",
        "₱1,750",
        4.4,
        67,
        "Package Sets/Codes",
        67
      ),
      new Service(
        118,
        "M.O",
        "2hr",
        "₱1,850",
        4.5,
        54,
        "Package Sets/Codes",
        54
      ),
      new Service(
        119,
        "SLBP SET",
        "3hr",
        "₱2,600",
        4.7,
        61,
        "Package Sets/Codes",
        61
      ),
      new Service(
        120,
        "SLBPS",
        "3hr",
        "₱2,650",
        4.6,
        58,
        "Package Sets/Codes",
        58
      ),
      new Service(
        121,
        "EK SET",
        "2.5hr",
        "₱2,300",
        4.8,
        73,
        "Package Sets/Codes",
        73
      ),
      new Service(
        122,
        "A.O",
        "1.5hr",
        "₱1,300",
        4.5,
        82,
        "Package Sets/Codes",
        82
      ),
      new Service(
        123,
        "DETOX",
        "2hr",
        "₱1,600",
        4.6,
        94,
        "Package Sets/Codes",
        94
      ),
      new Service(
        124,
        "GLAM",
        "2.5hr",
        "₱2,400",
        4.7,
        71,
        "Package Sets/Codes",
        71
      ),
      new Service(
        125,
        "BKHM",
        "2hr",
        "₱1,950",
        4.5,
        63,
        "Package Sets/Codes",
        63
      ),
      new Service(
        126,
        "ES SET",
        "2hr",
        "₱1,800",
        4.6,
        78,
        "Package Sets/Codes",
        78
      ),
      new Service(
        127,
        "G AND G SET",
        "3hr",
        "₱2,800",
        4.8,
        45,
        "Package Sets/Codes",
        45
      ),
    ];
  }

  static getServicesByCategory(category) {
    return this.getAllServices().filter(
      (service) => service.category === category
    );
  }

  static getServiceById(id) {
    return this.getAllServices().find(
      (service) => service.id === Number.parseInt(id)
    );
  }

  static getAllCategories() {
    const services = this.getAllServices();
    return [...new Set(services.map((service) => service.category))];
  }

  // Helper method to convert service instance to MongoDB document format
  toMongoDocument() {
    return {
      name: this.name,
      duration: this.duration,
      priceRange: this.priceRange,
      rating: this.rating,
      totalBookings: this.totalBookings,
      category: this.category,
      isPromo: this.isPromo,
      availability: this.availability,
      description: this.description,
    };
  }
}

// Export the Mongoose model (for MongoDB usage)
export default ServiceModel;

// Export the Service class for local mock data
export { Service };
