// routes/attendanceRoutes.js - COMPLETE UPDATED WITH BREAK FUNCTIONALITY
import express from "express";
import Attendance from "../models/Attendance.js";
import Leaderboard from "../models/Leaderboards.js";
import { authMiddleware, staffOnly } from "../middleware/auth.js";

const router = express.Router();

// Get attendance dashboard data
router.get("/dashboard", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1,
    } = req.query;

    // Get monthly summary
    const monthlyData = await Attendance.getMonthlyAttendance(
      userId,
      Number.parseInt(year),
      Number.parseInt(month)
    );

    // Get recent attendance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentAttendance = await Attendance.find({
      userId: userId,
      date: { $gte: sevenDaysAgo },
    })
      .sort({ date: -1 })
      .limit(7);

    // Get today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAttendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    // Determine current status including break status
    let currentStatus = "not-started";
    if (todayAttendance) {
      if (todayAttendance.status === "on-break") {
        currentStatus = "on-break";
      } else if (todayAttendance.clockInTime && !todayAttendance.clockOutTime) {
        currentStatus = "clocked-in";
      } else if (todayAttendance.clockOutTime) {
        currentStatus = "clocked-out";
      }
    }

    res.json({
      success: true,
      data: {
        monthly: monthlyData,
        recent: recentAttendance,
        today: todayAttendance,
        currentStatus: currentStatus,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance dashboard",
      error: error.message,
    });
  }
});

// Clock in with GPS validation (UPDATED)
router.post("/clock-in", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Location coordinates are required",
      });
    }

    // Enhanced GPS validation with 5km radius
    const locationCheck = Attendance.isWithinSalonRadius(
      latitude,
      longitude,
      14.5995,
      120.9842,
      5
    ); // 5km radius

    if (!locationCheck.isWithin) {
      return res.status(400).json({
        success: false,
        message: "Clock-In Failed!",
        details: `Oops! You're not in the salon yet. Distance: ${locationCheck.distance.toFixed(
          1
        )}km away from SandreaLee Salon. Manager Alert: Your late clock-in will be logged. Better hurry—your next client waits!`,
        distance: locationCheck.distance,
        distanceMeters: locationCheck.distanceMeters,
        isValidLocation: false,
      });
    }

    // Check if already clocked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let attendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (attendance && attendance.clockInTime) {
      return res.status(400).json({
        success: false,
        message: "Already clocked in today",
      });
    }

    // Create or update attendance record
    if (!attendance) {
      attendance = new Attendance({
        userId: userId,
        date: new Date(),
      });
    }

    const currentTime = new Date();
    attendance.clockInTime = currentTime;
    attendance.clockInLocation = {
      latitude: latitude,
      longitude: longitude,
      address: address || "SandreaLee Salon Location",
    };
    attendance.isValidLocation.clockIn = true;
    attendance.status = "present";

    // Enhanced late check (assuming work starts at 9 AM)
    const workStartTime = new Date();
    workStartTime.setHours(9, 0, 0, 0);

    const isOnTime = currentTime <= workStartTime;

    // UPDATE LEADERBOARD - NEW INTEGRATION
    try {
      await LeaderboardService.updateAttendance(userId, 'clock-in', isOnTime);
    } catch (leaderboardError) {
      console.error('Error updating leaderboard:', leaderboardError);
      // Don't fail the request if leaderboard update fails
    }

    if (!isOnTime) {
      // Calculate minutes late
      const minutesLate = Math.floor((currentTime - workStartTime) / (1000 * 60));
      attendance.status = "late";
      
      await attendance.save();
      return res.json({
        success: true,
        message: "You're In! (Late)",
        details: `Time In: ${attendance.clockInTime.toLocaleTimeString()}\nLocation Verified: You're at the salon!\nNote: You are ${minutesLate} minutes late. This will be recorded.`,
        data: attendance,
        isLate: true,
        minutesLate: minutesLate,
      });
    }

    await attendance.save();
    res.json({
      success: true,
      message: "You're In!",
      details: `Time In: ${attendance.clockInTime.toLocaleTimeString()}\nLocation Verified: You're at the salon!`,
      data: attendance,
      isLate: false,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error clocking in",
      error: error.message,
    });
  }
});

