import express from "express";
import Service from "../models/Service.js";
import Rating from "../models/Rating.js";
import {
  optionalAuth,
  authMiddleware,
  customerOnly,
} from "../middleware/auth.js";

const router = express.Router();

const parsePrice = (priceRange) => {
  if (!priceRange) return 0;
  // Remove ₱ symbol and commas, then parse the number
  const match = priceRange.match(/[\d,]+/);
  if (match) {
    return Number.parseInt(match[0].replace(/,/g, ""));
  }
  return 0;
};

const parseDuration = (duration) => {
  if (!duration) return 0;
  const match = duration.match(/([\d.]+)(min|hr)/);
  if (match) {
    const value = Number.parseFloat(match[1]);
    const unit = match[2];
    return unit === "hr" ? value * 60 : value;
  }
  return 0;
};

const buildSortObject = (sortBy, sortOrder) => {
  let sortObj = {};

  switch (sortBy) {
    case "category":
      sortObj = { category: 1, name: 1 };
      break;
    case "promo":
      sortObj = { isPromo: -1, name: 1 };
      break;
    case "price-low":
      // Price sorting handled separately due to string parsing
      sortObj = { _priceSort: 1 };
      break;
    case "price-high":
      sortObj = { _priceSort: -1 };
      break;
    case "duration":
      // Duration sorting handled separately due to string parsing
      sortObj = { _durationSort: 1 };
      break;
    case "popularity":
    case "most-booked":
      sortObj = { totalBookings: -1 };
      break;
    case "top-rated":
      sortObj = { "rating.average": -1, "rating.totalRaters": -1 };
      break;
    case "newest":
      sortObj = { createdAt: -1 };
      break;
    case "availability":
      sortObj = { availability: 1, name: 1 };
      break;
    case "ascending":
      sortObj = { name: 1 };
      break;
    case "descending":
      sortObj = { name: -1 };
      break;
    default:
      // Default sort by serviceId
      sortObj = { createdAt: -1 };
  }

  // Apply custom sort order if provided
  if (sortOrder === "asc" || sortOrder === "desc") {
    const direction = sortOrder === "asc" ? 1 : -1;
    const keys = Object.keys(sortObj);
    if (keys.length > 0) {
      sortObj[keys[0]] = direction;
    }
  }

  return sortObj;
};

// GET all services with sorting support
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { sortBy, sortOrder, category, minRating } = req.query;

    let query = {};

    // Filter by category
    if (category && category !== "all") {
      query.category = { $regex: new RegExp(category, "i") };
    }

    // Filter by minimum rating
    if (minRating) {
      query["rating.average"] = { $gte: parseFloat(minRating) };
    }

    // Fetch all services
    let services = await Service.find(query);

    if (sortBy === "price-low" || sortBy === "price-high") {
      services = services.sort((a, b) => {
        const priceA = parsePrice(a.priceRange);
        const priceB = parsePrice(b.priceRange);
        return sortBy === "price-low" ? priceA - priceB : priceB - priceA;
      });
    } else if (sortBy === "duration") {
      services = services.sort((a, b) => {
        const durationA = parseDuration(a.duration);
        const durationB = parseDuration(b.duration);
        return durationA - durationB;
      });
    } else {
      const sortObj = buildSortObject(sortBy, sortOrder);
      services = await Service.find(query).sort(sortObj);
    }

    res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      data: services,
      total: services.length,
      sortedBy: sortBy || "default",
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving services",
      error: error.message,
    });
  }
});

// GET services by category with sorting support
router.get("/category/:category", optionalAuth, async (req, res) => {
  try {
    const { category } = req.params;
    const { sortBy, sortOrder } = req.query;

    // Fetch services by category
    let services = await Service.find({
      category: { $regex: new RegExp(category, "i") },
    });

    if (services.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No services found for category: ${category}`,
      });
    }

    if (sortBy === "price-low" || sortBy === "price-high") {
      services = services.sort((a, b) => {
        const priceA = parsePrice(a.priceRange);
        const priceB = parsePrice(b.priceRange);
        return sortBy === "price-low" ? priceA - priceB : priceB - priceA;
      });
    } else if (sortBy === "duration") {
      services = services.sort((a, b) => {
        const durationA = parseDuration(a.duration);
        const durationB = parseDuration(b.duration);
        return durationA - durationB;
      });
    } else {
      const sortObj = buildSortObject(sortBy, sortOrder);
      services = await Service.find({
        category: { $regex: new RegExp(category, "i") },
      }).sort(sortObj);
    }

    res.status(200).json({
      success: true,
      message: `Services for category '${category}' retrieved successfully`,
      data: services,
      total: services.length,
      sortedBy: sortBy || "default",
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user._id,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving services by category",
      error: error.message,
    });
  }
});

// GET all categories (sorted alphabetically)
router.get("/categories", optionalAuth, async (req, res) => {
  try {
    const categories = await Service.distinct("category");
    categories.sort();

    res.status(200).json({
      success: true,
      message: "Categories retrieved successfully",
      data: categories,
      total: categories.length,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving categories",
      error: error.message,
    });
  }
});

// GET service by ID
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `Service with ID ${id} not found`,
      });
    }

    // Update rating stats in case they're outdated
    await service.updateRatingStats();

    res.status(200).json({
      success: true,
      message: "Service retrieved successfully",
      data: service,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving service",
      error: error.message,
    });
  }
});

// GET /api/services/:id/ratings - Get service ratings
router.get("/:id/ratings", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const skip = (page - 1) * limit;
    const query = {
      "ratedEntity.type": "service",
      "ratedEntity.id": id,
      status: "active",
    };

    if (rating) {
      query.rating = parseInt(rating);
    }

    const ratings = await Rating.find(query)
      .populate("rater", "username firstName profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments(query);

    // Update service rating stats
    await service.updateRatingStats();

    res.json({
      success: true,
      data: {
        service: {
          _id: service._id,
          name: service.name,
          rating: service.rating,
        },
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
    res.status(500).json({
      success: false,
      message: "Error retrieving service ratings",
      error: error.message,
    });
  }
});

// GET /api/services/featured/top-rated - Get top rated services
router.get("/featured/top-rated", optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const services = await Service.find({
      "rating.totalRaters": { $gt: 0 },
      "rating.average": { $gte: 4.0 },
    })
      .sort({
        "rating.average": -1,
        "rating.totalRaters": -1,
        totalBookings: -1,
      })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Top rated services retrieved successfully",
      data: services,
      total: services.length,
      user: req.user
        ? {
            _id: req.user._id,
            role: req.user.role,
            isLoggedIn: true,
          }
        : { isLoggedIn: false },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving top rated services",
      error: error.message,
    });
  }
});

// POST /api/services/:id/book - Book a service (requires login)
router.post("/:id/book", authMiddleware, customerOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    service.totalBookings = (service.totalBookings || 0) + 1;
    await service.save();

    res.json({
      success: true,
      message: "Service booking initiated",
      data: {
        service,
        customer: {
          _id: req.user._id,
          username: req.user.username,
          email: req.user.email,
        },
      },
      nextStep: "Please proceed to appointment scheduling",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error booking service",
      error: error.message,
    });
  }
});

// @desc    Update service rating stats manually
// @route   PUT /api/services/:id/update-rating
// @access  Public
router.put("/:id/update-rating", async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    await service.updateRatingStats();

    res.json({
      success: true,
      message: "Service rating stats updated successfully",
      data: service,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating service rating stats",
      error: error.message,
    });
  }
});

export default router;
