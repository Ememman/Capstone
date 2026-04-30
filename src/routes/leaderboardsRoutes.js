import express from "express";
import Leaderboard from "../models/Leaderboards.js";
import LeaderboardService from "../services/LeaderboardService.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Get main leaderboard
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { type = "overall", limit = 50 } = req.query;

    let leaderboard;

    if (type === "monthly") {
      leaderboard = await Leaderboard.find({ isActive: true })
        .populate("userId", "username profileImage position")
        .sort({ monthlyPoints: -1 })
        .limit(Number.parseInt(limit));
    } else if (type === "weekly") {
      leaderboard = await Leaderboard.find({ isActive: true })
        .populate("userId", "username profileImage position")
        .sort({ weeklyPoints: -1 })
        .limit(Number.parseInt(limit));
    } else {
      leaderboard = await Leaderboard.find({ isActive: true })
        .populate("userId", "username profileImage position")
        .sort({ totalPoints: -1 })
        .limit(Number.parseInt(limit));
    }

    // Add ranks
    const leaderboardWithRanks = leaderboard.map((entry, index) => ({
      ...entry.toObject(),
      rank: index + 1,
    }));

    // Get current user's position
    const currentUser = await Leaderboard.findOne({
      userId: req.user.id,
    }).populate("userId", "username profileImage");

    let userPosition = null;
    if (currentUser) {
      const userRank =
        leaderboardWithRanks.findIndex(
          (entry) => entry.userId._id.toString() === req.user.id.toString()
        ) + 1;

      userPosition = {
        ...currentUser.toObject(),
        rank: userRank > 0 ? userRank : leaderboardWithRanks.length + 1,
      };
    }

    res.json({
      success: true,
      data: {
        leaderboard: leaderboardWithRanks,
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

    let topPerformers;

    if (type === "monthly") {
      topPerformers = await Leaderboard.find({ isActive: true })
        .populate("userId", "username profileImage position")
        .sort({ monthlyPoints: -1 })
        .limit(3);
    } else if (type === "weekly") {
      topPerformers = await Leaderboard.find({ isActive: true })
        .populate("userId", "username profileImage position")
        .sort({ weeklyPoints: -1 })
        .limit(3);
    } else {
      topPerformers = await Leaderboard.find({ isActive: true })
        .populate("userId", "username profileImage position")
        .sort({ totalPoints: -1 })
        .limit(3);
    }

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

    // Recalculate total points
    profile.totalPoints =
      (profile.attendanceScore || 0) +
      (profile.punctualityScore || 0) +
      (profile.servicesCompleted?.total || 0) * 10 +
      (profile.learningModulesCompleted?.total || 0) * 20 +
      Math.floor((profile.salesPerformance?.totalRevenue || 0) / 100);

    profile.monthlyPoints =
      (profile.servicesCompleted?.monthly || 0) * 10 +
      (profile.learningModulesCompleted?.monthly || 0) * 20 +
      Math.floor((profile.salesPerformance?.monthlyRevenue || 0) / 100);

    profile.weeklyPoints =
      (profile.servicesCompleted?.weekly || 0) * 10 +
      Math.floor((profile.salesPerformance?.weeklyRevenue || 0) / 100);

    await profile.save();

    res.json({
      success: true,
      message: "Metrics updated successfully",
      data: profile,
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

    // Check if badge already exists
    const existingBadge = profile.badges.find((badge) => badge.name === name);
    if (existingBadge) {
      return res.status(400).json({
        success: false,
        message: "Badge already exists",
      });
    }

    // Add new badge
    profile.badges.push({
      name,
      description,
      icon,
      category,
      earnedAt: new Date(),
    });

    await profile.save();

    res.json({
      success: true,
      message: "Badge awarded successfully",
      data: profile.badges[profile.badges.length - 1],
    });
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

    // Get all leaderboard entries sorted by total points
    const allEntries = await Leaderboard.find({ isActive: true }).sort({
      totalPoints: -1,
    });

    // Update ranks
    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      entry.currentRank.overall = i + 1;
      await entry.save();
    }

    // Similarly update monthly and weekly ranks
    const monthlyEntries = await Leaderboard.find({ isActive: true }).sort({
      monthlyPoints: -1,
    });

    for (let i = 0; i < monthlyEntries.length; i++) {
      const entry = monthlyEntries[i];
      entry.currentRank.monthly = i + 1;
      await entry.save();
    }

    const weeklyEntries = await Leaderboard.find({ isActive: true }).sort({
      weeklyPoints: -1,
    });

    for (let i = 0; i < weeklyEntries.length; i++) {
      const entry = weeklyEntries[i];
      entry.currentRank.weekly = i + 1;
      await entry.save();
    }

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

    if (period === "monthly") {
      await Leaderboard.updateMany(
        { isActive: true },
        {
          $set: {
            monthlyPoints: 0,
            "servicesCompleted.monthly": 0,
            "learningModulesCompleted.monthly": 0,
            "salesPerformance.monthlyRevenue": 0,
          },
        }
      );
    } else if (period === "weekly") {
      await Leaderboard.updateMany(
        { isActive: true },
        {
          $set: {
            weeklyPoints: 0,
            "servicesCompleted.weekly": 0,
            "salesPerformance.weeklyRevenue": 0,
          },
        }
      );
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Use 'monthly' or 'weekly'",
      });
    }

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

// Get staff performance summary
// Get staff performance summary
router.get("/staff/performance/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user has permission to view this data
    if (req.user.role !== 'admin' && req.user.role !== 'salon_staff' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const leaderboard = await Leaderboard.findOne({ userId })
      .populate("userId", "username profileImage firstName lastName position");

    if (!leaderboard) {
      return res.status(404).json({
        success: false,
        message: "Performance data not found",
      });
    }

    // Calculate performance metrics
    const performance = {
      userId: leaderboard.userId._id,
      username: leaderboard.userId.username,
      firstName: leaderboard.userId.firstName,
      lastName: leaderboard.userId.lastName,
      profileImage: leaderboard.userId.profileImage,
      position: leaderboard.userId.position,
      totalPoints: leaderboard.totalPoints,
      monthlyPoints: leaderboard.monthlyPoints,
      weeklyPoints: leaderboard.weeklyPoints,
      dailyPoints: leaderboard.dailyPoints,
      attendanceScore: leaderboard.attendanceScore,
      punctualityScore: leaderboard.punctualityScore,
      servicesCompleted: leaderboard.servicesCompleted,
      customerRatings: leaderboard.customerRatings,
      learningModulesCompleted: leaderboard.learningModulesCompleted,
      quizzesCompleted: leaderboard.quizzesCompleted,
      salesPerformance: leaderboard.salesPerformance,
      badges: leaderboard.badges,
      currentRank: leaderboard.currentRank,
      previousRank: leaderboard.previousRank,
      streaks: leaderboard.streaks,
      // Calculate additional metrics for reports
      performanceScore: Math.min(leaderboard.totalPoints / 10, 100),
      knowledgeGain: Math.min(leaderboard.learningModulesCompleted.total * 2, 100),
      monthlyGrowth: Math.min(leaderboard.monthlyPoints / 5, 100)
    };

    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching staff performance",
      error: error.message,
    });
  }
});

