import express from "express";
import Rating from "../models/Rating.js";
import Appointment from "../models/Appointment.js";
import Booking from "../models/Booking.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { authMiddleware, customerOnly, staffOnly } from "../middleware/auth.js";
import mongoose from "mongoose";
import notificationService from "../services/notificationService.js";

const router = express.Router();

// Enhanced helper function to update entity ratings with booking support
async function updateEntityRatingStats(entityType, entityId) {
  try {
    console.log(`🔄 Updating rating stats for ${entityType}: ${entityId}`);

    // FIX: Validate entityId before processing
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      console.log(`⚠️ Invalid entity ID: ${entityId}`);
      return;
    }

    const entityObjectId = new mongoose.Types.ObjectId(entityId);

    let Model;
    switch (entityType) {
      case "service":
        Model = Service;
        break;
      case "product":
        Model = Product;
        break;
      case "staff":
        Model = User;
        break;
      case "appointment":
        Model = Appointment;
        break;
      case "booking":
        Model = Booking;
        break;
      case "order":
        Model = Order;
        break;
      default:
        console.log(`⚠️ No model found for entity type: ${entityType}`);
        return;
    }

    if (Model) {
      const entity = await Model.findById(entityObjectId);
      if (entity && typeof entity.updateRatingStats === "function") {
        await entity.updateRatingStats();
        console.log(`✅ Successfully updated ${entityType} rating stats`);
      } else if (entity) {
        console.log(`ℹ️ Entity found but no updateRatingStats method`);
        // Use static method fallback
        if (Model.updateServiceRating && entityType === "service") {
          await Model.updateServiceRating(entityObjectId);
        } else if (Model.updateProductRating && entityType === "product") {
          await Model.updateProductRating(entityObjectId);
        }
      } else {
        console.log(`❌ Entity not found: ${entityId}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error updating ${entityType} rating stats:`, error);
    // Don't throw - just log the error to prevent breaking the main flow
  }
}

// @desc    Submit a rating
// @route   POST /api/ratings
// @access  Private (customer only)
router.post("/", authMiddleware, customerOnly, async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      staffId,
      serviceId,
      productId,
      rating,
      comment,
      categories,
    } = req.body;

    console.log("⭐ Rating submission request:", {
      entityType,
      entityId,
      staffId,
      serviceId,
      productId,
      rating,
      comment: comment ? "provided" : "not provided",
      categories: categories ? "provided" : "not provided",
      userId: req.user._id,
    });

    // Validate required fields
    if (!entityType || !entityId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Entity type, entity ID, and rating are required",
      });
    }

    // Validate rating value
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5",
      });
    }

    // Validate entity type
    const validEntityTypes = [
      "appointment",
      "booking",
      "order",
      "staff",
      "product",
      "service",
    ];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${validEntityTypes.join(
          ", "
        )}`,
      });
    }

    // FIX: Validate entityId format
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entity ID format",
      });
    }

    // Check if entity exists and can be rated
    let entity;
    let Model;

    switch (entityType) {
      case "booking":
        Model = Booking;
        console.log(`🔍 Validating booking with ID: ${entityId}`);
        entity = await Model.findById(entityId);
        if (!entity) {
          return res.status(404).json({
            success: false,
            message: "Booking not found",
          });
        }

        // Enhanced booking validation
        const canRateBooking = entity.canBeRated();
        const customerMatch =
          entity.customer.toString() === req.user._id.toString();

        console.log(`📊 Enhanced booking rating validation:`, {
          bookingId: entityId,
          status: entity.status,
          isRated: entity.isRated,
          canRate: canRateBooking,
          customerMatch: customerMatch,
        });

        if (!canRateBooking) {
          return res.status(400).json({
            success: false,
            message: entity.isRated
              ? "You have already rated this booking"
              : "This booking cannot be rated yet (must be completed)",
          });
        }

        if (!customerMatch) {
          return res.status(403).json({
            success: false,
            message: "You can only rate your own bookings",
          });
        }
        break;

      case "appointment":
        Model = Appointment;
        entity = await Model.findById(entityId);
        if (!entity) {
          return res.status(404).json({
            success: false,
            message: "Appointment not found",
          });
        }
        if (entity.customer.toString() !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "You can only rate your own appointments",
          });
        }
        break;

      case "order":
        Model = Order;
        entity = await Model.findById(entityId);
        if (!entity) {
          return res.status(404).json({
            success: false,
            message: "Order not found",
          });
        }
        if (entity.customer.toString() !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "You can only rate your own orders",
          });
        }
        break;

      case "service":
      case "product":
      case "staff":
        // These can be rated directly without ownership check
        Model =
          entityType === "service"
            ? Service
            : entityType === "product"
            ? Product
            : User;
        entity = await Model.findById(entityId);
        if (!entity) {
          return res.status(404).json({
            success: false,
            message: `${
              entityType.charAt(0).toUpperCase() + entityType.slice(1)
            } not found`,
          });
        }
        break;
    }

    console.log(`✅ Entity validation result:`, {
      entityFound: !!entity,
      canRate: true,
      entityType,
      entityStatus: entity.status,
      entityIsRated: entity.isRated,
    });

    // Only check for duplicate ratings if it's NOT a product
    if (entityType !== "product") {
      const existingRating = await Rating.findOne({
        rater: req.user._id,
        "ratedEntity.type": entityType,
        "ratedEntity.id": entityId,
        status: "active",
      });

      if (existingRating) {
        return res.status(400).json({
          success: false,
          message: "You have already rated this " + entityType,
        });
      }
    }

    // Create the rating
    const newRating = new Rating({
      rater: req.user._id,
      ratedEntity: {
        type: entityType,
        id: entityId,
      },
      ratedStaff:
        staffId || (entity.selectedStylist ? entity.selectedStylist : null),
      ratedService: serviceId || (entity.service ? entity.service : null),
      ratedProduct: productId || (entity.product ? entity.product : null),
      rating,
      comment: comment || "",
      categories: categories || {},
    });

    await newRating.save();
    console.log(`✅ New rating created: ${newRating._id}`);

    // FIX: Mark entity as rated (for bookings/appointments/orders)
    if (entity.markAsRated && typeof entity.markAsRated === "function") {
      await entity.markAsRated(newRating._id);
      console.log(
        `✅ ${
          entityType.charAt(0).toUpperCase() + entityType.slice(1)
        } marked as rated: ${entityId}`
      );
    }

    // Track rating submission activity
    await notificationService.trackUserActivity(
      req.user._id,
      "rating_submitted",
      {
        ratingId: newRating._id,
        entityType: entityType,
        entityId: entityId,
        ratingValue: rating,
        hasComment: !!comment,
        hasCategories: !!categories && Object.keys(categories).length > 0,
      }
    );

    // FIX: Update entity rating stats - with a small delay to ensure DB commit
    setTimeout(async () => {
      try {
        await updateEntityRatingStats(entityType, entityId);

        if (staffId || entity.selectedStylist) {
          await updateEntityRatingStats(
            "staff",
            staffId || entity.selectedStylist
          );
        }

        if (serviceId || entity.service) {
          await updateEntityRatingStats("service", serviceId || entity.service);
        }

        if (productId || entity.product) {
          await updateEntityRatingStats("product", productId || entity.product);
        }
      } catch (error) {
        console.error("Error in delayed rating stats update:", error);
      }
    }, 500); // 500ms delay to ensure DB commit

    // Populate the response
    await newRating.populate("rater", "username firstName profileImage");
    await newRating.populate(
      "ratedStaff",
      "username firstName profileImage position"
    );
    await newRating.populate("ratedService", "name category");
    await newRating.populate("ratedProduct", "name category image");

    console.log(
      `🎉 Rating submitted successfully for ${entityType}: ${entityId}`
    );

    res.status(201).json({
      success: true,
      message: "Rating submitted successfully",
      data: newRating,
    });
  } catch (error) {
    console.error("Rating submission error:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting rating",
      error: error.message,
    });
  }
});

// @desc    Rate a product from a specific order
// @route   POST /api/ratings/order-product
// @access  Private (customer only)
router.post(
  "/order-product",
  authMiddleware,
  customerOnly,
  async (req, res) => {
    try {
      const { orderId, productId, rating, comment } = req.body;

      console.log("⭐ Rating product from order:", {
        orderId,
        productId,
        rating,
        comment: comment ? "provided" : "not provided",
        userId: req.user._id,
      });

      // Validate required fields
      if (!orderId || !productId || !rating) {
        return res.status(400).json({
          success: false,
          message: "Order ID, product ID, and rating are required",
        });
      }

      // Validate rating value
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return res.status(400).json({
          success: false,
          message: "Rating must be an integer between 1 and 5",
        });
      }

      // Validate IDs
      if (
        !mongoose.Types.ObjectId.isValid(orderId) ||
        !mongoose.Types.ObjectId.isValid(productId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID or product ID format",
        });
      }

      // Check if order exists and user owns it
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.customer.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only rate products from your own orders",
        });
      }

      // Check if product exists in order
      const orderItem = order.items.find(
        (item) => item.product.toString() === productId.toString()
      );

      if (!orderItem) {
        return res.status(404).json({
          success: false,
          message: "Product not found in this order",
        });
      }

      // Check if product can be rated from this order
      if (!order.canRateProduct(productId)) {
        return res.status(400).json({
          success: false,
          message: orderItem.isRated
            ? "You have already rated this product from this order"
            : "This product cannot be rated yet (order must be delivered)",
        });
      }

      // Create the rating
      const newRating = new Rating({
        rater: req.user._id,
        ratedEntity: {
          type: "product",
          id: productId,
        },
        ratedProduct: productId,
        rating,
        comment: comment || "",
        order: orderId, // Store reference to the order for context
      });

      await newRating.save();
      console.log(`✅ Product rating created: ${newRating._id}`);

      // Mark the product as rated in the order
      await order.markProductAsRated(productId, newRating._id);

      // Track rating submission activity
      await notificationService.trackUserActivity(
        req.user._id,
        "rating_submitted",
        {
          ratingId: newRating._id,
          entityType: "product",
          entityId: productId,
          ratingValue: rating,
          orderId: orderId,
          hasComment: !!comment,
        }
      );

      // Update product rating stats
      setTimeout(async () => {
        try {
          await updateEntityRatingStats("product", productId);
        } catch (error) {
          console.error("Error in delayed product rating stats update:", error);
        }
      }, 500);

      // Populate the response
      await newRating.populate("rater", "username firstName profileImage");
      await newRating.populate("ratedProduct", "name category image");

      console.log(`🎉 Product rated successfully from order: ${orderId}`);

      res.status(201).json({
        success: true,
        message: "Product rated successfully",
        data: newRating,
      });
    } catch (error) {
      console.error("Product rating from order error:", error);
      res.status(500).json({
        success: false,
        message: "Error rating product",
        error: error.message,
      });
    }
  }
);

// CRITICAL FIX: Move this route BEFORE /:entityType/:entityId to prevent "my-ratings" being treated as entityId
// @desc    Get user's ratings (ratings they gave)
// @route   GET /api/ratings/user/my-ratings
// @access  Private
router.get("/user/my-ratings", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, entityType } = req.query;

    const query = {
      rater: req.user._id,
      status: "active",
    };

    if (entityType) {
      query["ratedEntity.type"] = entityType;
    }

    const skip = (page - 1) * limit;

    const ratings = await Rating.find(query)
      // FIX: Removed .populate("ratedEntity.id") - causes schema error with refPath
      .populate("ratedStaff", "username firstName profileImage position")
      .populate("ratedService", "name category")
      .populate("ratedProduct", "name category image")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments(query);

    res.json({
      success: true,
      data: {
        ratings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get user ratings error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving user ratings",
      error: error.message,
    });
  }
});

// @desc    Get ratings stats for authenticated user
// @route   GET /api/ratings/user/stats
// @access  Private
router.get("/user/stats", authMiddleware, async (req, res) => {
  try {
    const totalRatingsGiven = await Rating.countDocuments({
      rater: req.user._id,
      status: "active",
    });

    const averageRatingGiven = await Rating.aggregate([
      {
        $match: {
          rater: req.user._id,
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
        },
      },
    ]);

    const ratingsByEntity = await Rating.aggregate([
      {
        $match: {
          rater: req.user._id,
          status: "active",
        },
      },
      {
        $group: {
          _id: "$ratedEntity.type",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalRatingsGiven,
        averageRatingGiven:
          averageRatingGiven.length > 0
            ? Math.round(averageRatingGiven[0].avgRating * 10) / 10
            : 0,
        ratingsByEntity: ratingsByEntity.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Get user rating stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving user rating stats",
      error: error.message,
    });
  }
});

// FIX: Make this endpoint PUBLIC - no authentication required
// @desc    Update entity rating stats manually
// @route   PUT /api/ratings/update-stats/:entityType/:entityId
// @access  Public (changed from staff-only)
router.put("/update-stats/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Validate entity ID
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entity ID format",
      });
    }

    await updateEntityRatingStats(entityType, entityId);

    res.json({
      success: true,
      message: `${entityType} rating stats updated successfully`,
    });
  } catch (error) {
    console.error("Update rating stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating rating stats",
      error: error.message,
    });
  }
});

// @desc    Export ratings to CSV
// @route   GET /api/ratings/export
// @access  Private (staff only)
router.get("/export", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { startDate, endDate, entityType } = req.query;

    const query = { status: "active" };

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (entityType) {
      query["ratedEntity.type"] = entityType;
    }

    const ratings = await Rating.find(query)
      .populate("rater", "username email")
      // FIX: Removed .populate("ratedEntity.id") - causes schema error
      .sort({ createdAt: -1 });

    const headers = [
      "Date",
      "Entity Type",
      "Entity Name",
      "Rating",
      "Comment",
      "Rated Staff",
      "Categories",
    ];

    const csvRows = ratings.map((rating) => [
      rating.createdAt.toISOString(),
      rating.ratedEntity.type,
      rating.ratedEntity.id?.name || "N/A",
      rating.rating,
      `"${(rating.comment || "").replace(/"/g, '""')}"`,
      rating.ratedStaff?.username || "N/A",
      rating.categories ? JSON.stringify(rating.categories) : "N/A",
    ]);

    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ratings-export.csv"'
    );
    res.send(csvContent);
  } catch (error) {
    console.error("Export ratings error:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting ratings",
      error: error.message,
    });
  }
});

