import express from "express";
import Leaderboard from "../models/Leaderboards.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Get main leaderboard
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { type = "overall", limit = 50 } = req.query;

    const leaderboard = await Leaderboard.getLeaderboard(
      type,
      Number.parseInt(limit)
    );

    // Get current user's position
    const currentUser = await Leaderboard.findOne({
      userId: req.user.id,
    }).populate("userId", "username profileImage");

    let userPosition = null;
    if (currentUser) {
      const userRank =
        type === "monthly"
          ? currentUser.currentRank.monthly
          : type === "weekly"
          ? currentUser.currentRank.weekly
          : currentUser.currentRank.overall;

      userPosition = {
        ...currentUser.toObject(),
        rank: userRank,
        rankChange:
          type === "monthly"
            ? currentUser.previousRank.monthly - currentUser.currentRank.monthly
            : type === "weekly"
            ? currentUser.previousRank.weekly - currentUser.currentRank.weekly
            : currentUser.previousRank.overall -
              currentUser.currentRank.overall,
      };
    }

    res.json({
      success: true,
      data: {
        leaderboard,
        userPosition,
        type,
        totalParticipants: await Leaderboard.countDocuments({ isActive: true }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching leaderboard",
      error: error.message,
    });
  }
});

// Get top performers (top 3)
router.get("/top-performers", authMiddleware, async (req, res) => {
  try {
    const { type = "overall" } = req.query;

    const topPerformers = await Leaderboard.getLeaderboard(type, 3);

    res.json({
      success: true,
      data: topPerformers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching top performers",
      error: error.message,
    });
  }
});

// Get user's leaderboard profile
router.get("/profile/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await Leaderboard.findOne({ userId }).populate(
      "userId",
      "username profileImage role createdAt"
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Leaderboard profile not found",
      });
    }

    // Calculate additional stats
    const stats = {
      totalBadges: profile.badges.length,
      badgesByCategory: profile.badges.reduce((acc, badge) => {
        acc[badge.category] = (acc[badge.category] || 0) + 1;
        return acc;
      }, {}),
      longestStreaks: {
        attendance: profile.streaks.attendance.longest,
        punctuality: profile.streaks.punctuality.longest,
        learning: profile.streaks.learning.longest,
      },
      currentStreaks: {
        attendance: profile.streaks.attendance.current,
        punctuality: profile.streaks.punctuality.current,
        learning: profile.streaks.learning.current,
      },
    };

    res.json({
      success: true,
      data: {
        ...profile.toObject(),
        stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user profile",
      error: error.message,
    });
  }
});

// Update user performance metrics
router.put("/update-metrics/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      attendanceScore,
      punctualityScore,
      servicesCompleted,
      customerRating,
      learningModulesCompleted,
      salesRevenue,
      streakUpdates,
    } = req.body;

    let profile = await Leaderboard.findOne({ userId });

    if (!profile) {
      // Create new leaderboard profile
      profile = new Leaderboard({ userId });
    }

    // Update metrics
    if (attendanceScore !== undefined) {
      profile.attendanceScore = attendanceScore;
    }

    if (punctualityScore !== undefined) {
      profile.punctualityScore = punctualityScore;
    }

    if (servicesCompleted !== undefined) {
      profile.servicesCompleted.total += servicesCompleted;
      profile.servicesCompleted.monthly += servicesCompleted;
      profile.servicesCompleted.weekly += servicesCompleted;
    }

    if (customerRating !== undefined) {
      const currentTotal =
        profile.customerRatings.average * profile.customerRatings.count;
      profile.customerRatings.count += 1;
      profile.customerRatings.total = currentTotal + customerRating;
      profile.customerRatings.average =
        profile.customerRatings.total / profile.customerRatings.count;
    }

    if (learningModulesCompleted !== undefined) {
      profile.learningModulesCompleted.total += learningModulesCompleted;
      profile.learningModulesCompleted.monthly += learningModulesCompleted;
    }

    if (salesRevenue !== undefined) {
      profile.salesPerformance.totalRevenue += salesRevenue;
      profile.salesPerformance.monthlyRevenue += salesRevenue;
      profile.salesPerformance.weeklyRevenue += salesRevenue;
    }

    // Update streaks
    if (streakUpdates) {
      Object.keys(streakUpdates).forEach((streakType) => {
        if (profile.streaks[streakType]) {
          profile.streaks[streakType].current =
            streakUpdates[streakType].current ||
            profile.streaks[streakType].current;
          if (
            profile.streaks[streakType].current >
            profile.streaks[streakType].longest
          ) {
            profile.streaks[streakType].longest =
              profile.streaks[streakType].current;
          }
        }
      });
    }

    // Check for new badges
    const newBadges = profile.checkAndAwardBadges();

    await profile.save();

    res.json({
      success: true,
      message: "Metrics updated successfully",
      data: profile,
      newBadges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating metrics",
      error: error.message,
    });
  }
});

// Award custom badge
router.post("/award-badge/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, description, icon, category } = req.body;

    const profile = await Leaderboard.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const badgeAwarded = profile.awardBadge({
      name,
      description,
      icon,
      category,
    });

    if (badgeAwarded) {
      await profile.save();
      res.json({
        success: true,
        message: "Badge awarded successfully",
        data: profile.badges[profile.badges.length - 1],
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Badge already exists",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error awarding badge",
      error: error.message,
    });
  }
});

// Get leaderboard statistics
router.get("/statistics", authMiddleware, async (req, res) => {
  try {
    const totalUsers = await Leaderboard.countDocuments({ isActive: true });

    // Get average metrics
    const avgMetrics = await Leaderboard.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          avgTotalPoints: { $avg: "$totalPoints" },
          avgAttendanceScore: { $avg: "$attendanceScore" },
          avgCustomerRating: { $avg: "$customerRatings.average" },
          avgServicesCompleted: { $avg: "$servicesCompleted.total" },
          avgLearningModules: { $avg: "$learningModulesCompleted.total" },
          totalRevenue: { $sum: "$salesPerformance.totalRevenue" },
        },
      },
    ]);

    // Get badge distribution
    const badgeStats = await Leaderboard.aggregate([
      { $match: { isActive: true } },
      { $unwind: "$badges" },
      {
        $group: {
          _id: "$badges.category",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        averageMetrics: avgMetrics[0] || {},
        badgeDistribution: badgeStats,
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
      error: error.message,
    });
  }
});

// Admin: Update all rankings
router.post("/admin/update-rankings", authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (you might want to add proper admin middleware)
    if (req.user.role !== "admin" && req.user.role !== "salon_staff") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    await Leaderboard.updateAllRankings();

    res.json({
      success: true,
      message: "Rankings updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating rankings",
      error: error.message,
    });
  }
});

// Admin: Reset period points
router.post("/admin/reset-points", authMiddleware, async (req, res) => {
  try {
    const { period } = req.body; // 'monthly' or 'weekly'

    // Check if user is admin
    if (req.user.role !== "admin" && req.user.role !== "salon_staff") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    await Leaderboard.resetPeriodPoints(period);

    res.json({
      success: true,
      message: `${period} points reset successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error resetting points",
      error: error.message,
    });
  }
});

export default router;
