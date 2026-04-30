import express from "express";
import { authMiddleware, staffOnly } from "../middleware/auth.js";
import Attendance from "../models/Attendance.js";
import Appointment from "../models/Appointment.js";
import Booking from "../models/Booking.js";
import Leaderboard from "../models/Leaderboards.js";
import { UserProgress, LearningModule } from "../models/LearningModules.js";
import User from "../models/User.js";
import Favorite from "../models/Favorites.js";

const router = express.Router();

// ==================== TRAINING MODULES FOR STAFF ====================

// Get all training modules for staff
router.get("/training-modules", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { category, status, page = 1, limit = 20 } = req.query;

    const query = { isActive: true };
    if (category && category !== "all") query.category = category;
    if (status && status !== "all") query.status = status;

    const skip = (page - 1) * limit;

    const modules = await LearningModule.find(query)
      .populate("createdBy", "username profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get user progress for each module
    const modulesWithProgress = await Promise.all(
      modules.map(async (module) => {
        const progress = await UserProgress.findOne({
          userId: req.user._id,
          moduleId: module._id,
        });

        return {
          ...module.toObject(),
          userProgress: progress || {
            status: "not-started",
            progress: 0,
            timeSpent: 0,
            quizAttempts: [],
          },
          completionRate: module.getCompletionRate
            ? module.getCompletionRate()
            : 0,
        };
      })
    );

    const total = await LearningModule.countDocuments(query);

    res.json({
      success: true,
      data: modulesWithProgress,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Staff training modules error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching training modules",
      error: error.message,
    });
  }
});

// Get specific training module for staff
router.get(
  "/training-modules/:id",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const module = await LearningModule.findById(req.params.id).populate(
        "createdBy",
        "username profileImage"
      );

      if (!module || !module.isActive) {
        return res.status(404).json({
          success: false,
          message: "Training module not found",
        });
      }

      // Get user progress
      const progress = await UserProgress.findOne({
        userId: req.user._id,
        moduleId: module._id,
      });

      // Format response for mobile app
      const moduleData = {
        ...module.toObject(),
        userProgress: progress || {
          status: "not-started",
          progress: 0,
          timeSpent: 0,
          quizAttempts: [],
        },
        completionRate: module.getCompletionRate
          ? module.getCompletionRate()
          : 0,

        // Ensure all required fields for mobile app
        id: module._id,
        duration: module.duration ? parseInt(module.duration) : 60,
        hasQuiz: module.quiz?.isEnabled || false,
        youtubeVideos: module.youtubeVideos || [],
        resources: module.resources || [],
        requirements: module.requirements || [],
        learningObjectives: module.learningObjectives || [],
        instructor: module.instructor || {
          name: "Instructor",
          bio: "",
          profileImage: "",
          credentials: [],
        },
        coverImage:
          module.coverImage ||
          "https://via.placeholder.com/300x200/1a1f3a/ffffff?text=Module+Cover",
        difficulty: module.difficulty || "beginner",
        status: module.status || "Active",
      };

      res.json({
        success: true,
        data: moduleData,
      });
    } catch (error) {
      console.error("Staff training module error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching training module",
        error: error.message,
      });
    }
  }
);

// ==================== STAFF DASHBOARD ====================

// Staff dashboard - Complete with all required data
router.get("/dashboard", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    // Today's appointments with customer details
    const todayAppointments = await Appointment.find({
      assignedStaff: userId,
      appointmentDate: {
        $gte: startOfToday,
        $lt: endOfToday,
      },
      status: { $in: ["upcoming", "confirmed"] },
    })
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .sort({ appointmentTime: 1 });

    // Current attendance status
    const todayAttendance = await Attendance.findOne({
      userId,
      date: {
        $gte: startOfToday,
        $lt: endOfToday,
      },
    });

    // Training modules in progress
    const trainingProgress = await UserProgress.find({
      userId,
      status: { $in: ["in-progress", "not-started"] },
    })
      .populate(
        "moduleId",
        "title category coverImage duration difficulty status youtubeVideos resources quiz"
      )
      .sort({ lastAccessedAt: -1 })
      .limit(4);

    // Leaderboard position
    const leaderboardProfile = await Leaderboard.findOne({ userId }).populate(
      "userId",
      "username profileImage"
    );

    // Monthly attendance summary
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthlyStats = await Attendance.getMonthlyAttendance(
      userId,
      currentYear,
      currentMonth
    );

    // Favorite learning modules
    const favoriteModules = await Favorite.find({
      userId,
      itemType: "LearningModule",
    })
      .populate("itemId", "title category coverImage duration")
      .limit(5);

    // Staff appointment statistics
    const appointmentStats = await Appointment.getStaffStats(userId, "month");

    res.json({
      success: true,
      data: {
        staffInfo: {
          id: req.user._id,
          name: req.user.username,
          firstName: req.user.firstName,
          email: req.user.email,
          profileImage: req.user.profileImage,
          position: req.user.position,
          staffId: req.user.staffId,
        },
        todayAppointments: todayAppointments.map((apt) => ({
          id: apt._id,
          customer: {
            id: apt.customer._id,
            username: apt.customer.username,
            firstName: apt.customer.firstName,
            email: apt.customer.email,
            phoneNumber: apt.customer.phoneNumber,
            profileImage: apt.customer.profileImage,
          },
          service: {
            id: apt.service._id,
            name: apt.service.name,
            category: apt.service.category,
            duration: apt.service.duration,
            priceRange: apt.service.priceRange,
          },
          appointmentDate: apt.appointmentDate,
          appointmentTime: apt.appointmentTime,
          status: apt.status,
          notes: apt.notes,
          staffNotes: apt.staffNotes,
          salonLocation: apt.salonLocation,
          totalAmount: apt.totalAmount,
          paymentStatus: apt.paymentStatus,
          cancellationReason: apt.cancellationReason,
          cancelledBy: apt.cancelledBy,
          completedBy: apt.completedBy,
          createdAt: apt.createdAt,
        })),
        attendance: {
          todayStatus: todayAttendance
            ? todayAttendance.clockOutTime
              ? "clocked-out"
              : todayAttendance.clockInTime
              ? "clocked-in"
              : "not-started"
            : "not-started",
          todayRecord: todayAttendance,
          monthlyStats,
        },
        trainingModules: trainingProgress.map((progress) => ({
          id: progress.moduleId._id,
          title: progress.moduleId.title,
          category: progress.moduleId.category,
          progress: progress.progress,
          coverImage: progress.moduleId.coverImage,
          duration: progress.moduleId.duration,
          difficulty: progress.moduleId.difficulty,
          status: progress.status,
          timeSpent: progress.timeSpent,
          hasVideos: (progress.moduleId.youtubeVideos || []).length > 0,
          hasResources: (progress.moduleId.resources || []).length > 0,
          hasQuiz: progress.moduleId.quiz?.isEnabled || false,
        })),
        leaderboard: {
          rank: leaderboardProfile?.currentRank?.overall || 0,
          monthlyRank: leaderboardProfile?.currentRank?.monthly || 0,
          weeklyRank: leaderboardProfile?.currentRank?.weekly || 0,
          points: leaderboardProfile?.totalPoints || 0,
          monthlyPoints: leaderboardProfile?.monthlyPoints || 0,
          weeklyPoints: leaderboardProfile?.weeklyPoints || 0,
        },
        favorites: {
          learningModules: favoriteModules.map((fav) => ({
            id: fav.itemId._id,
            title: fav.itemId.title,
            category: fav.itemId.category,
            coverImage: fav.itemId.coverImage,
            duration: fav.itemId.duration,
          })),
        },
        appointmentStats: {
          completed: appointmentStats.completed?.count || 0,
          upcoming: appointmentStats.upcoming?.count || 0,
          cancelled: appointmentStats.cancelled?.count || 0,
          revenue: appointmentStats.completed?.revenue || 0,
        },
        quickStats: {
          appointmentsToday: todayAppointments.length,
          modulesInProgress: trainingProgress.length,
          currentStreak: leaderboardProfile?.streaks?.attendance?.current || 0,
          favoriteModulesCount: favoriteModules.length,
          attendanceRate: monthlyStats.attendancePercentage,
          completionRate: appointmentStats.completed
            ? Math.round(
                (appointmentStats.completed.count /
                  (appointmentStats.completed.count +
                    appointmentStats.upcoming?.count || 0)) *
                  100
              )
            : 0,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching staff dashboard",
      error: error.message,
    });
  }
});

