// routes/stylists.js
import express from "express";
import User from "../models/User.js";
import { optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// GET /api/stylists - Get all salon staff (stylists)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const stylists = await User.find({
      role: "salon_staff",
      isActive: true,
    })
      .select("username position profileImage")
      .lean();

    // Add mock ratings for now (you can create a Reviews model later)
    const stylistsWithRatings = stylists.map((stylist, index) => ({
      ...stylist,
      rating: 4.5 + (index % 5) * 0.1, // Mock ratings between 4.5-4.9
      reviewCount: 100 + index * 50, // Mock review counts
      topRated: index < 3, // First 3 are top rated
    }));

    res.json({
      success: true,
      message: "Stylists retrieved successfully",
      data: stylistsWithRatings,
      count: stylistsWithRatings.length,
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
      message: "Error fetching stylists",
      error: error.message,
    });
  }
});

export default router;