// Clock out with location validation
router.post("/clock-out", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find today's attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance || !attendance.clockInTime) {
      return res.status(400).json({
        success: false,
        message: "No clock-in record found for today",
      });
    }

    if (attendance.clockOutTime) {
      return res.status(400).json({
        success: false,
        message: "Already clocked out today",
      });
    }

    const { latitude, longitude, address } = req.body;

    // Check location if coordinates provided
    let isValidLocation = true;
    if (latitude && longitude) {
      const locationCheck = Attendance.isWithinSalonRadius(
        latitude,
        longitude,
        14.5995,
        120.9842,
        5
      );
      isValidLocation = locationCheck.isWithin;
    }

    attendance.clockOutTime = new Date();
    if (latitude && longitude) {
      attendance.clockOutLocation = {
        latitude: latitude,
        longitude: longitude,
        address: address || "SandreaLee Salon Location",
      };
      attendance.isValidLocation.clockOut = isValidLocation;
    }

    // Calculate working hours
    attendance.calculateWorkingHours();

    await attendance.save();

    // Update leaderboard
    const leaderboardProfile = await Leaderboard.findOne({ userId });
    if (leaderboardProfile) {
      leaderboardProfile.attendanceScore += 15;
      leaderboardProfile.streaks.attendance.current += 1;
      if (
        leaderboardProfile.streaks.attendance.current >
        leaderboardProfile.streaks.attendance.longest
      ) {
        leaderboardProfile.streaks.attendance.longest =
          leaderboardProfile.streaks.attendance.current;
      }
      await leaderboardProfile.save();
    }

    const workingHours = Math.floor(attendance.workingHours / 60);
    const workingMinutes = attendance.workingHours % 60;
    const netWorkingHours = Math.floor(attendance.netWorkingHours / 60);
    const netWorkingMinutes = attendance.netWorkingHours % 60;

    res.json({
      success: true,
      message: "Successfully clocked out",
      details: `Time Out: ${attendance.clockOutTime.toLocaleTimeString()}\nTotal Hours: ${workingHours}h ${workingMinutes}m\nNet Hours (minus breaks): ${netWorkingHours}h ${netWorkingMinutes}m`,
      data: attendance,
      workingHours: `${workingHours}h ${workingMinutes}m`,
      netWorkingHours: `${netWorkingHours}h ${netWorkingMinutes}m`,
      totalMinutes: attendance.workingHours,
      netMinutes: attendance.netWorkingHours,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error clocking out",
      error: error.message,
    });
  }
});

// ADD BREAK ROUTES

// Start break
router.post("/break-start", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const { breakType = "lunch", latitude, longitude, address } = req.body;

    // Find today's attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let attendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance || !attendance.clockInTime) {
      return res.status(400).json({
        success: false,
        message: "You need to clock in first before taking a break",
      });
    }

    if (attendance.clockOutTime) {
      return res.status(400).json({
        success: false,
        message: "Cannot take break after clocking out",
      });
    }

    // Check if already on break
    const activeBreak = attendance.breaks.find(
      (breakItem) => !breakItem.breakEnd
    );
    if (activeBreak) {
      return res.status(400).json({
        success: false,
        message: "You are already on a break",
      });
    }

    // Validate location if provided
    let isValidLocation = true;
    let locationData = null;

    if (latitude && longitude) {
      const locationCheck = Attendance.isWithinSalonRadius(
        latitude,
        longitude,
        14.5995,
        120.9842,
        5
      );
      isValidLocation = locationCheck.isWithin;
      locationData = {
        latitude,
        longitude,
        address: address || "SandreaLee Salon Location",
      };
    }

    await attendance.startBreak(breakType, locationData);

    // Update break location validity if location was provided
    if (locationData) {
      const lastBreakIndex = attendance.breaks.length - 1;
      attendance.breaks[lastBreakIndex].isValidLocation = isValidLocation;
      await attendance.save();
    }

    res.json({
      success: true,
      message: "Break started successfully",
      data: {
        breakStart: attendance.breaks[attendance.breaks.length - 1].breakStart,
        breakType: breakType,
        isValidLocation: isValidLocation,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error starting break",
      error: error.message,
    });
  }
});