// Enhanced staff dashboard with reports data
router.get(
  "/dashboard/enhanced",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const userId = req.user._id;

      // Get basic dashboard data
      const basicDashboard = await getStaffDashboardData(userId);

      // Get additional metrics for reports
      const performanceMetrics = await getPerformanceMetrics(userId, "monthly");
      const learningData = await getLearningProgressData(userId);
      const attendanceData = await getAttendanceData(userId, "monthly");

      const enhancedData = {
        ...basicDashboard,
        performance: performanceMetrics,
        learning: learningData,
        attendance: attendanceData,
        // Add fields specifically needed by reports
        knowledgeGain: calculateKnowledgeGain(basicDashboard),
        monthlyGrowth: performanceMetrics.growthRate || 0,
        efficiency: performanceMetrics.efficiency || 75,
        productivity: performanceMetrics.productivity || 80,
        currentKnowledge: basicDashboard.knowledgeLevel || 75,
        startingKnowledge: 50, // Default starting point
        satisfactionRate: basicDashboard.satisfactionRate || 85,
        performanceScore: performanceMetrics.overallScore || 75,
      };

      res.json({
        success: true,
        data: enhancedData,
      });
    } catch (error) {
      console.error("Enhanced dashboard error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching enhanced dashboard",
        error: error.message,
      });
    }
  }
);

// ==================== AVAILABLE STYLISTS ====================

// Get available stylists for booking
router.get("/available-stylists", authMiddleware, async (req, res) => {
  try {
    const availableStylists = await User.find({
      role: "staff",
      isActive: true,
      $or: [
        { position: { $regex: "stylist", $options: "i" } },
        { position: { $regex: "hair", $options: "i" } },
        { position: { $regex: "color", $options: "i" } },
        { position: { $regex: "senior", $options: "i" } },
        { position: { $regex: "junior", $options: "i" } },
        { position: { $regex: "assistant", $options: "i" } },
      ],
    })
      .select(
        "username firstName position profileImage staffId rating reviewCount isActive email phoneNumber"
      )
      .sort({ rating: -1, createdAt: 1 });

    const topRatedCount = Math.max(
      1,
      Math.floor(availableStylists.length * 0.2)
    );
    const stylistsWithFlags = availableStylists.map((stylist, index) => ({
      ...stylist.toObject(),
      topRated: index < topRatedCount,
      rating: stylist.rating || 4.5,
      reviewCount: stylist.reviewCount || 0,
    }));

    res.json({
      success: true,
      data: stylistsWithFlags,
      count: stylistsWithFlags.length,
    });
  } catch (error) {
    console.error("Available stylists error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available stylists",
      error: error.message,
    });
  }
});

// ==================== STAFF APPOINTMENT MANAGEMENT ====================

// Staff appointments with filtering
router.get("/appointments", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { status, date, page = 1, limit = 20 } = req.query;
    const userId = req.user._id;

    const filter = { assignedStaff: userId };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.appointmentDate = { $gte: startDate, $lt: endDate };
    }

    const skip = (page - 1) * limit;

    const appointments = await Appointment.find(filter)
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Appointment.countDocuments(filter);

    // Calculate stats for the staff
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    const todayAppointments = await Appointment.countDocuments({
      assignedStaff: userId,
      appointmentDate: { $gte: startOfToday, $lt: endOfToday },
      status: "upcoming",
    });

    const weeklyStats = await Appointment.aggregate([
      {
        $match: {
          assignedStaff: userId,
          appointmentDate: {
            $gte: new Date(new Date().setDate(new Date().getDate() - 7)),
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        appointments: appointments.map((apt) => ({
          id: apt._id,
          customer: apt.customer,
          service: apt.service,
          appointmentDate: apt.appointmentDate,
          appointmentTime: apt.appointmentTime,
          status: apt.status,
          notes: apt.notes,
          staffNotes: apt.staffNotes,
          salonLocation: apt.salonLocation,
          totalAmount: apt.totalAmount,
          paymentStatus: apt.paymentStatus,
          cancellationReason: apt.cancellationReason,
          cancelledBy: apt.cancelledBy,
          completedBy: apt.completedBy,
          createdAt: apt.createdAt,
        })),
        stats: {
          todayAppointments,
          weeklyStats: weeklyStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          totalAppointments: total,
        },
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Staff appointments error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching staff appointments",
      error: error.message,
    });
  }
});