// @desc    Get ratings for a specific entity
// @route   GET /api/ratings/:entityType/:entityId
// @access  Public
router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { page = 1, limit = 10, rating, sortBy = "createdAt" } = req.query;

    // FIX: Validate entityId format
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entity ID format",
      });
    }

    const query = {
      "ratedEntity.type": entityType,
      "ratedEntity.id": entityId,
      status: "active",
    };

    if (rating) {
      query.rating = parseInt(rating);
    }

    const skip = (page - 1) * limit;

    let sortObj = { createdAt: -1 };
    if (sortBy === "rating-high") {
      sortObj = { rating: -1, createdAt: -1 };
    } else if (sortBy === "rating-low") {
      sortObj = { rating: 1, createdAt: -1 };
    }

    const ratings = await Rating.find(query)
      .populate("rater", "username firstName profileImage")
      .populate("ratedStaff", "username firstName profileImage position")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments(query);

    const averageRatingData = await Rating.getAverageRating(
      entityType,
      entityId
    );

    res.json({
      success: true,
      data: {
        ratings,
        averageRating: averageRatingData.averageRating,
        totalRatings: averageRatingData.totalRatings,
        breakdown: averageRatingData.breakdown,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get ratings error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Update rating
// @route   PUT /api/ratings/:id
// @access  Private (rater only)
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, categories } = req.body;

    const existingRating = await Rating.findById(id);

    if (!existingRating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    if (existingRating.rater.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own ratings",
      });
    }

    if (rating !== undefined) existingRating.rating = rating;
    if (comment !== undefined) existingRating.comment = comment;
    if (categories !== undefined) existingRating.categories = categories;

    await existingRating.save();

    // Track rating update activity
    await notificationService.trackUserActivity(
      req.user._id,
      "rating_updated",
      {
        ratingId: existingRating._id,
        entityType: existingRating.ratedEntity.type,
        entityId: existingRating.ratedEntity.id,
        newRatingValue: rating,
      }
    );

    // Update entity rating stats
    await updateEntityRatingStats(
      existingRating.ratedEntity.type,
      existingRating.ratedEntity.id
    );

    if (existingRating.ratedStaff) {
      await updateEntityRatingStats("staff", existingRating.ratedStaff);
    }

    if (existingRating.ratedService) {
      await updateEntityRatingStats("service", existingRating.ratedService);
    }

    if (existingRating.ratedProduct) {
      await updateEntityRatingStats("product", existingRating.ratedProduct);
    }

    res.json({
      success: true,
      message: "Rating updated successfully",
      data: existingRating,
    });
  } catch (error) {
    console.error("Update rating error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating rating",
      error: error.message,
    });
  }
});

