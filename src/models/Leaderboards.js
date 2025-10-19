import mongoose from "mongoose";

const leaderboardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    // ❌ removed unique: true to prevent duplicate index
  },
  // Performance Metrics
  totalPoints: {
    type: Number,
    default: 0,
  },
  monthlyPoints: {
    type: Number,
    default: 0,
  },
  weeklyPoints: {
    type: Number,
    default: 0,
  },
  // Attendance Metrics
  attendanceScore: {
    type: Number,
    default: 0,
  },
  punctualityScore: {
    type: Number,
    default: 0,
  },
  attendanceStreak: {
    type: Number,
    default: 0,
  },
  // Service Metrics
  servicesCompleted: {
    total: {
      type: Number,
      default: 0,
    },
    monthly: {
      type: Number,
      default: 0,
    },
    weekly: {
      type: Number,
      default: 0,
    },
  },
  customerRatings: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    count: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
  },
  // Learning Metrics
  learningModulesCompleted: {
    total: {
      type: Number,
      default: 0,
    },
    monthly: {
      type: Number,
      default: 0,
    },
  },
  certificationsEarned: {
    type: Number,
    default: 0,
  },
  // Sales Metrics
  salesPerformance: {
    totalRevenue: {
      type: Number,
      default: 0,
    },
    monthlyRevenue: {
      type: Number,
      default: 0,
    },
    weeklyRevenue: {
      type: Number,
      default: 0,
    },
    productsUpsold: {
      type: Number,
      default: 0,
    },
  },
  // Achievement Badges
  badges: [
    {
      name: String,
      description: String,
      icon: String,
      earnedAt: {
        type: Date,
        default: Date.now,
      },
      category: {
        type: String,
        enum: [
          "attendance",
          "service",
          "learning",
          "sales",
          "customer-service",
          "teamwork",
        ],
      },
    },
  ],
  // Rankings
  currentRank: {
    overall: {
      type: Number,
      default: 0,
    },
    monthly: {
      type: Number,
      default: 0,
    },
    weekly: {
      type: Number,
      default: 0,
    },
  },
  previousRank: {
    overall: {
      type: Number,
      default: 0,
    },
    monthly: {
      type: Number,
      default: 0,
    },
    weekly: {
      type: Number,
      default: 0,
    },
  },
  // Streak Tracking
  streaks: {
    attendance: {
      current: {
        type: Number,
        default: 0,
      },
      longest: {
        type: Number,
        default: 0,
      },
    },
    punctuality: {
      current: {
        type: Number,
        default: 0,
      },
      longest: {
        type: Number,
        default: 0,
      },
    },
    learning: {
      current: {
        type: Number,
        default: 0,
      },
      longest: {
        type: Number,
        default: 0,
      },
    },
  },
  // Monthly Reset Data
  lastMonthlyReset: {
    type: Date,
    default: Date.now,
  },
  lastWeeklyReset: {
    type: Date,
    default: Date.now,
  },
  // Performance History
  performanceHistory: [
    {
      month: Number,
      year: Number,
      points: Number,
      rank: Number,
      attendanceRate: Number,
      servicesCompleted: Number,
      customerRating: Number,
      revenue: Number,
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for efficient queries
leaderboardSchema.index({ totalPoints: -1 });
leaderboardSchema.index({ monthlyPoints: -1 });
leaderboardSchema.index({ weeklyPoints: -1 });
leaderboardSchema.index({ userId: 1 }, { unique: true }); // ✅ keep this only once
leaderboardSchema.index({ isActive: 1 });

// Calculate total points based on various metrics
leaderboardSchema.methods.calculateTotalPoints = function () {
  let points = 0;

  // Attendance points (max 300 points)
  points += this.attendanceScore * 2;
  points += this.punctualityScore * 1;

  // Service points (max 400 points)
  points += this.servicesCompleted.total * 5;
  points += this.customerRatings.average * 20;

  // Learning points (max 200 points)
  points += this.learningModulesCompleted.total * 10;
  points += this.certificationsEarned * 50;

  // Sales points (max 300 points)
  points += Math.floor(this.salesPerformance.totalRevenue / 1000) * 10;
  points += this.salesPerformance.productsUpsold * 5;

  // Streak bonuses (max 200 points)
  points += this.streaks.attendance.longest * 2;
  points += this.streaks.punctuality.longest * 1;
  points += this.streaks.learning.longest * 3;

  this.totalPoints = Math.floor(points);
  return this.totalPoints;
};

// Update monthly points
leaderboardSchema.methods.calculateMonthlyPoints = function () {
  let points = 0;

  points += this.attendanceScore * 2;
  points += this.punctualityScore * 1;
  points += this.servicesCompleted.monthly * 5;
  points += this.customerRatings.average * 20;
  points += this.learningModulesCompleted.monthly * 10;
  points += Math.floor(this.salesPerformance.monthlyRevenue / 1000) * 10;

  this.monthlyPoints = Math.floor(points);
  return this.monthlyPoints;
};

// Award badge
leaderboardSchema.methods.awardBadge = function (badgeData) {
  const existingBadge = this.badges.find(
    (badge) => badge.name === badgeData.name
  );
  if (!existingBadge) {
    this.badges.push({
      name: badgeData.name,
      description: badgeData.description,
      icon: badgeData.icon,
      category: badgeData.category,
      earnedAt: new Date(),
    });
    return true;
  }
  return false;
};

// Check and award automatic badges
leaderboardSchema.methods.checkAndAwardBadges = function () {
  const newBadges = [];

  if (
    this.streaks.attendance.current >= 30 &&
    !this.badges.find((b) => b.name === "Perfect Month")
  ) {
    this.awardBadge({
      name: "Perfect Month",
      description: "30 days perfect attendance",
      icon: "calendar-check",
      category: "attendance",
    });
    newBadges.push("Perfect Month");
  }

  if (
    this.servicesCompleted.total >= 100 &&
    !this.badges.find((b) => b.name === "Century Club")
  ) {
    this.awardBadge({
      name: "Century Club",
      description: "100 services completed",
      icon: "scissors",
      category: "service",
    });
    newBadges.push("Century Club");
  }

  if (
    this.customerRatings.average >= 4.8 &&
    this.customerRatings.count >= 50 &&
    !this.badges.find((b) => b.name === "Customer Favorite")
  ) {
    this.awardBadge({
      name: "Customer Favorite",
      description: "4.8+ rating with 50+ reviews",
      icon: "star",
      category: "customer-service",
    });
    newBadges.push("Customer Favorite");
  }

  if (
    this.learningModulesCompleted.total >= 20 &&
    !this.badges.find((b) => b.name === "Knowledge Seeker")
  ) {
    this.awardBadge({
      name: "Knowledge Seeker",
      description: "20 learning modules completed",
      icon: "book",
      category: "learning",
    });
    newBadges.push("Knowledge Seeker");
  }

  if (
    this.salesPerformance.totalRevenue >= 50000 &&
    !this.badges.find((b) => b.name === "Sales Star")
  ) {
    this.awardBadge({
      name: "Sales Star",
      description: "₱50,000 total revenue generated",
      icon: "trending-up",
      category: "sales",
    });
    newBadges.push("Sales Star");
  }

  return newBadges;
};

// Get leaderboard rankings
leaderboardSchema.statics.getLeaderboard = async function (
  type = "overall",
  limit = 50
) {
  let sortField;

  switch (type) {
    case "monthly":
      sortField = { monthlyPoints: -1 };
      break;
    case "weekly":
      sortField = { weeklyPoints: -1 };
      break;
    case "attendance":
      sortField = { attendanceScore: -1 };
      break;
    case "service":
      sortField = {
        "customerRatings.average": -1,
        "servicesCompleted.total": -1,
      };
      break;
    case "learning":
      sortField = { "learningModulesCompleted.total": -1 };
      break;
    case "sales":
      sortField = { "salesPerformance.totalRevenue": -1 };
      break;
    default:
      sortField = { totalPoints: -1 };
  }

  const leaderboard = await this.find({ isActive: true })
    .sort(sortField)
    .limit(limit)
    .populate("userId", "username profileImage role")
    .lean();

  return leaderboard.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    rankChange: entry.previousRank[type]
      ? entry.previousRank[type] - (index + 1)
      : 0,
  }));
};