// @desc    Staff marks appointment as completed - UPDATED VERSION
// @route   PUT /api/staff/appointments/:id/complete
// @access  Private (staff only)
router.put(
  "/appointments/:id/complete",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { staffNotes } = req.body;
      const staffId = req.user._id;

      console.log(`🔄 Staff ${staffId} completing appointment: ${id}`);

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        console.log(`❌ Appointment ${id} not found`);
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      // Check if staff is assigned to this appointment
      if (appointment.assignedStaff?.toString() !== staffId.toString()) {
        console.log(`❌ Staff ${staffId} not assigned to appointment ${id}`);
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only complete appointments assigned to you.",
        });
      }

      if (appointment.status !== "upcoming") {
        console.log(
          `❌ Appointment ${id} is not upcoming, status: ${appointment.status}`
        );
        return res.status(400).json({
          success: false,
          message: "Only upcoming appointments can be marked as completed",
        });
      }

      // Update appointment
      appointment.status = "completed";
      appointment.completedBy = staffId;
      appointment.paymentStatus = "paid";
      if (staffNotes) {
        appointment.staffNotes = staffNotes;
      }

      const updatedAppointment = await appointment.save();

      // Update leaderboard points for completed service
      try {
        const leaderboardProfile = await Leaderboard.findOne({
          userId: staffId,
        });
        if (leaderboardProfile) {
          leaderboardProfile.servicesCompleted.total += 1;
          leaderboardProfile.servicesCompleted.monthly += 1;
          leaderboardProfile.totalPoints += 10; // Points for completing a service
          leaderboardProfile.monthlyPoints += 10;
          await leaderboardProfile.save();
          console.log(`✅ Leaderboard updated for staff ${staffId}`);
        }
      } catch (leaderboardError) {
        console.error("Error updating leaderboard:", leaderboardError);
        // Don't fail the request if leaderboard update fails
      }

      console.log(`✅ Appointment ${id} marked as completed successfully`);

      res.json({
        success: true,
        message: "Appointment marked as completed successfully",
        data: updatedAppointment,
      });
    } catch (error) {
      console.error("Complete appointment error:", error);
      res.status(500).json({
        success: false,
        message: "Error completing appointment",
        error: error.message,
      });
    }
  }
);

// @desc    Staff cancels appointment
// @route   PUT /api/staff/appointments/:id/cancel
// @access  Private (staff only)
router.put(
  "/appointments/:id/cancel",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { cancellationReason, staffNotes } = req.body;
      const staffId = req.user._id;

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      // Check if staff is assigned to this appointment or has permission to cancel any
      const canCancelAny = req.user.permissions?.includes(
        "manage_all_appointments"
      );
      if (
        !canCancelAny &&
        appointment.assignedStaff?.toString() !== staffId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only cancel appointments assigned to you.",
        });
      }

      if (appointment.status === "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Appointment is already cancelled",
        });
      }

      // Update appointment
      appointment.status = "cancelled";
      appointment.cancelledBy = "staff";
      if (cancellationReason) {
        appointment.cancellationReason = cancellationReason;
      }
      if (staffNotes) {
        appointment.staffNotes = staffNotes;
      }

      const updatedAppointment = await appointment.save();

      res.json({
        success: true,
        message: "Appointment cancelled successfully",
        data: updatedAppointment,
      });
    } catch (error) {
      console.error("Cancel appointment error:", error);
      res.status(500).json({
        success: false,
        message: "Error cancelling appointment",
        error: error.message,
      });
    }
  }
);

// @desc    Get staff appointment statistics
// @route   GET /api/staff/appointments/stats
// @access  Private (staff only)
router.get(
  "/appointments/stats",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const staffId = req.user._id;
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      // Monthly stats
      const monthlyStats = await Appointment.aggregate([
        {
          $match: {
            assignedStaff: staffId,
            appointmentDate: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
          },
        },
      ]);

      // Weekly completion rate
      const startOfWeek = new Date(
        today.setDate(today.getDate() - today.getDay())
      );
      const endOfWeek = new Date(
        today.setDate(today.getDate() - today.getDay() + 6)
      );

      const weeklyStats = await Appointment.aggregate([
        {
          $match: {
            assignedStaff: staffId,
            appointmentDate: { $gte: startOfWeek, $lte: endOfWeek },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      // Convert to more usable format
      const monthlyData = monthlyStats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          revenue: stat.totalRevenue || 0,
        };
        return acc;
      }, {});

      const weeklyData = weeklyStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          monthly: monthlyData,
          weekly: weeklyData,
          completedThisMonth: monthlyData.completed?.count || 0,
          revenueThisMonth: monthlyData.completed?.revenue || 0,
          completionRate: monthlyData.completed
            ? Math.round(
                (monthlyData.completed.count /
                  Object.values(monthlyData).reduce(
                    (sum, stat) => sum + stat.count,
                    0
                  )) *
                  100
              )
            : 0,
        },
      });
    } catch (error) {
      console.error("Staff appointment stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching appointment statistics",
        error: error.message,
      });
    }
  }
);

