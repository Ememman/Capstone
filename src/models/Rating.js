import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    rater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    ratedEntity: {
      type: {
        type: String,
        enum: [
          "appointment",
          "booking",
          "order",
          "staff",
          "product",
          "service",
        ],
        required: true,
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "ratedEntity.type",
      },
    },

    ratedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    ratedService: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
    },

    ratedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be an integer between 1 and 5",
      },
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    categories: {
      serviceQuality: {
        type: Number,
        min: 1,
        max: 5,
      },
      professionalism: {
        type: Number,
        min: 1,
        max: 5,
      },
      communication: {
        type: Number,
        min: 1,
        max: 5,
      },
      timeliness: {
        type: Number,
        min: 1,
        max: 5,
      },
      valueForMoney: {
        type: Number,
        min: 1,
        max: 5,
      },
    },

    status: {
      type: String,
      enum: ["active", "flagged", "removed"],
      default: "active",
    },

    response: {
      text: {
        type: String,
        trim: true,
        maxlength: 500,
      },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      respondedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

ratingSchema.index({ rater: 1 });
ratingSchema.index({ "ratedEntity.type": 1, "ratedEntity.id": 1 });
ratingSchema.index({ ratedStaff: 1 });
ratingSchema.index({ rating: 1 });
ratingSchema.index({ createdAt: -1 });
ratingSchema.index({ "ratedEntity.type": 1, status: 1 });

// Enhanced: Improved aggregation with better error handling
ratingSchema.statics.getAverageRating = async function (entityType, entityId) {
  try {
    const result = await this.aggregate([
      {
        $match: {
          "ratedEntity.type": entityType,
          "ratedEntity.id": new mongoose.Types.ObjectId(entityId),
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          ratingBreakdown: {
            $push: "$rating",
          },
        },
      },
    ]);

    // Initialize default breakdown
    const defaultBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (result.length > 0 && result[0].totalRatings > 0) {
      // Calculate breakdown from the rating array
      const breakdown = result[0].ratingBreakdown.reduce(
        (acc, rating) => {
          acc[rating] = (acc[rating] || 0) + 1;
          return acc;
        },
        { ...defaultBreakdown }
      );

      return {
        averageRating: Math.round(result[0].averageRating * 10) / 10,
        totalRatings: result[0].totalRatings,
        breakdown,
      };
    }

    return {
      averageRating: 0,
      totalRatings: 0,
      breakdown: defaultBreakdown,
    };
  } catch (error) {
    console.error("Error in getAverageRating:", error);
    return {
      averageRating: 0,
      totalRatings: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
};

// FIX: NEW METHOD - Get service rating from ratedService field (not ratedEntity)
// This is needed because booking ratings have ratedEntity.type = "booking"
// but store the service ID in ratedService field
ratingSchema.statics.getServiceAverageRating = async function (serviceId) {
  try {
    const result = await this.aggregate([
      {
        $match: {
          ratedService: new mongoose.Types.ObjectId(serviceId),
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          ratingBreakdown: {
            $push: "$rating",
          },
        },
      },
    ]);

    // Initialize default breakdown
    const defaultBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (result.length > 0 && result[0].totalRatings > 0) {
      // Calculate breakdown from the rating array
      const breakdown = result[0].ratingBreakdown.reduce(
        (acc, rating) => {
          acc[rating] = (acc[rating] || 0) + 1;
          return acc;
        },
        { ...defaultBreakdown }
      );

      return {
        averageRating: Math.round(result[0].averageRating * 10) / 10,
        totalRatings: result[0].totalRatings,
        breakdown,
      };
    }

    return {
      averageRating: 0,
      totalRatings: 0,
      breakdown: defaultBreakdown,
    };
  } catch (error) {
    console.error("Error in getServiceAverageRating:", error);
    return {
      averageRating: 0,
      totalRatings: 0,
      breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
};

// Enhanced: Improved staff rating calculation
ratingSchema.statics.getStaffAverageRating = async function (staffId) {
  try {
    const result = await this.aggregate([
      {
        $match: {
          ratedStaff: new mongoose.Types.ObjectId(staffId),
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          serviceQuality: { $avg: "$categories.serviceQuality" },
          professionalism: { $avg: "$categories.professionalism" },
          communication: { $avg: "$categories.communication" },
          timeliness: { $avg: "$categories.timeliness" },
        },
      },
    ]);

    if (result.length > 0 && result[0].totalRatings > 0) {
      return {
        averageRating: Math.round(result[0].averageRating * 10) / 10,
        totalRatings: result[0].totalRatings,
        categoryAverages: {
          serviceQuality: Math.round((result[0].serviceQuality || 0) * 10) / 10,
          professionalism:
            Math.round((result[0].professionalism || 0) * 10) / 10,
          communication: Math.round((result[0].communication || 0) * 10) / 10,
          timeliness: Math.round((result[0].timeliness || 0) * 10) / 10,
        },
      };
    }

    return {
      averageRating: 0,
      totalRatings: 0,
      categoryAverages: {
        serviceQuality: 0,
        professionalism: 0,
        communication: 0,
        timeliness: 0,
      },
    };
  } catch (error) {
    console.error("Error in getStaffAverageRating:", error);
    return {
      averageRating: 0,
      totalRatings: 0,
      categoryAverages: {
        serviceQuality: 0,
        professionalism: 0,
        communication: 0,
        timeliness: 0,
      },
    };
  }
};

// Enhanced: Improved hasRated method
ratingSchema.statics.hasRated = async function (raterId, entityType, entityId) {
  try {
    // FIX: Ensure entityId is properly converted to ObjectId
    let entityObjectId;
    try {
      entityObjectId = new mongoose.Types.ObjectId(entityId);
    } catch (error) {
      console.error("Invalid entityId format:", entityId);
      return false;
    }

    const existingRating = await this.findOne({
      rater: raterId,
      "ratedEntity.type": entityType,
      "ratedEntity.id": entityObjectId,
      status: "active",
    });

    return !!existingRating;
  } catch (error) {
    console.error("Error in hasRated:", error);
    return false;
  }
};

// Enhanced: Improved entity rating update method
ratingSchema.statics.updateEntityRatings = async function (
  entityType,
  entityId
) {
  try {
    console.log(`🔄 Updating rating stats for ${entityType}: ${entityId}`);

    let Model;
    switch (entityType) {
      case "service":
        Model = mongoose.model("Service");
        break;
      case "product":
        Model = mongoose.model("Product");
        break;
      case "staff":
        Model = mongoose.model("User");
        break;
      case "appointment":
        Model = mongoose.model("Appointment");
        break;
      case "booking":
        Model = mongoose.model("Booking");
        break;
      case "order":
        Model = mongoose.model("Order");
        break;
      default:
        console.log(`⚠️ No model found for entity type: ${entityType}`);
        return;
    }

    if (Model) {
      const entity = await Model.findById(entityId);
      if (entity && typeof entity.updateRatingStats === "function") {
        await entity.updateRatingStats();
        console.log(`✅ Successfully updated ${entityType} rating stats`);
      } else if (entity) {
        console.log(`ℹ️ Entity found but no updateRatingStats method`);
        // Fallback: manually update rating stats
        await this.manualUpdateRatingStats(entityType, entityId);
      } else {
        console.log(`❌ Entity not found: ${entityId}`);
      }
    }
  } catch (error) {
    console.error(`Error updating ${entityType} ratings:`, error);
  }
};

// Enhanced: Manual rating stats update as fallback
ratingSchema.statics.manualUpdateRatingStats = async function (
  entityType,
  entityId
) {
  try {
    const ratingStats = await this.getAverageRating(entityType, entityId);

    let Model;
    let updateQuery = {};

    switch (entityType) {
      case "service":
        Model = mongoose.model("Service");
        updateQuery = {
          "rating.average": ratingStats.averageRating,
          "rating.totalRaters": ratingStats.totalRatings,
          "rating.breakdown": ratingStats.breakdown,
        };
        break;
      case "product":
        Model = mongoose.model("Product");
        updateQuery = {
          "rating.average": ratingStats.averageRating,
          "rating.totalRaters": ratingStats.totalRatings,
          "rating.breakdown": ratingStats.breakdown,
        };
        break;
      case "staff":
        Model = mongoose.model("User");
        // Staff might have different rating structure
        break;
      case "booking":
        Model = mongoose.model("Booking");
        // Bookings might not need rating stats in the same way
        break;
    }

    if (Model && Object.keys(updateQuery).length > 0) {
      await Model.findByIdAndUpdate(entityId, updateQuery);
      console.log(`✅ Manually updated ${entityType} rating stats`);
    }
  } catch (error) {
    console.error(`Error in manualUpdateRatingStats:`, error);
  }
};

// Enhanced: Post-save middleware to automatically update entity ratings
ratingSchema.post("save", async function (doc) {
  try {
    // Update the main entity rating
    await mongoose
      .model("Rating")
      .updateEntityRatings(doc.ratedEntity.type, doc.ratedEntity.id);

    // Update staff rating if applicable
    if (doc.ratedStaff) {
      await mongoose
        .model("Rating")
        .updateEntityRatings("staff", doc.ratedStaff);
    }

    // Update service rating if applicable
    if (doc.ratedService) {
      await mongoose
        .model("Rating")
        .updateEntityRatings("service", doc.ratedService);
    }

    // Update product rating if applicable
    if (doc.ratedProduct) {
      await mongoose
        .model("Rating")
        .updateEntityRatings("product", doc.ratedProduct);
    }
  } catch (error) {
    console.error("Error in rating post-save middleware:", error);
  }
});

// Enhanced: Get ratings with advanced filtering
ratingSchema.statics.getRatingsWithFilters = async function (filters = {}) {
  try {
    const {
      entityType,
      entityId,
      minRating,
      maxRating,
      hasComment,
      dateFrom,
      dateTo,
      includeReplies,
    } = filters;

    const query = { status: "active" };

    if (entityType) query["ratedEntity.type"] = entityType;
    if (entityId) query["ratedEntity.id"] = entityId;
    if (minRating) query.rating = { ...query.rating, $gte: minRating };
    if (maxRating) query.rating = { ...query.rating, $lte: maxRating };
    if (hasComment) query.comment = { $exists: true, $ne: "" };
    if (dateFrom && dateTo) {
      query.createdAt = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo),
      };
    }

    const ratings = await this.find(query)
      .populate("rater", "username firstName profileImage")
      .populate("ratedStaff", "username firstName profileImage position")
      .populate("ratedService", "name category")
      .populate("ratedProduct", "name category image")
      .sort({ createdAt: -1 });

    return ratings;
  } catch (error) {
    console.error("Error in getRatingsWithFilters:", error);
    throw error;
  }
};

const Rating = mongoose.model("Rating", ratingSchema);
export default Rating;