// Get current user's performance
// Get current user's performance
router.get("/my-performance", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const leaderboard = await Leaderboard.findOne({ userId })
      .populate("userId", "username profileImage firstName lastName position");

    if (!leaderboard) {
      // Return default performance data
      const defaultPerformance = {
        userId,
        totalPoints: 0,
        monthlyPoints: 0,
        weeklyPoints: 0,
        dailyPoints: 0,
        attendanceScore: 0,
        punctualityScore: 0,
        servicesCompleted: {
          total: 0,
          monthly: 0,
          weekly: 0,
          daily: 0
        },
        customerRatings: {
          average: 0,
          count: 0
        },
        learningModulesCompleted: {
          total: 0,
          monthly: 0
        },
        quizzesCompleted: {
          total: 0,
          monthly: 0
        },
        salesPerformance: {
          totalRevenue: 0,
          monthlyRevenue: 0,
          weeklyRevenue: 0
        },
        badges: [],
        currentRank: {
          overall: 0,
          monthly: 0,
          weekly: 0,
          daily: 0
        },
        previousRank: {
          overall: 0,
          monthly: 0,
          weekly: 0,
          daily: 0
        },
        streaks: {
          attendance: { current: 0, longest: 0 },
          punctuality: { current: 0, longest: 0 },
          learning: { current: 0, longest: 0 }
        },
        performanceScore: 0,
        knowledgeGain: 0,
        monthlyGrowth: 0
      };

      return res.json({
        success: true,
        data: defaultPerformance
      });
    }

    // Calculate performance metrics
    const performance = {
      ...leaderboard.toObject(),
      performanceScore: Math.min(leaderboard.totalPoints / 10, 100),
      knowledgeGain: Math.min(leaderboard.learningModulesCompleted.total * 2, 100),
      monthlyGrowth: Math.min(leaderboard.monthlyPoints / 5, 100),
      rankChange: {
        overall: leaderboard.previousRank?.overall ? leaderboard.previousRank.overall - leaderboard.currentRank.overall : 0,
        monthly: leaderboard.previousRank?.monthly ? leaderboard.previousRank.monthly - leaderboard.currentRank.monthly : 0
      }
    };

    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching performance data",
      error: error.message,
    });
  }
});