// Get all client bookings for staff view
router.get("/client-bookings", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { status, date, page = 1, limit = 50 } = req.query;

    const filter = {};

    // Staff can see all bookings
    if (status && status !== "all") {
      filter.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.appointmentDate = { $gte: startDate, $lt: endDate };
    }

    const skip = (page - 1) * limit;

    // Use Booking model instead of Appointment for broader access
    const bookings = await Booking.find(filter)
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .populate("selectedStylist", "username profileImage position")
      .sort({ preferredDate: 1, preferredTime: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
      data: bookings.map((booking) => ({
        id: booking._id,
        customer: booking.customer,
        service: booking.service,
        selectedStylist: booking.selectedStylist,
        appointmentDate: booking.preferredDate,
        appointmentTime: booking.preferredTime,
        status: booking.status,
        notes: booking.customerNotes,
        salonLocation: booking.salonLocation || {
          name: "SandreaLee Salon",
          address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
        },
        totalAmount: booking.totalAmount,
        paymentStatus: booking.paymentStatus,
        createdAt: booking.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Client bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching client bookings",
      error: error.message,
    });
  }
});

// Update booking status (for staff to manage client bookings)
router.put(
  "/bookings/:id/status",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;

      const validStatuses = ["pending", "confirmed", "completed", "cancelled"];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(
            ", "
          )}`,
        });
      }

      const booking = await Booking.findById(id);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      const oldStatus = booking.status;
      booking.status = status;

      if (adminNotes) {
        booking.adminNotes = adminNotes;
      }

      await booking.save();

      console.log(`✅ Booking status updated: ${oldStatus} -> ${status}`);

      res.json({
        success: true,
        message: "Booking status updated successfully",
        data: booking,
      });
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({
        success: false,
        message: "Error updating booking status",
        error: error.message,
      });
    }
  }
);

// ==================== STAFF PROFILE ====================

// Staff profile with performance metrics
router.get("/profile", authMiddleware, staffOnly, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -security -verification"
    );

    const leaderboardProfile = await Leaderboard.findOne({
      userId: req.user._id,
    });

    // Get attendance statistics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const attendanceRecords = await Attendance.find({
      userId: req.user._id,
      date: { $gte: thirtyDaysAgo },
    });

    const attendanceStats = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter((a) => a.status === "present").length,
      late: attendanceRecords.filter((a) => a.status === "late").length,
      absent: attendanceRecords.filter((a) => a.status === "absent").length,
      attendanceRate:
        attendanceRecords.length > 0
          ? Math.round(
              (attendanceRecords.filter(
                (a) => a.status === "present" || a.status === "late"
              ).length /
                attendanceRecords.length) *
                100
            )
          : 0,
    };

    // Get service statistics
    const serviceStats = await Booking.aggregate([
      {
        $match: {
          selectedStylist: user._id,
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$service",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "services",
          localField: "_id",
          foreignField: "_id",
          as: "serviceInfo",
        },
      },
      {
        $unwind: "$serviceInfo",
      },
      {
        $project: {
          serviceName: "$serviceInfo.name",
          count: 1,
        },
      },
    ]);

    // Get appointment statistics
    const appointmentStats = await Appointment.getStaffStats(user._id, "month");

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          firstName: user.firstName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage,
          role: user.role,
          position: user.position,
          staffId: user.staffId,
          hireDate: user.hireDate,
          isActive: user.isActive,
        },
        performance: {
          totalPoints: leaderboardProfile?.totalPoints || 0,
          monthlyRank: leaderboardProfile?.currentRank?.monthly || 0,
          weeklyRank: leaderboardProfile?.currentRank?.weekly || 0,
          overallRank: leaderboardProfile?.currentRank?.overall || 0,
          badgesCount: leaderboardProfile?.badges?.length || 0,
          attendanceScore: leaderboardProfile?.attendanceScore || 0,
          customerRating: leaderboardProfile?.customerRatings?.average || 0,
          servicesCompleted: leaderboardProfile?.servicesCompleted?.total || 0,
        },
        statistics: {
          attendance: attendanceStats,
          services: serviceStats,
          appointments: appointmentStats,
          learningModulesCompleted:
            leaderboardProfile?.learningModulesCompleted?.total || 0,
          totalRevenue: leaderboardProfile?.salesPerformance?.totalRevenue || 0,
        },
      },
    });
  } catch (error) {
    console.error("Staff profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching staff profile",
      error: error.message,
    });
  }
});

// Update staff profile
router.put("/profile", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { username, firstName, email, phoneNumber, profileImage } = req.body;

    const user = await User.findById(req.user._id);

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }
      user.username = username;
    }

    if (firstName) {
      user.firstName = firstName;
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already taken",
        });
      }
      user.email = email;
    }

    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingUser = await User.findOne({ phoneNumber });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Phone number already taken",
        });
      }
      user.phoneNumber = phoneNumber;
    }

    if (profileImage) {
      user.profileImage = profileImage;
    }

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: user._id,
        username: user.username,
        firstName: user.firstName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        position: user.position,
        staffId: user.staffId,
      },
    });
  } catch (error) {
    console.error("Update staff profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating staff profile",
      error: error.message,
    });
  }
});

// ==================== FAVORITES MANAGEMENT ====================

// Staff favorites for learning modules
router.get(
  "/favorites/learning-modules",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const userId = req.user._id;

      const favorites = await Favorite.find({
        userId,
        itemType: "LearningModule",
      })
        .populate(
          "itemId",
          "title category coverImage instructor estimatedDuration difficulty rating"
        )
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: favorites.map((fav) => ({
          id: fav._id,
          module: fav.itemId,
          addedAt: fav.createdAt,
        })),
        count: favorites.length,
      });
    } catch (error) {
      console.error("Favorites error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching favorites",
        error: error.message,
      });
    }
  }
);

// Add learning module to favorites
router.post(
  "/favorites/learning-modules/:moduleId",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { moduleId } = req.params;
      const userId = req.user._id;

      const module = await LearningModule.findById(moduleId);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Learning module not found",
        });
      }

      const existingFavorite = await Favorite.findOne({
        userId,
        itemType: "LearningModule",
        itemId: moduleId,
      });

      if (existingFavorite) {
        return res.status(400).json({
          success: false,
          message: "Module already in favorites",
        });
      }

      const favorite = new Favorite({
        userId,
        itemType: "LearningModule",
        itemId: moduleId,
      });

      await favorite.save();

      res.status(201).json({
        success: true,
        message: "Module added to favorites",
        data: {
          id: favorite._id,
          module: module,
          addedAt: favorite.createdAt,
        },
      });
    } catch (error) {
      console.error("Add favorite error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding to favorites",
        error: error.message,
      });
    }
  }
);

// Remove learning module from favorites
router.delete(
  "/favorites/learning-modules/:favoriteId",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { favoriteId } = req.params;
      const userId = req.user._id;

      const favorite = await Favorite.findOneAndDelete({
        _id: favoriteId,
        userId,
        itemType: "LearningModule",
      });

      if (!favorite) {
        return res.status(404).json({
          success: false,
          message: "Favorite not found",
        });
      }

      res.json({
        success: true,
        message: "Module removed from favorites",
      });
    } catch (error) {
      console.error("Remove favorite error:", error);
      res.status(500).json({
        success: false,
        message: "Error removing from favorites",
        error: error.message,
      });
    }
  }
);

// ==================== LEARNING MODULES ====================

// Learning modules for staff
router.get("/learning-modules", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { category, status, page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    const query = { isActive: true };
    if (category && category !== "all") {
      query.category = category;
    }

    const skip = (page - 1) * limit;

    const modules = await LearningModule.find(query)
      .populate("createdBy", "username profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get user progress for each module
    const modulesWithProgress = await Promise.all(
      modules.map(async (module) => {
        const progress = await UserProgress.findOne({
          userId,
          moduleId: module._id,
        });

        const isFavorite = await Favorite.findOne({
          userId,
          itemType: "LearningModule",
          itemId: module._id,
        });

        return {
          ...module.toObject(),
          userProgress: progress || {
            status: "not-started",
            progress: 0,
            timeSpent: 0,
          },
          isFavorite: !!isFavorite,
        };
      })
    );

    const total = await LearningModule.countDocuments(query);

    res.json({
      success: true,
      data: modulesWithProgress,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Learning modules error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching learning modules",
      error: error.message,
    });
  }
});

// Mark learning module as completed
router.post(
  "/learning-modules/:moduleId/complete",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { moduleId } = req.params;
      const userId = req.user._id;
      const { quizScore } = req.body;

      let progress = await UserProgress.findOne({
        userId,
        moduleId,
      });

      if (!progress) {
        progress = new UserProgress({
          userId,
          moduleId,
        });
      }

      progress.status = "completed";
      progress.progress = 100;
      progress.completedAt = new Date();

      if (quizScore !== undefined) {
        progress.quizScores.push({
          attempt: progress.quizScores.length + 1,
          score: quizScore.score,
          totalQuestions: quizScore.totalQuestions,
          correctAnswers: quizScore.correctAnswers,
          completedAt: new Date(),
        });
      }

      await progress.save();

      // Update leaderboard
      const leaderboardProfile = await Leaderboard.findOne({ userId });
      if (leaderboardProfile) {
        leaderboardProfile.learningModulesCompleted.total += 1;
        leaderboardProfile.learningModulesCompleted.monthly += 1;
        await leaderboardProfile.save();
      }

      res.json({
        success: true,
        message: "Module marked as completed",
        data: progress,
      });
    } catch (error) {
      console.error("Complete module error:", error);
      res.status(500).json({
        success: false,
        message: "Error completing module",
        error: error.message,
      });
    }
  }
);

// ==================== LEADERBOARD ====================

// Staff leaderboard
router.get("/leaderboard", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { type = "overall", limit = 50 } = req.query;

    const leaderboard = await Leaderboard.getLeaderboard(type, parseInt(limit));

    // Get current user's position
    const currentUser = await Leaderboard.findOne({
      userId: req.user._id,
    }).populate("userId", "username profileImage position");

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
    console.error("Leaderboard error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching leaderboard",
      error: error.message,
    });
  }
});

// ==================== ATTENDANCE REPORTS ====================

// Monthly attendance report
router.get(
  "/attendance/report",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const {
        year = new Date().getFullYear(),
        month = new Date().getMonth() + 1,
      } = req.query;
      const userId = req.user._id;

      const monthlyData = await Attendance.getMonthlyAttendance(
        userId,
        parseInt(year),
        parseInt(month)
      );

      // Get detailed attendance records for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const attendanceRecords = await Attendance.find({
        userId,
        date: { $gte: startDate, $lte: endDate },
      }).sort({ date: 1 });

      res.json({
        success: true,
        data: {
          summary: monthlyData,
          records: attendanceRecords,
          month: parseInt(month),
          year: parseInt(year),
        },
      });
    } catch (error) {
      console.error("Attendance report error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching attendance report",
        error: error.message,
      });
    }
  }
);

// ==================== NEW BOOKINGS NOTIFICATION ====================

// Get new bookings since last checked
router.get("/bookings/new", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { lastChecked } = req.query;
    const userId = req.user._id;

    let query = {
      selectedStylist: userId,
      status: { $in: ["pending", "confirmed", "upcoming"] },
    };

    // If lastChecked is provided, only get bookings after that time
    if (lastChecked) {
      query.createdAt = { $gt: new Date(lastChecked) };
    }

    const newBookings = await Booking.find(query)
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .populate("selectedStylist", "username profileImage position")
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: newBookings,
      count: newBookings.length,
      lastChecked: new Date().toISOString(),
    });
  } catch (error) {
    console.error("New bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching new bookings",
      error: error.message,
    });
  }
});

// ==================== STAFF REPORTS & ANALYTICS ====================

// @desc    Get comprehensive staff reports data for charts and analytics
// @route   GET /api/staff/reports/comprehensive
// @access  Private (staff only)
router.get(
  "/reports/comprehensive",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { timeframe = "monthly" } = req.query;
      const userId = req.user._id;

      console.log(
        `📊 Fetching comprehensive reports for staff ${userId}, timeframe: ${timeframe}`
      );

      // Get date range based on timeframe
      const { startDate, endDate } = getDateRange(timeframe);

      // Fetch all reports data in parallel
      const [
        staffData,
        performanceData,
        leaderboardData,
        learningData,
        attendanceData,
        appointmentStats,
      ] = await Promise.all([
        getStaffDashboardData(userId),
        getPerformanceMetrics(userId, timeframe),
        getLeaderboardData(userId),
        getLearningProgressData(userId),
        getAttendanceData(userId, timeframe),
        getAppointmentStats(userId, timeframe),
      ]);

      // Transform data for frontend charts
      const reportsData = {
        staff: {
          // Client metrics
          clientsCount: staffData.totalClients || 0,
          questionsAnswered:
            staffData.interactions || staffData.questionsAnswered || 0,
          avgSessionLength: formatSessionLength(
            staffData.avgSessionDuration || "0h 00m"
          ),

          // Knowledge metrics
          knowledgeGain: calculateKnowledgeGain(staffData),
          startingKnowledge: staffData.startingKnowledge || 50,
          currentKnowledge:
            staffData.currentKnowledge || staffData.knowledgeLevel || 75,

          // Performance metrics
          performanceScore:
            performanceData.overallScore || staffData.performanceScore || 0,
          monthlyGrowth:
            performanceData.growthRate || staffData.monthlyGrowth || 0,
          satisfactionRate:
            staffData.satisfactionRate || performanceData.satisfaction || 85,
          productivity:
            performanceData.productivity || staffData.productivity || 80,
          efficiency: performanceData.efficiency || staffData.efficiency || 75,
        },
        leaderboard: {
          topPerformers: transformTopPerformers(
            leaderboardData.topPerformers || []
          ),
          myRank: leaderboardData.myRank || leaderboardData.rank || 0,
          myPoints: leaderboardData.myPoints || leaderboardData.points || 0,
          totalParticipants: leaderboardData.totalParticipants || 0,
          rankChange: leaderboardData.rankChange || 0,
        },
        modules: {
          progress: transformModuleProgress(
            learningData.progress || learningData.modules || []
          ),
          completedCount:
            learningData.completedCount || learningData.completedModules || 0,
          inProgressCount:
            learningData.inProgressCount || learningData.activeModules || 0,
          totalModules:
            learningData.totalModules || learningData.availableModules || 0,
          certificationCount:
            learningData.certificationCount ||
            learningData.certificatesEarned ||
            0,
        },
        attendance: {
          monthlyData: transformAttendanceData(
            attendanceData.monthlyData || [],
            timeframe
          ),
          presentDays:
            attendanceData.presentDays || attendanceData.daysPresent || 0,
          absentDays:
            attendanceData.absentDays || attendanceData.daysAbsent || 0,
          lateDays: attendanceData.lateDays || attendanceData.daysLate || 0,
          attendanceRate:
            attendanceData.attendanceRate ||
            calculateAttendanceRate(attendanceData),
          punctuality:
            attendanceData.punctuality || attendanceData.onTimeRate || 95,
          averageHours:
            attendanceData.averageHours || attendanceData.avgWorkHours || 8,
        },
        performance: {
          trends:
            performanceData.trends || generatePerformanceTrends(timeframe),
          comparison:
            performanceData.comparison || generatePerformanceComparison(),
          metrics: performanceData.metrics || {},
        },
      };

      console.log("✅ Comprehensive reports data generated successfully");

      res.json({
        success: true,
        data: reportsData,
        lastUpdated: new Date(),
        timeframe,
      });
    } catch (error) {
      console.error("Comprehensive reports error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating comprehensive reports",
        error: error.message,
      });
    }
  }
);

// @desc    Get staff performance metrics for reports
// @route   GET /api/staff/performance/metrics
// @access  Private (staff only)
router.get(
  "/performance/metrics",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { timeframe = "monthly" } = req.query;
      const userId = req.user._id;

      const performanceData = await getPerformanceMetrics(userId, timeframe);

      res.json({
        success: true,
        data: performanceData,
        timeframe,
      });
    } catch (error) {
      console.error("Performance metrics error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching performance metrics",
        error: error.message,
      });
    }
  }
);

// @desc    Get staff performance analytics
// @route   GET /api/staff/performance/analytics
// @access  Private (staff only)
router.get(
  "/performance/analytics",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { timeframe = "monthly" } = req.query;
      const userId = req.user._id;

      const analytics = await generatePerformanceAnalytics(userId, timeframe);

      res.json({
        success: true,
        data: analytics,
        timeframe,
      });
    } catch (error) {
      console.error("Performance analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating performance analytics",
        error: error.message,
      });
    }
  }
);

// @desc    Export staff reports data
// @route   GET /api/staff/reports/export
// @access  Private (staff only)
router.get("/reports/export", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { format = "json" } = req.query;
    const userId = req.user._id;

    // Get comprehensive data
    const reportsData = await generateComprehensiveReportsData(
      userId,
      "monthly"
    );

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="staff-report-${userId}-${
          new Date().toISOString().split("T")[0]
        }.json"`
      );

      res.json({
        success: true,
        data: reportsData,
        exportedAt: new Date(),
        staffId: userId,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Unsupported export format. Use 'json'.",
      });
    }
  } catch (error) {
    console.error("Export reports error:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting reports",
      error: error.message,
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

// Helper function to get date range based on timeframe
function getDateRange(timeframe) {
  const now = new Date();
  let startDate, endDate;

  switch (timeframe) {
    case "weekly":
      startDate = new Date(now.setDate(now.getDate() - 7));
      endDate = new Date();
      break;
    case "monthly":
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "quarterly":
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      endDate = new Date();
      break;
    default: // monthly
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
  }

  return { startDate, endDate };
}

// Helper function to get staff dashboard data
async function getStaffDashboardData(userId) {
  try {
    // Use existing dashboard data
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyAppointments = await Appointment.find({
      assignedStaff: userId,
      appointmentDate: { $gte: startOfMonth },
      status: "completed",
    });

    const totalClients = await Appointment.distinct("customer", {
      assignedStaff: userId,
      status: "completed",
    });

    const interactions = await Appointment.countDocuments({
      assignedStaff: userId,
      status: "completed",
    });

    // Calculate average session duration
    const avgDuration =
      monthlyAppointments.length > 0
        ? monthlyAppointments.reduce((sum, apt) => {
            const duration = parseInt(
              apt.service?.duration?.replace("min", "") || "30"
            );
            return sum + duration;
          }, 0) / monthlyAppointments.length
        : 30;

    return {
      totalClients: totalClients.length,
      interactions,
      avgSessionDuration: avgDuration,
      performanceScore: calculatePerformanceScore(monthlyAppointments),
      satisfactionRate: await calculateSatisfactionRate(userId),
      knowledgeLevel: await calculateKnowledgeLevel(userId),
      startingKnowledge: 50,
      currentKnowledge: await calculateKnowledgeLevel(userId),
    };
  } catch (error) {
    console.error("Error getting staff dashboard data:", error);
    return {
      totalClients: 0,
      interactions: 0,
      avgSessionDuration: 30,
      performanceScore: 75,
      satisfactionRate: 85,
      knowledgeLevel: 75,
      startingKnowledge: 50,
      currentKnowledge: 75,
    };
  }
}

// Helper function to get performance metrics
async function getPerformanceMetrics(userId, timeframe) {
  try {
    const { startDate, endDate } = getDateRange(timeframe);

    const appointments = await Appointment.find({
      assignedStaff: userId,
      appointmentDate: { $gte: startDate, $lte: endDate },
    });

    const totalAppointments = appointments.length;
    const totalRevenue = appointments.reduce(
      (sum, apt) => sum + (apt.totalAmount || 0),
      0
    );
    const completedCount = appointments.filter(
      (apt) => apt.status === "completed"
    ).length;

    // Calculate performance score based on multiple factors
    const attendanceRate = await calculateAttendanceRateForPeriod(
      userId,
      startDate,
      endDate
    );
    const completionRate =
      totalAppointments > 0 ? (completedCount / totalAppointments) * 100 : 0;
    const revenuePerAppointment =
      totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

    const performanceScore = Math.round(
      attendanceRate * 0.3 +
        completionRate * 0.4 +
        Math.min(revenuePerAppointment / 100, 1) * 100 * 0.3
    );

    return {
      overallScore: performanceScore,
      growthRate: await calculateGrowthRate(userId, timeframe),
      productivity: Math.round(completionRate),
      efficiency: Math.round(
        (completedCount / Math.max(totalAppointments, 1)) * 100
      ),
      satisfaction: await calculateSatisfactionRate(userId),
      metrics: {
        totalAppointments,
        completedCount,
        totalRevenue,
        attendanceRate,
        revenuePerAppointment,
      },
    };
  } catch (error) {
    console.error("Error getting performance metrics:", error);
    return {
      overallScore: 75,
      growthRate: 0,
      productivity: 80,
      efficiency: 75,
      satisfaction: 85,
      metrics: {},
    };
  }
}

// Helper function to get leaderboard data
async function getLeaderboardData(userId) {
  try {
    const leaderboardProfile = await Leaderboard.findOne({ userId }).populate(
      "userId",
      "username profileImage position"
    );

    if (!leaderboardProfile) {
      return {
        myRank: 0,
        myPoints: 0,
        totalParticipants: 0,
        rankChange: 0,
        topPerformers: [],
      };
    }

    // Get top performers
    const topPerformers = await Leaderboard.find({ isActive: true })
      .populate("userId", "username profileImage position")
      .sort({ totalPoints: -1 })
      .limit(5);

    return {
      myRank: leaderboardProfile.currentRank?.overall || 0,
      myPoints: leaderboardProfile.totalPoints || 0,
      totalParticipants: await Leaderboard.countDocuments({ isActive: true }),
      rankChange:
        leaderboardProfile.previousRank?.overall -
          leaderboardProfile.currentRank?.overall || 0,
      topPerformers: topPerformers.map((profile, index) => ({
        id: profile.userId._id,
        name: profile.userId.username,
        points: profile.totalPoints,
        position: profile.userId.position,
        isCurrentUser: profile.userId._id.toString() === userId.toString(),
        rank: index + 1,
      })),
    };
  } catch (error) {
    console.error("Error getting leaderboard data:", error);
    return {
      myRank: 0,
      myPoints: 0,
      totalParticipants: 0,
      rankChange: 0,
      topPerformers: [],
    };
  }
}

// Helper function to get learning progress data
async function getLearningProgressData(userId) {
  try {
    const userProgress = await UserProgress.find({ userId }).populate(
      "moduleId",
      "title category status difficulty"
    );

    const completedCount = userProgress.filter(
      (progress) => progress.status === "completed"
    ).length;
    const inProgressCount = userProgress.filter(
      (progress) => progress.status === "in-progress"
    ).length;
    const totalModules = await LearningModule.countDocuments({
      isActive: true,
    });

    return {
      progress: userProgress.map((progress) => ({
        id: progress.moduleId._id,
        title: progress.moduleId.title,
        category: progress.moduleId.category,
        progress: progress.progress,
        status: progress.status,
        difficulty: progress.moduleId.difficulty,
      })),
      completedCount,
      inProgressCount,
      totalModules,
      certificationCount: userProgress.filter(
        (progress) =>
          progress.status === "completed" && progress.quizScores?.length > 0
      ).length,
    };
  } catch (error) {
    console.error("Error getting learning progress data:", error);
    return {
      progress: [],
      completedCount: 0,
      inProgressCount: 0,
      totalModules: 0,
      certificationCount: 0,
    };
  }
}

// Helper function to get attendance data
async function getAttendanceData(userId, timeframe) {
  try {
    const { startDate, endDate } = getDateRange(timeframe);

    const attendanceRecords = await Attendance.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    });

    const presentDays = attendanceRecords.filter(
      (record) => record.status === "present" || record.status === "late"
    ).length;

    const absentDays = attendanceRecords.filter(
      (record) => record.status === "absent"
    ).length;

    const lateDays = attendanceRecords.filter(
      (record) => record.status === "late"
    ).length;

    const totalDays = attendanceRecords.length;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    // Generate monthly data for charts
    const monthlyData = generateMonthlyAttendanceData(attendanceRecords);

    return {
      monthlyData,
      presentDays,
      absentDays,
      lateDays,
      attendanceRate: Math.round(attendanceRate),
      punctuality:
        totalDays > 0
          ? Math.round(((presentDays - lateDays) / totalDays) * 100)
          : 100,
      averageHours: calculateAverageHours(attendanceRecords),
    };
  } catch (error) {
    console.error("Error getting attendance data:", error);
    return {
      monthlyData: Array(12).fill(0),
      presentDays: 0,
      absentDays: 0,
      lateDays: 0,
      attendanceRate: 0,
      punctuality: 0,
      averageHours: 0,
    };
  }
}