// @desc    Delete/Remove rating
// @route   DELETE /api/ratings/:id
// @access  Private (rater only)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const rating = await Rating.findById(id);

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    if (rating.rater.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own ratings",
      });
    }

    rating.status = "removed";
    await rating.save();

    // Update entity rating stats
    await updateEntityRatingStats(
      rating.ratedEntity.type,
      rating.ratedEntity.id
    );

    if (rating.ratedStaff) {
      await updateEntityRatingStats("staff", rating.ratedStaff);
    }

    if (rating.ratedService) {
      await updateEntityRatingStats("service", rating.ratedService);
    }

    if (rating.ratedProduct) {
      await updateEntityRatingStats("product", rating.ratedProduct);
    }

    res.json({
      success: true,
      message: "Rating removed successfully",
    });
  } catch (error) {
    console.error("Delete rating error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting rating",
      error: error.message,
    });
  }
});

// @desc    Add response to rating
// @route   POST /api/ratings/:id/response
// @access  Private (staff only)
router.post("/:id/response", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Response text is required",
      });
    }

    const rating = await Rating.findById(id);

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    rating.response = {
      text: text.trim(),
      respondedBy: req.user._id,
      respondedAt: new Date(),
    };

    await rating.save();

    await rating.populate(
      "response.respondedBy",
      "username firstName position"
    );

    res.json({
      success: true,
      message: "Response added successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Add response error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding response",
      error: error.message,
    });
  }
});