// Get daily leaderboard
router.get("/daily", authMiddleware, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const leaderboard = await Leaderboard.getLeaderboard('daily', limit);

    res.json({
      success: true,
      data: {
        leaderboard,
        type: 'daily',
        totalParticipants: await Leaderboard.countDocuments({ isActive: true }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching daily leaderboard",
      error: error.message,
    });
  }
});

// Get weekly leaderboard
router.get("/weekly", authMiddleware, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const leaderboard = await Leaderboard.getLeaderboard('weekly', limit);

    res.json({
      success: true,
      data: {
        leaderboard,
        type: 'weekly',
        totalParticipants: await Leaderboard.countDocuments({ isActive: true }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching weekly leaderboard",
      error: error.message,
    });
  }
});

// Get monthly leaderboard
router.get("/monthly", authMiddleware, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const leaderboard = await Leaderboard.getLeaderboard('monthly', limit);

    res.json({
      success: true,
      data: {
        leaderboard,
        type: 'monthly',
        totalParticipants: await Leaderboard.countDocuments({ isActive: true }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching monthly leaderboard",
      error: error.message,
    });
  }
});

router.post("/update-from-quiz", authMiddleware, async (req, res) => {
  try {
    const { score, pointsEarned } = req.body;
    const userId = req.user.id;

    const leaderboard = await Leaderboard.findOne({ userId });

    if (!leaderboard) {
      return res.status(404).json({
        success: false,
        message: "Leaderboard entry not found",
      });
    }

    // Update quiz points (only add points if passed)
    if (score >= 70) {
      // Only add points if passed (70% or higher)
      leaderboard.quizPoints.total += pointsEarned;
      leaderboard.quizPoints.monthly += pointsEarned;
      leaderboard.quizPoints.daily += pointsEarned;

      // Update total points
      leaderboard.totalPoints += pointsEarned;
      leaderboard.monthlyPoints += pointsEarned;
      leaderboard.dailyPoints += pointsEarned;
    }

    // Update quizzes completed count
    leaderboard.quizzesCompleted.total += 1;
    leaderboard.quizzesCompleted.monthly += 1;
    leaderboard.quizzesCompleted.daily += 1;

    // Update learning streak
    leaderboard.streaks.learning.current += 1;
    if (
      leaderboard.streaks.learning.current >
      leaderboard.streaks.learning.longest
    ) {
      leaderboard.streaks.learning.longest =
        leaderboard.streaks.learning.current;
    }

    // Check for new badges
    const newBadges = leaderboard.checkAndAwardBadges();

    await leaderboard.save();

    // Update rankings
    await Leaderboard.updateAllRankings();

    res.json({
      success: true,
      message: "Leaderboard updated successfully",
      data: {
        pointsEarned: score >= 70 ? pointsEarned : 0,
        newBadges,
        currentPoints: leaderboard.totalPoints,
        monthlyPoints: leaderboard.monthlyPoints,
        dailyPoints: leaderboard.dailyPoints,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating leaderboard",
      error: error.message,
    });
  }
});


export default router;