// Helper function to get appointment stats
async function getAppointmentStats(userId, timeframe) {
  try {
    const { startDate, endDate } = getDateRange(timeframe);

    const appointments = await Appointment.find({
      assignedStaff: userId,
      appointmentDate: { $gte: startDate, $lte: endDate },
    });

    const stats = appointments.reduce((acc, apt) => {
      acc[apt.status] = (acc[apt.status] || 0) + 1;
      return acc;
    }, {});

    return stats;
  } catch (error) {
    console.error("Error getting appointment stats:", error);
    return {};
  }
}

// Helper function to generate monthly attendance data
function generateMonthlyAttendanceData(attendanceRecords) {
  const monthlyData = Array(12).fill(0);

  attendanceRecords.forEach((record) => {
    const month = new Date(record.date).getMonth();
    if (record.status === "present" || record.status === "late") {
      monthlyData[month] = (monthlyData[month] || 0) + 1;
    }
  });

  // Convert to percentages (assuming 20 working days per month)
  return monthlyData.map((days) => Math.round((days / 20) * 100));
}

// Helper function to calculate average hours
function calculateAverageHours(attendanceRecords) {
  const validRecords = attendanceRecords.filter(
    (record) => record.clockInTime && record.clockOutTime
  );

  if (validRecords.length === 0) return 8;

  const totalHours = validRecords.reduce((sum, record) => {
    const start = new Date(record.clockInTime);
    const end = new Date(record.clockOutTime);
    const hours = (end - start) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);

  return Math.round((totalHours / validRecords.length) * 10) / 10;
}

// Helper function to calculate performance score
function calculatePerformanceScore(appointments) {
  if (appointments.length === 0) return 75;

  const completionRate =
    appointments.filter((apt) => apt.status === "completed").length /
    appointments.length;
  const revenue = appointments.reduce(
    (sum, apt) => sum + (apt.totalAmount || 0),
    0
  );
  const avgRevenue = revenue / appointments.length;

  return Math.round(completionRate * 60 + Math.min(avgRevenue / 100, 1) * 40);
}

// Helper function to calculate satisfaction rate (mock for now)
async function calculateSatisfactionRate(userId) {
  // In a real app, this would come from customer ratings
  return 85 + Math.floor(Math.random() * 15); // 85-100%
}

// Helper function to calculate knowledge level
async function calculateKnowledgeLevel(userId) {
  try {
    const completedModules = await UserProgress.countDocuments({
      userId,
      status: "completed",
    });

    const totalModules = await LearningModule.countDocuments({
      isActive: true,
    });

    return totalModules > 0
      ? Math.round((completedModules / totalModules) * 100)
      : 50;
  } catch (error) {
    return 75;
  }
}

// Helper function to calculate growth rate
async function calculateGrowthRate(userId, timeframe) {
  // Mock implementation - in real app, compare with previous period
  return 5 + Math.floor(Math.random() * 10); // 5-15%
}

// Helper function to calculate attendance rate for period
async function calculateAttendanceRateForPeriod(userId, startDate, endDate) {
  try {
    const attendanceRecords = await Attendance.find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    });

    const presentDays = attendanceRecords.filter(
      (record) => record.status === "present" || record.status === "late"
    ).length;

    return attendanceRecords.length > 0
      ? (presentDays / attendanceRecords.length) * 100
      : 100;
  } catch (error) {
    return 95;
  }
}