// @desc    Flag rating
// @route   PUT /api/ratings/:id/flag
// @access  Private (staff only)
router.put("/:id/flag", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const rating = await Rating.findById(id);

    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    rating.status = "flagged";
    await rating.save();

    res.json({
      success: true,
      message: "Rating flagged successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Flag rating error:", error);
    res.status(500).json({
      success: false,
      message: "Error flagging rating",
      error: error.message,
    });
  }
});

// @desc    Get staff ratings
// @route   GET /api/ratings/staff/:staffId
// @access  Public
router.get("/staff/:staffId", async (req, res) => {
  try {
    const { staffId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const ratings = await Rating.find({
      ratedStaff: staffId,
      status: "active",
    })
      .populate("rater", "username firstName profileImage")
      .populate("ratedService", "name category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments({
      ratedStaff: staffId,
      status: "active",
    });

    const staffRatingStats = await Rating.getStaffAverageRating(staffId);

    res.json({
      success: true,
      data: {
        ratings,
        stats: staffRatingStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get staff ratings error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving staff ratings",
      error: error.message,
    });
  }
});

// @desc    Check rating eligibility
// @route   POST /api/ratings/check-eligibility
// @access  Private
router.post("/check-eligibility", authMiddleware, async (req, res) => {
  try {
    const { entityType, entityId } = req.body;

    if (!entityType || !entityId) {
      return res.status(400).json({
        success: false,
        message: "Entity type and entity ID are required",
      });
    }

    // Check if already rated (except for products)
    let hasRated = false;
    if (entityType !== "product") {
      hasRated = await Rating.hasRated(req.user._id, entityType, entityId);
    }

    let canRate = !hasRated;
    let reason = null;

    // Additional checks based on entity type
    if (entityType === "booking") {
      const booking = await Booking.findById(entityId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      if (booking.customer.toString() !== req.user._id.toString()) {
        canRate = false;
        reason = "You can only rate your own bookings";
      } else if (!booking.canBeRated()) {
        canRate = false;
        reason = booking.isRated
          ? "You have already rated this booking"
          : "This booking cannot be rated yet (must be completed)";
      }
    }

    res.json({
      success: true,
      data: {
        canRate,
        hasRated,
        reason,
      },
    });
  } catch (error) {
    console.error("Check eligibility error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking rating eligibility",
      error: error.message,
    });
  }
});

// @desc    Get rating summary for entity
// @route   GET /api/ratings/summary/:entityType/:entityId
// @access  Public
router.get("/summary/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Validate entity ID
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entity ID format",
      });
    }

    const summary = await Rating.getAverageRating(entityType, entityId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Get rating summary error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving rating summary",
      error: error.message,
    });
  }
});

export default router;