// End break
router.post("/break-end", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const { latitude, longitude, address } = req.body;

    // Find today's attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.status(400).json({
        success: false,
        message: "No attendance record found for today",
      });
    }

    // Check if there's an active break
    const activeBreak = attendance.breaks.find(
      (breakItem) => !breakItem.breakEnd
    );
    if (!activeBreak) {
      return res.status(400).json({
        success: false,
        message: "No active break found",
      });
    }

    // Validate location if provided
    let isValidLocation = true;
    let locationData = null;

    if (latitude && longitude) {
      const locationCheck = Attendance.isWithinSalonRadius(
        latitude,
        longitude,
        14.5995,
        120.9842,
        5
      );
      isValidLocation = locationCheck.isWithin;
      locationData = {
        latitude,
        longitude,
        address: address || "SandreaLee Salon Location",
      };
    }

    await attendance.endBreak(locationData);

    // Update break location validity if location was provided
    if (locationData) {
      const endedBreak = attendance.breaks.find(
        (breakItem) => breakItem.breakEnd && !breakItem.breakLocation?.latitude
      );
      if (endedBreak) {
        endedBreak.breakLocation = locationData;
        endedBreak.isValidLocation = isValidLocation;
        await attendance.save();
      }
    }

    const lastBreak = attendance.breaks[attendance.breaks.length - 1];

    res.json({
      success: true,
      message: "Break ended successfully",
      data: {
        breakDuration: lastBreak.breakDuration,
        totalBreakTime: attendance.totalBreakTime,
        netWorkingHours: attendance.netWorkingHours,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error ending break",
      error: error.message,
    });
  }
});

// Get break status
router.get("/break-status", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    if (!attendance) {
      return res.json({
        success: true,
        data: {
          onBreak: false,
          activeBreak: null,
          totalBreaksToday: 0,
          totalBreakTime: 0,
          breaks: [],
        },
      });
    }

    const activeBreak = attendance.breaks.find(
      (breakItem) => !breakItem.breakEnd
    );

    res.json({
      success: true,
      data: {
        onBreak: !!activeBreak,
        activeBreak: activeBreak,
        totalBreaksToday: attendance.breaks.length,
        totalBreakTime: attendance.totalBreakTime,
        breaks: attendance.breaks,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching break status",
      error: error.message,
    });
  }
});

// Get attendance history
router.get("/history", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 30, startDate, endDate } = req.query;

    const query = { userId: userId };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Attendance.countDocuments(query);

    res.json({
      success: true,
      data: attendance,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total: total,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance history",
      error: error.message,
    });
  }
});

// Get monthly attendance chart data
router.get("/monthly-chart", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const { year = new Date().getFullYear() } = req.query;

    const monthlyData = [];

    for (let month = 1; month <= 12; month++) {
      const data = await Attendance.getMonthlyAttendance(
        userId,
        Number.parseInt(year),
        month
      );
      monthlyData.push({
        month: new Date(year, month - 1).toLocaleString("default", {
          month: "short",
        }),
        attendancePercentage: data.attendancePercentage,
        present: data.present,
        late: data.late,
        absent: data.absent,
        workingDays: data.workingDays,
        totalBreakTime: data.totalBreakTime,
      });
    }

    res.json({
      success: true,
      data: monthlyData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching monthly chart data",
      error: error.message,
    });
  }
});

// Get monthly stats
router.get("/monthly-stats", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1,
    } = req.query;

    const monthlyData = await Attendance.getMonthlyAttendance(
      userId,
      Number.parseInt(year),
      Number.parseInt(month)
    );

    res.json({
      success: true,
      data: monthlyData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching monthly stats",
      error: error.message,
    });
  }
});

// Get current clock status
router.get("/status", authMiddleware, staffOnly, async (req, res) => {
  try {
    const userId = req.user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAttendance = await Attendance.findOne({
      userId: userId,
      date: { $gte: today, $lt: tomorrow },
    });

    let currentStatus = "not-started";
    if (todayAttendance) {
      if (todayAttendance.status === "on-break") {
        currentStatus = "on-break";
      } else if (todayAttendance.clockInTime && !todayAttendance.clockOutTime) {
        currentStatus = "clocked-in";
      } else if (todayAttendance.clockOutTime) {
        currentStatus = "clocked-out";
      }
    }

    res.json({
      success: true,
      data: {
        status: currentStatus,
        record: todayAttendance,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance status",
      error: error.message,
    });
  }
});

export default router;