// Data transformation helpers
function formatSessionLength(duration) {
  if (typeof duration === "string") return duration;
  if (typeof duration === "number") {
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return `${hours}h ${minutes}m`;
  }
  return "0h 00m";
}

function calculateKnowledgeGain(staffData) {
  if (staffData.knowledgeGain) return staffData.knowledgeGain;
  if (staffData.currentKnowledge && staffData.startingKnowledge) {
    return staffData.currentKnowledge - staffData.startingKnowledge;
  }
  return staffData.skillImprovement || 0;
}

function calculateAttendanceRate(attendanceData) {
  if (attendanceData.attendanceRate) return attendanceData.attendanceRate;
  const present = attendanceData.presentDays || attendanceData.present || 0;
  const total =
    present + (attendanceData.absentDays || attendanceData.absent || 0);
  return total > 0 ? Math.round((present / total) * 100) : 0;
}

function transformTopPerformers(performers) {
  return performers.map((performer, index) => ({
    id: performer.id || performer._id || `user-${index}`,
    name: performer.name || performer.username || `User ${index + 1}`,
    points: performer.points || performer.score || 0,
    position: performer.position || performer.role || "Staff",
    isCurrentUser: performer.isCurrentUser || false,
  }));
}

function transformModuleProgress(modules) {
  if (!Array.isArray(modules)) return [];

  return modules.map((module, index) => ({
    id: module.id || module._id || `module-${index}`,
    title: module.title || module.name || `Learning Module ${index + 1}`,
    progress: module.progress || module.completionRate || 0,
    status:
      module.status || (module.progress === 100 ? "completed" : "in-progress"),
    category: module.category || module.type || "General",
    level: module.level || module.difficulty || "Beginner",
  }));
}

