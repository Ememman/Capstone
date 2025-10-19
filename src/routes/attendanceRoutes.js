import express from "express";
import Attendance from "../models/Attendance.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Get attendance dashboard data
router.get("/dashboard/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
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

    res.json({
      success: true,
      data: {
        monthly: monthlyData,
        recent: recentAttendance,
        today: todayAttendance,
        currentStatus: todayAttendance
          ? todayAttendance.clockInTime && !todayAttendance.clockOutTime
            ? "clocked-in"
            : todayAttendance.clockOutTime
            ? "clocked-out"
            : "not-started"
          : "not-started",
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

// Clock in
router.post("/clock-in", authMiddleware, async (req, res) => {
  try {
    const { userId, latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Location coordinates are required",
      });
    }

    // Check if user is within salon radius
    const locationCheck = Attendance.isWithinSalonRadius(latitude, longitude);

    if (!locationCheck.isWithin) {
      return res.status(400).json({
        success: false,
        message: "Clock-In Failed!",
        details: `Oops! You're not in the salon yet. Distance: ${locationCheck.distanceMeters}m away from Sandradee Salon. Manager Alert: Your late clock-in will be logged. Better hurry—your next client waits!`,
        distance: locationCheck.distanceMeters,
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

    attendance.clockInTime = new Date();
    attendance.clockInLocation = {
      latitude: latitude,
      longitude: longitude,
      address: address || "Salon Location",
    };
    attendance.isValidLocation.clockIn = true;
    attendance.status = "present";

    // Check if late (assuming work starts at 9 AM)
    const workStartTime = new Date();
    workStartTime.setHours(9, 0, 0, 0);
    if (attendance.clockInTime > workStartTime) {
      attendance.status = "late";
    }

    await attendance.save();

    res.json({
      success: true,
      message: "You're In!",
      details: `Time In: ${attendance.clockInTime.toLocaleTimeString()}\nLocation Verified: You're at the salon!`,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error clocking in",
      error: error.message,
    });
  }
});

// Clock out
router.post("/clock-out", authMiddleware, async (req, res) => {
  try {
    const { userId, latitude, longitude, address } = req.body;

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

    // Check location if coordinates provided
    let isValidLocation = true;
    if (latitude && longitude) {
      const locationCheck = Attendance.isWithinSalonRadius(latitude, longitude);
      isValidLocation = locationCheck.isWithin;
    }

    attendance.clockOutTime = new Date();
    if (latitude && longitude) {
      attendance.clockOutLocation = {
        latitude: latitude,
        longitude: longitude,
        address: address || "Salon Location",
      };
      attendance.isValidLocation.clockOut = isValidLocation;
    }

    // Calculate working hours
    attendance.calculateWorkingHours();

    await attendance.save();

    res.json({
      success: true,
      message: "Successfully clocked out",
      data: attendance,
      workingHours: `${Math.floor(attendance.workingHours / 60)}h ${
        attendance.workingHours % 60
      }m`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error clocking out",
      error: error.message,
    });
  }
});

// Get attendance history
router.get("/history/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
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
      .skip((page - 1) * limit)
      .populate("userId", "username profileImage");

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
router.get("/monthly-chart/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
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
        absent: data.absent,
        workingDays: data.workingDays,
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

export default router;
