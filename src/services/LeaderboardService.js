// services/LeaderboardService.js
import Leaderboard from "../models/Leaderboards.js";

class LeaderboardService {
  // Get staff performance data
  static async getStaffPerformance(userId) {
    try {
      const leaderboard = await Leaderboard.findOne({ userId })
        .populate("userId", "username profileImage firstName lastName position")
        .lean();

      if (!leaderboard) {
        // Return default performance data if no leaderboard entry exists
        return {
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
            daily: 0,
          },
          customerRatings: {
            average: 0,
            count: 0,
          },
          learningModulesCompleted: {
            total: 0,
            monthly: 0,
          },
          quizzesCompleted: {
            total: 0,
            monthly: 0,
          },
          salesPerformance: {
            totalRevenue: 0,
            monthlyRevenue: 0,
            weeklyRevenue: 0,
          },
          badges: [],
          currentRank: {
            overall: 0,
            monthly: 0,
            weekly: 0,
            daily: 0,
          },
          previousRank: {
            overall: 0,
            monthly: 0,
            weekly: 0,
            daily: 0,
          },
          streaks: {
            attendance: { current: 0, longest: 0 },
            punctuality: { current: 0, longest: 0 },
            learning: { current: 0, longest: 0 },
          },
        };
      }

      // Calculate rank changes
      const rankChange = {
        overall: leaderboard.previousRank?.overall
          ? leaderboard.previousRank.overall - leaderboard.currentRank.overall
          : 0,
        monthly: leaderboard.previousRank?.monthly
          ? leaderboard.previousRank.monthly - leaderboard.currentRank.monthly
          : 0,
        weekly: leaderboard.previousRank?.weekly
          ? leaderboard.previousRank.weekly - leaderboard.currentRank.weekly
          : 0,
        daily: leaderboard.previousRank?.daily
          ? leaderboard.previousRank.daily - leaderboard.currentRank.daily
          : 0,
      };

      return {
        ...leaderboard,
        rankChange,
        performanceScore: this.calculatePerformanceScore(leaderboard),
        knowledgeGain: this.calculateKnowledgeGain(leaderboard),
        monthlyGrowth: this.calculateMonthlyGrowth(leaderboard),
      };
    } catch (error) {
      console.error("Error in getStaffPerformance:", error);
      throw error;
    }
  }

  // Calculate overall performance score (0-100)
  static calculatePerformanceScore(leaderboard) {
    const weights = {
      attendance: 0.15,
      punctuality: 0.1,
      serviceQuality: 0.25,
      learning: 0.2,
      sales: 0.2,
      customerSatisfaction: 0.1,
    };

    let score = 0;

    // Attendance score (0-15 points)
    score +=
      Math.min((leaderboard.attendanceScore / 100) * 15, 15) *
      weights.attendance;

    // Punctuality score (0-10 points)
    score +=
      Math.min((leaderboard.punctualityScore / 100) * 10, 10) *
      weights.punctuality;

    // Service quality (0-25 points)
    const servicePoints = Math.min(
      leaderboard.servicesCompleted.total * 0.5,
      25
    );
    score += servicePoints * weights.serviceQuality;

    // Learning (0-20 points)
    const learningPoints = Math.min(
      leaderboard.learningModulesCompleted.total * 2 +
        leaderboard.quizzesCompleted.total * 1,
      20
    );
    score += learningPoints * weights.learning;

    // Sales performance (0-20 points)
    const salesPoints = Math.min(
      leaderboard.salesPerformance.totalRevenue / 5000,
      20
    );
    score += salesPoints * weights.sales;

    // Customer satisfaction (0-10 points)
    const satisfactionPoints = leaderboard.customerRatings.average * 2;
    score += satisfactionPoints * weights.customerSatisfaction;

    return Math.round(score);
  }

  // Calculate knowledge gain percentage
  static calculateKnowledgeGain(leaderboard) {
    const maxPossibleModules = 50; // Adjust based on your total modules
    const completionRate =
      (leaderboard.learningModulesCompleted.total / maxPossibleModules) * 100;
    return Math.min(Math.round(completionRate), 100);
  }

  // Calculate monthly growth percentage
  static calculateMonthlyGrowth(leaderboard) {
    // This would typically compare current month with previous month
    // For now, return a calculated growth based on recent activity
    const growthFactors = [
      leaderboard.servicesCompleted.monthly * 2,
      leaderboard.learningModulesCompleted.monthly * 5,
      leaderboard.quizzesCompleted.monthly * 3,
      Math.floor(leaderboard.salesPerformance.monthlyRevenue / 1000),
    ];

    const growth = growthFactors.reduce((sum, factor) => sum + factor, 0);
    return Math.min(growth, 100);
  }

  // Get leaderboard with rankings
  static async getLeaderboard(type = "overall", limit = 50) {
    return await Leaderboard.getLeaderboard(type, limit);
  }

  // Update leaderboard from various activities
  static async updateFromQuiz(userId, score, pointsEarned = null) {
    return await Leaderboard.updateFromQuiz(userId, score, pointsEarned);
  }

  static async updateFromAppointment(
    userId,
    revenue,
    serviceType = "standard"
  ) {
    return await Leaderboard.updateFromAppointment(
      userId,
      revenue,
      serviceType
    );
  }

  static async updateFromAttendance(userId, action, isOnTime = true) {
    return await Leaderboard.updateFromAttendance(userId, action, isOnTime);
  }
}

export default LeaderboardService;