function transformAttendanceData(monthlyData, timeframe) {
  if (!Array.isArray(monthlyData)) {
    // Generate realistic mock data based on timeframe
    const baseRate = timeframe === "weekly" ? 85 : 90;
    const dataPoints = timeframe === "weekly" ? 7 : 12;

    return Array(dataPoints)
      .fill(0)
      .map((_, index) =>
        Math.max(60, Math.min(100, baseRate + (Math.random() * 20 - 10)))
      );
  }
  return monthlyData.map((value) => (typeof value === "number" ? value : 0));
}

// Mock data generators for development
function generatePerformanceTrends(timeframe) {
  const dataPoints = timeframe === "weekly" ? 7 : 12;
  return Array(dataPoints)
    .fill(0)
    .map((_, index) => ({
      period: `Period ${index + 1}`,
      performance: 70 + Math.random() * 30,
      attendance: 80 + Math.random() * 20,
      knowledge: 60 + Math.random() * 40,
    }));
}

function generatePerformanceComparison() {
  return {
    you: 75 + Math.floor(Math.random() * 25),
    average: 70 + Math.floor(Math.random() * 20),
    top: 85 + Math.floor(Math.random() * 15),
  };
}

async function generatePerformanceAnalytics(userId, timeframe) {
  return {
    strengths: ["Client Service", "Technical Skills", "Punctuality"],
    areasForImprovement: ["Product Knowledge", "Upselling", "Documentation"],
    recommendations: [
      "Complete advanced coloring module",
      "Focus on client consultation skills",
      "Improve appointment documentation",
    ],
  };
}

async function generateComprehensiveReportsData(userId, timeframe) {
  const { startDate, endDate } = getDateRange(timeframe);

  const [
    staffData,
    performanceData,
    leaderboardData,
    learningData,
    attendanceData,
    appointmentStats,
  ] = await Promise.all([
    getStaffDashboardData(userId),
    getPerformanceMetrics(userId, timeframe),
    getLeaderboardData(userId),
    getLearningProgressData(userId),
    getAttendanceData(userId, timeframe),
    getAppointmentStats(userId, timeframe),
  ]);

  return {
    staff: staffData,
    performance: performanceData,
    leaderboard: leaderboardData,
    learning: learningData,
    attendance: attendanceData,
    appointments: appointmentStats,
    timeframe,
    generatedAt: new Date(),
  };
}

export default router;