// Update rankings for all users
leaderboardSchema.statics.updateAllRankings = async function () {
  const overallLeaderboard = await this.find({ isActive: true })
    .sort({ totalPoints: -1 })
    .select("_id currentRank previousRank");

  const monthlyLeaderboard = await this.find({ isActive: true })
    .sort({ monthlyPoints: -1 })
    .select("_id currentRank previousRank");

  const weeklyLeaderboard = await this.find({ isActive: true })
    .sort({ weeklyPoints: -1 })
    .select("_id currentRank previousRank");

  for (let i = 0; i < overallLeaderboard.length; i++) {
    const entry = overallLeaderboard[i];
    entry.previousRank.overall = entry.currentRank.overall;
    entry.currentRank.overall = i + 1;
    await entry.save();
  }

  for (let i = 0; i < monthlyLeaderboard.length; i++) {
    const entry = monthlyLeaderboard[i];
    entry.previousRank.monthly = entry.currentRank.monthly;
    entry.currentRank.monthly = i + 1;
    await entry.save();
  }

  for (let i = 0; i < weeklyLeaderboard.length; i++) {
    const entry = weeklyLeaderboard[i];
    entry.previousRank.weekly = entry.currentRank.weekly;
    entry.currentRank.weekly = i + 1;
    await entry.save();
  }
};

// Reset monthly/weekly points
leaderboardSchema.statics.resetPeriodPoints = async function (
  period = "monthly"
) {
  const now = new Date();

  if (period === "monthly") {
    await this.updateMany(
      { isActive: true },
      {
        $set: {
          monthlyPoints: 0,
          "servicesCompleted.monthly": 0,
          "learningModulesCompleted.monthly": 0,
          "salesPerformance.monthlyRevenue": 0,
          lastMonthlyReset: now,
        },
      }
    );
  } else if (period === "weekly") {
    await this.updateMany(
      { isActive: true },
      {
        $set: {
          weeklyPoints: 0,
          "servicesCompleted.weekly": 0,
          "salesPerformance.weeklyRevenue": 0,
          lastWeeklyReset: now,
        },
      }
    );
  }
};

leaderboardSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  this.calculateTotalPoints();
  this.calculateMonthlyPoints();
  next();
});

export default mongoose.model("Leaderboard", leaderboardSchema);
