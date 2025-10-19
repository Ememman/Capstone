// routes/adminRoutes.js - Complete with WebSocket Real-time Updates
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js";
import Service from "../models/Service.js";
import Product from "../models/Product.js";
import Attendance from "../models/Attendance.js";
import { LearningModule } from "../models/LearningModules.js";
import {
  authenticateAdmin,
  adminOnly,
  staffOnly,
} from "../middleware/adminAuth.js";

const router = express.Router();

// Helper function to emit dashboard updates
const emitDashboardUpdate = (io, type, action, data) => {
  console.log("🔔 Attempting to emit dashboard update:", {
    ioExists: !!io,
    type,
    action,
    data,
  });

  if (!io) {
    console.error("❌ ERROR: io is undefined! Cannot emit dashboard update.");
    console.trace(); // Shows where this was called from
    return;
  }

  const updatePayload = {
    type,
    action,
    data,
    timestamp: new Date().toISOString(),
  };

  // Emit to admin dashboard room
  io.to("admin-dashboard").emit("dashboard-update", updatePayload);

  console.log("✅ Dashboard update emitted successfully:", {
    room: "admin-dashboard",
    type,
    action,
  });

  // Also log room info for debugging
  const rooms = Array.from(io.sockets.adapter.rooms.keys());
  console.log("📡 Active rooms:", rooms);

  const clientsInRoom = io.sockets.adapter.rooms.get("admin-dashboard");
  console.log(
    `👥 Clients in admin-dashboard room: ${
      clientsInRoom ? clientsInRoom.size : 0
    }`
  );
};

// ==================== AUTHENTICATION ROUTES ====================

// POST /api/admin/auth/register - Create admin account (super admin only)
router.post(
  "/auth/register",
  authenticateAdmin,
  adminOnly,
  async (req, res) => {
    try {
      const {
        username,
        firstName,
        email,
        phoneNumber,
        password,
        position = "Administrator",
      } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Username, email, and password are required",
        });
      }

      const existingUser = await User.findOne({
        $or: [
          { username },
          { email },
          { phoneNumber: phoneNumber || undefined },
        ],
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message:
            "User with this username, email, or phone number already exists",
        });
      }

      const adminCount = await User.countDocuments({ role: "admin" });
      const adminId = `ADMIN-${String(adminCount + 1).padStart(4, "0")}`;

      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const admin = new User({
        username,
        firstName: firstName || username,
        email,
        phoneNumber,
        password: hashedPassword,
        role: "admin",
        position,
        adminId,
        hireDate: new Date(),
        profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        registrationStep: "completed",
        verification: {
          phoneVerified: true,
          emailVerified: true,
        },
        isActive: true,
      });

      await admin.save();

      res.status(201).json({
        success: true,
        message: "Admin account created successfully",
        data: {
          id: admin._id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          adminId: admin.adminId,
          position: admin.position,
        },
      });
    } catch (error) {
      console.error("Admin registration error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating admin account",
        error: error.message,
      });
    }
  }
);

// POST /api/admin/auth/login - Admin login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email,
      role: { $in: ["admin", "salon_staff"] },
      isActive: true,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials or insufficient permissions",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          profileImage: user.profileImage,
          position: user.position,
          adminId: user.adminId,
          staffId: user.staffId,
        },
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
      error: error.message,
    });
  }
});

// POST /api/admin/auth/logout - Admin logout
router.post("/auth/logout", authenticateAdmin, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Admin logout error:", error);
    res.status(500).json({
      success: false,
      message: "Error during logout",
      error: error.message,
    });
  }
});

// GET /api/admin/auth/me - Get current admin profile
router.get("/auth/me", authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        profileImage: user.profileImage,
        position: user.position,
        adminId: user.adminId,
        staffId: user.staffId,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching profile",
      error: error.message,
    });
  }
});

// PUT /api/admin/auth/profile - Update admin profile
router.put("/auth/profile", authenticateAdmin, async (req, res) => {
  try {
    const { firstName, phoneNumber, profileImage } = req.body;

    const updates = {};
    if (firstName) updates.firstName = firstName;
    if (phoneNumber) updates.phoneNumber = phoneNumber;
    if (profileImage) updates.profileImage = profileImage;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Update admin profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
});

// POST /api/admin/auth/change-password - Change admin password
router.post("/auth/change-password", authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    const user = await User.findById(req.user._id);

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    user.password = hashedNewPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    });
  }
});

// ==================== DASHBOARD OVERVIEW ====================

// GET /api/admin/dashboard/overview - Main dashboard statistics
router.get(
  "/dashboard/overview",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const completedBookings = await Booking.find({
        status: "completed",
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      });
      const deliveredOrders = await Order.find({
        status: "delivered",
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      });

      const totalRevenue =
        completedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0) +
        deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      const lastMonthStart = new Date(startOfMonth);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
      const lastMonthEnd = new Date(startOfMonth);
      lastMonthEnd.setDate(0);

      const lastMonthBookings = await Booking.find({
        status: "completed",
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });
      const lastMonthOrders = await Order.find({
        status: "delivered",
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      });

      const lastMonthRevenue =
        lastMonthBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0) +
        lastMonthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      const revenueChange =
        lastMonthRevenue > 0
          ? (
              ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) *
              100
            ).toFixed(1)
          : totalRevenue > 0
          ? 100
          : 0;

      const appointmentsToday = await Booking.countDocuments({
        preferredDate: { $gte: today, $lt: tomorrow },
        status: { $in: ["pending", "confirmed", "in-progress"] },
      });

      const yesterdayStart = new Date(today);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const appointmentsYesterday = await Booking.countDocuments({
        preferredDate: { $gte: yesterdayStart, $lt: today },
        status: { $in: ["pending", "confirmed", "in-progress"] },
      });

      const appointmentChange =
        appointmentsYesterday > 0
          ? (
              ((appointmentsToday - appointmentsYesterday) /
                appointmentsYesterday) *
              100
            ).toFixed(1)
          : appointmentsToday > 0
          ? 100
          : 0;

      const activeEmployees = await Attendance.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        clockInTime: { $ne: null },
        clockOutTime: null,
      });

      const totalStaff = await User.countDocuments({
        role: "salon_staff",
        isActive: true,
      });

      const employeeChange =
        totalStaff > 0 ? ((activeEmployees / totalStaff) * 100).toFixed(0) : 0;

      const pendingPayments = await Payment.countDocuments({
        status: "pending",
      });

      const revenueTrend = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(
          today.getFullYear(),
          today.getMonth() - i,
          1
        );
        const monthEnd = new Date(
          today.getFullYear(),
          today.getMonth() - i + 1,
          0
        );

        const monthBookings = await Booking.find({
          status: "completed",
          createdAt: { $gte: monthStart, $lte: monthEnd },
        });
        const monthOrders = await Order.find({
          status: "delivered",
          createdAt: { $gte: monthStart, $lte: monthEnd },
        });

        const monthRevenue =
          monthBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0) +
          monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        revenueTrend.push({
          month: monthStart.toLocaleString("default", { month: "short" }),
          revenue: monthRevenue,
        });
      }

      const serviceStats = await Booking.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $lookup: {
            from: "services",
            localField: "service",
            foreignField: "_id",
            as: "serviceInfo",
          },
        },
        { $unwind: "$serviceInfo" },
        {
          $group: {
            _id: "$serviceInfo.category",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]);

      const totalServices = serviceStats.reduce((sum, s) => sum + s.count, 0);
      const serviceDistribution = serviceStats.map((s) => ({
        category: s._id,
        count: s.count,
        percentage:
          totalServices > 0 ? ((s.count / totalServices) * 100).toFixed(0) : 0,
      }));

      res.json({
        success: true,
        data: {
          totalRevenue: {
            amount: totalRevenue,
            change: parseFloat(revenueChange),
            trend: parseFloat(revenueChange) >= 0 ? "up" : "down",
          },
          appointmentsToday: {
            count: appointmentsToday,
            change: parseFloat(appointmentChange),
            trend: parseFloat(appointmentChange) >= 0 ? "up" : "down",
          },
          activeEmployees: {
            count: activeEmployees,
            total: totalStaff,
            percentage: parseInt(employeeChange),
          },
          pendingPayments: {
            count: pendingPayments,
          },
          revenueTrend,
          serviceDistribution,
        },
      });
    } catch (error) {
      console.error("Dashboard overview error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard overview",
        error: error.message,
      });
    }
  }
);

// ==================== EMPLOYEE MANAGEMENT ====================

// GET /api/admin/employees - Get all employees
router.get("/employees", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { search, status, sortBy = "name", page = 1, limit = 20 } = req.query;

    const query = { role: "salon_staff" };
    if (status) query.isActive = status === "active";
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const employees = await User.find(query)
      .select(
        "username firstName email phoneNumber position profileImage isActive hireDate createdAt"
      )
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const employeesWithMetrics = await Promise.all(
      employees.map(async (emp) => {
        const attendanceRecords = await Attendance.find({
          userId: emp._id,
          date: { $gte: thirtyDaysAgo },
        });

        const presentDays = attendanceRecords.filter(
          (a) => a.status === "present" || a.status === "late"
        ).length;
        const totalDays = attendanceRecords.length;
        const attendanceRate =
          totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

        const completedBookings = await Booking.countDocuments({
          selectedStylist: emp._id,
          status: "completed",
        });

        return {
          ...emp,
          performance: attendanceRate,
          completedBookings,
          schedule: "Full-time",
        };
      })
    );

    let sorted = employeesWithMetrics;
    if (sortBy === "performance") {
      sorted = sorted.sort((a, b) => b.performance - a.performance);
    } else if (sortBy === "name") {
      sorted = sorted.sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );
    } else if (sortBy === "bookings") {
      sorted = sorted.sort((a, b) => b.completedBookings - a.completedBookings);
    }

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      count: sorted.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: sorted,
    });
  } catch (error) {
    console.error("Get employees error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employees",
      error: error.message,
    });
  }
});

// GET /api/admin/employees/:id - Get single employee
router.get("/employees/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select("-password");

    if (!employee || employee.role !== "salon_staff") {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const attendanceRecords = await Attendance.find({
      userId: employee._id,
      date: { $gte: thirtyDaysAgo },
    });

    const attendanceStats = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter((a) => a.status === "present").length,
      late: attendanceRecords.filter((a) => a.status === "late").length,
      absent: attendanceRecords.filter((a) => a.status === "absent").length,
    };

    const bookingStats = await Booking.aggregate([
      { $match: { selectedStylist: employee._id } },
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
        ...employee.toObject(),
        attendanceStats,
        bookingStats,
      },
    });
  } catch (error) {
    console.error("Get employee error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching employee",
      error: error.message,
    });
  }
});

// POST /api/admin/employees - Add new employee
router.post("/employees", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const {
      username,
      firstName,
      email,
      phoneNumber,
      password,
      position,
      hireDate,
    } = req.body;

    if (!username || !phoneNumber || !password || !position) {
      return res.status(400).json({
        success: false,
        message: "Username, phone number, password, and position are required",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email: email || undefined }, { phoneNumber }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "User with this username, email, or phone number already exists",
      });
    }

    const staffCount = await User.countDocuments({ role: "salon_staff" });
    const staffId = `STAFF-${String(staffCount + 1).padStart(4, "0")}`;

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const employee = new User({
      username,
      firstName: firstName || username,
      email: email || `${username}@sandrealize.com`,
      phoneNumber,
      password: hashedPassword,
      role: "salon_staff",
      position,
      staffId,
      hireDate: hireDate || new Date(),
      profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      registrationStep: "completed",
      verification: {
        phoneVerified: true,
        emailVerified: true,
      },
      isActive: true,
    });

    await employee.save();

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "employee-added", "created", {
      id: employee._id,
      username: employee.username,
      position: employee.position,
      staffId: employee.staffId,
    });

    res.status(201).json({
      success: true,
      message: "Employee added successfully",
      data: {
        _id: employee._id,
        username: employee.username,
        firstName: employee.firstName,
        email: employee.email,
        phoneNumber: employee.phoneNumber,
        position: employee.position,
        staffId: employee.staffId,
        profileImage: employee.profileImage,
        isActive: employee.isActive,
        performance: 0,
      },
    });
  } catch (error) {
    console.error("Add employee error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding employee",
      error: error.message,
    });
  }
});

// PUT /api/admin/employees/:id - Update employee
router.put("/employees/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    delete updates.role;
    delete updates.staffId;

    if (updates.password) {
      const saltRounds = 12;
      updates.password = await bcrypt.hash(updates.password, saltRounds);
    }

    const employee = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "employee-updated", "updated", {
      id: employee._id,
      username: employee.username,
      isActive: employee.isActive,
    });

    res.json({
      success: true,
      message: "Employee updated successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Update employee error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating employee",
      error: error.message,
    });
  }
});

// DELETE /api/admin/employees/:id - Delete employee
router.delete(
  "/employees/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const { id } = req.params;

      const employee = await User.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
      );

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // ✅ EMIT REAL-TIME UPDATE
      emitDashboardUpdate(req.io, "employee-deleted", "deactivated", {
        id: employee._id,
        username: employee.username,
      });

      res.json({
        success: true,
        message: "Employee deactivated successfully",
      });
    } catch (error) {
      console.error("Delete employee error:", error);
      res.status(500).json({
        success: false,
        message: "Error deactivating employee",
        error: error.message,
      });
    }
  }
);

// ==================== CUSTOMER MANAGEMENT ====================

// GET /api/admin/customers - Get all customers
router.get("/customers", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { search, page = 1, limit = 20, sortBy = "createdAt" } = req.query;

    const query = { role: "customer", isGuest: false };
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const customers = await User.find(query)
      .select("username email phoneNumber profileImage createdAt")
      .sort({ [sortBy]: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const bookingCount = await Booking.countDocuments({
          customer: customer._id,
        });
        const orderCount = await Order.countDocuments({
          customer: customer._id,
        });

        return {
          ...customer,
          bookingCount,
          orderCount,
          totalTransactions: bookingCount + orderCount,
        };
      })
    );

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      count: customersWithStats.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: customersWithStats,
    });
  } catch (error) {
    console.error("Get customers error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
});

// GET /api/admin/customers/:id - Get customer details
router.get("/customers/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const customer = await User.findById(req.params.id).select("-password");

    if (!customer || customer.role !== "customer") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const bookings = await Booking.find({ customer: customer._id })
      .populate("service", "name category")
      .sort({ createdAt: -1 })
      .limit(10);

    const orders = await Order.find({ customer: customer._id })
      .populate("items.product", "name")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        ...customer.toObject(),
        recentBookings: bookings,
        recentOrders: orders,
      },
    });
  } catch (error) {
    console.error("Get customer error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customer",
      error: error.message,
    });
  }
});

// ==================== BOOKING MANAGEMENT ====================

// GET /api/admin/bookings - Get all bookings
router.get("/bookings", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (startDate && endDate) {
      query.preferredDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate("customer", "username email phoneNumber")
      .populate("service", "name category")
      .populate("selectedStylist", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      count: bookings.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: bookings,
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching bookings",
      error: error.message,
    });
  }
});

// GET /api/admin/bookings/:id - Get single booking
router.get("/bookings/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("customer", "username email phoneNumber")
      .populate("service", "name category price")
      .populate("selectedStylist", "username");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching booking",
      error: error.message,
    });
  }
});

// POST /api/admin/bookings - Create new booking
router.post("/bookings", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const {
      customer,
      service,
      preferredDate,
      preferredTime,
      selectedStylist,
      status = "pending",
      notes,
    } = req.body;

    if (!customer || !service || !preferredDate || !preferredTime) {
      return res.status(400).json({
        success: false,
        message: "Customer, service, date, and time are required",
      });
    }

    let customerId;
    const existingCustomer = await User.findOne({
      username: customer,
      role: "customer",
    });

    if (existingCustomer) {
      customerId = existingCustomer._id;
    } else {
      const newCustomer = new User({
        username: customer,
        email: `${customer}@guest.com`,
        phoneNumber: "0000000000",
        role: "customer",
        isGuest: true,
        registrationStep: "completed",
      });
      await newCustomer.save();
      customerId = newCustomer._id;
    }

    const serviceDoc = await Service.findOne({ name: service });
    if (!serviceDoc) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    let stylistId = null;
    if (selectedStylist) {
      const stylist = await User.findOne({
        username: selectedStylist,
        role: "salon_staff",
      });
      if (stylist) {
        stylistId = stylist._id;
      }
    }

    const booking = new Booking({
      customer: customerId,
      service: serviceDoc._id,
      preferredDate: new Date(preferredDate),
      preferredTime,
      selectedStylist: stylistId,
      status,
      notes,
      totalAmount: serviceDoc.price,
    });

    await booking.save();

    const populatedBooking = await Booking.findById(booking._id)
      .populate("customer", "username email")
      .populate("service", "name category")
      .populate("selectedStylist", "username");

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "new-booking", "created", {
      id: populatedBooking._id,
      customer: populatedBooking.customer?.username,
      service: populatedBooking.service?.name,
      date: populatedBooking.preferredDate,
      time: populatedBooking.preferredTime,
    });

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: populatedBooking,
    });
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating booking",
      error: error.message,
    });
  }
});

// PUT /api/admin/bookings/:id - Update booking
router.put("/bookings/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { status, adminNotes, preferredDate, preferredTime } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes) updateData.adminNotes = adminNotes;
    if (preferredDate) updateData.preferredDate = new Date(preferredDate);
    if (preferredTime) updateData.preferredTime = preferredTime;

    const booking = await Booking.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    })
      .populate("customer", "username email")
      .populate("service", "name")
      .populate("selectedStylist", "username");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "booking-updated", "status-changed", {
      id: booking._id,
      status: booking.status,
      customer: booking.customer?.username,
      service: booking.service?.name,
    });

    res.json({
      success: true,
      message: "Booking updated successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Update booking error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating booking",
      error: error.message,
    });
  }
});

// DELETE /api/admin/bookings/:id - Delete booking
router.delete(
  "/bookings/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const booking = await Booking.findByIdAndDelete(req.params.id);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      // ✅ EMIT REAL-TIME UPDATE
      emitDashboardUpdate(req.io, "booking-deleted", "deleted", {
        id: req.params.id,
      });

      res.json({
        success: true,
        message: "Booking deleted successfully",
      });
    } catch (error) {
      console.error("Delete booking error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting booking",
        error: error.message,
      });
    }
  }
);

// ==================== INVENTORY MANAGEMENT ====================

// GET /api/admin/inventory - Get all inventory
router.get("/inventory", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const {
      search,
      status,
      category,
      sortBy = "name",
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (category) {
      query.category = category;
    }
    if (status === "in-stock") {
      query.inStock = true;
    } else if (status === "out-of-stock") {
      query.inStock = false;
    }

    let sort = {};
    if (sortBy === "price-low") sort = { price: 1 };
    else if (sortBy === "price-high") sort = { price: -1 };
    else sort = { name: 1 };

    const skip = (page - 1) * limit;

    const products = await Product.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      count: products.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: products.map((p) => ({
        _id: p._id,
        name: p.name,
        category: p.category,
        price: p.price,
        status: p.inStock ? "In Stock" : "Out of Stock",
        inStock: p.inStock,
        image: p.image,
        description: p.description,
      })),
    });
  } catch (error) {
    console.error("Get inventory error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching inventory",
      error: error.message,
    });
  }
});

// GET /api/admin/inventory/:id - Get single product
router.get("/inventory/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product",
      error: error.message,
    });
  }
});

// POST /api/admin/inventory - Add new product
router.post("/inventory", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "inventory-added", "created", {
      id: product._id,
      name: product.name,
      category: product.category,
      price: product.price,
      inStock: product.inStock,
    });

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: product,
    });
  } catch (error) {
    console.error("Add product error:", error);
    res.status(400).json({
      success: false,
      message: "Error adding product",
      error: error.message,
    });
  }
});

// PUT /api/admin/inventory/:id - Update product
router.put("/inventory/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "inventory-updated", "updated", {
      id: product._id,
      name: product.name,
      inStock: product.inStock,
    });

    // ✅ LOW STOCK ALERT
    if (product.stock && product.stock < 10 && req.io) {
      req.io.to("admin-dashboard").emit("inventory-alert", {
        type: "low-stock",
        message: `⚠️ ${product.name} is running low on stock!`,
        data: {
          id: product._id,
          name: product.name,
          stock: product.stock,
        },
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(400).json({
      success: false,
      message: "Error updating product",
      error: error.message,
    });
  }
});

// DELETE /api/admin/inventory/:id - Delete product
router.delete(
  "/inventory/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const product = await Product.findByIdAndDelete(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // ✅ EMIT REAL-TIME UPDATE
      emitDashboardUpdate(req.io, "inventory-deleted", "deleted", {
        id: req.params.id,
        name: product.name,
      });

      res.json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting product",
        error: error.message,
      });
    }
  }
);

// ==================== PAYMENT MANAGEMENT ====================

// GET /api/admin/payments - Get all payments
router.get("/payments", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const payments = await Payment.find(query)
      .populate("customer", "username email")
      .populate("booking")
      .populate("order")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      count: payments.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: payments,
    });
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
});

// GET /api/admin/payments/:id - Get single payment
router.get("/payments/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("customer", "username email phoneNumber")
      .populate("booking")
      .populate("order");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("Get payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment",
      error: error.message,
    });
  }
});

// PUT /api/admin/payments/:id - Update payment status
router.put("/payments/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      {
        status,
        verifiedBy: req.user._id,
        verifiedAt: new Date(),
        adminNotes: notes,
      },
      { new: true }
    )
      .populate("customer", "username email")
      .populate("booking")
      .populate("order");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (status === "completed") {
      if (payment.booking) {
        await Booking.findByIdAndUpdate(payment.booking._id, {
          paymentStatus: "paid",
        });
      }
      if (payment.order) {
        await Order.findByIdAndUpdate(payment.order._id, {
          paymentStatus: "paid",
        });
      }
    }

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(
      req.io,
      "payment-updated",
      status === "completed" ? "approved" : "updated",
      {
        id: payment._id,
        status: payment.status,
        amount: payment.amount,
        customer: payment.customer?.username,
      }
    );

    res.json({
      success: true,
      message: `Payment ${
        status === "completed" ? "approved" : "updated"
      } successfully`,
      data: payment,
    });
  } catch (error) {
    console.error("Update payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment",
      error: error.message,
    });
  }
});

// POST /api/admin/payments - Create manual payment
router.post("/payments", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const payment = new Payment(req.body);
    await payment.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate("customer", "username email")
      .populate("booking")
      .populate("order");

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "payment-created", "created", {
      id: populatedPayment._id,
      amount: populatedPayment.amount,
      customer: populatedPayment.customer?.username,
    });

    res.status(201).json({
      success: true,
      message: "Payment record created successfully",
      data: populatedPayment,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment",
      error: error.message,
    });
  }
});

// DELETE /api/admin/payments/:id - Delete payment
router.delete(
  "/payments/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const payment = await Payment.findByIdAndDelete(req.params.id);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      // ✅ EMIT REAL-TIME UPDATE
      emitDashboardUpdate(req.io, "payment-deleted", "deleted", {
        id: req.params.id,
      });

      res.json({
        success: true,
        message: "Payment deleted successfully",
      });
    } catch (error) {
      console.error("Delete payment error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting payment",
        error: error.message,
      });
    }
  }
);

// ==================== ORDERS MANAGEMENT ====================

// GET /api/admin/orders - Get all orders
router.get("/orders", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const orders = await Order.find(query)
      .populate("customer", "username email phoneNumber")
      .populate("items.product", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
});

// GET /api/admin/orders/:id - Get single order
router.get("/orders/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "username email phoneNumber")
      .populate("items.product", "name price image");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order",
      error: error.message,
    });
  }
});

// PUT /api/admin/orders/:id - Update order status
router.put("/orders/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { status, notes, trackingNumber, courier } = req.body;

    const order = await Order.findById(req.params.id).populate(
      "customer",
      "username"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.updateStatus(status, notes);

    if (status === "shipped" && trackingNumber) {
      order.tracking.shipped.trackingNumber = trackingNumber;
      order.tracking.shipped.courier = courier;
    }

    if (notes) {
      order.adminNotes = notes;
    }

    await order.save();

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "order-updated", "status-changed", {
      id: order._id,
      status: order.status,
      customer: order.customer?.username,
    });

    res.json({
      success: true,
      message: "Order updated successfully",
      data: order,
    });
  } catch (error) {
    console.error("Update order error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order",
      error: error.message,
    });
  }
});

// POST /api/admin/orders - Create manual order
router.post("/orders", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("customer", "username email")
      .populate("items.product", "name price");

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "order-created", "created", {
      id: populatedOrder._id,
      customer: populatedOrder.customer?.username,
      totalAmount: populatedOrder.totalAmount,
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: populatedOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating order",
      error: error.message,
    });
  }
});

// DELETE /api/admin/orders/:id - Delete order
router.delete("/orders/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          "Only pending orders can be deleted. Use cancel for other statuses.",
      });
    }

    await Order.findByIdAndDelete(req.params.id);

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "order-deleted", "deleted", {
      id: req.params.id,
    });

    res.json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Delete order error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting order",
      error: error.message,
    });
  }
});

// ==================== TRAINING/LEARNING MODULES ====================

// GET /api/admin/training - Get all training modules
router.get("/training", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { category, status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const modules = await LearningModule.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await LearningModule.countDocuments(query);

    res.json({
      success: true,
      count: modules.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: modules,
    });
  } catch (error) {
    console.error("Get training modules error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching training modules",
      error: error.message,
    });
  }
});

// GET /api/admin/training/:id - Get single training module
router.get("/training/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const module = await LearningModule.findById(req.params.id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Training module not found",
      });
    }

    res.json({
      success: true,
      data: module,
    });
  } catch (error) {
    console.error("Get training module error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching training module",
      error: error.message,
    });
  }
});

// POST /api/admin/training - Create new training module
router.post("/training", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const module = new LearningModule({
      ...req.body,
      createdBy: req.user._id,
    });

    await module.save();

    res.status(201).json({
      success: true,
      message: "Training module created successfully",
      data: module,
    });
  } catch (error) {
    console.error("Create training module error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating training module",
      error: error.message,
    });
  }
});

// PUT /api/admin/training/:id - Update training module
router.put("/training/:id", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const module = await LearningModule.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Training module not found",
      });
    }

    res.json({
      success: true,
      message: "Training module updated successfully",
      data: module,
    });
  } catch (error) {
    console.error("Update training module error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating training module",
      error: error.message,
    });
  }
});

// DELETE /api/admin/training/:id - Delete training module
router.delete(
  "/training/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const module = await LearningModule.findByIdAndDelete(req.params.id);

      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Training module not found",
        });
      }

      res.json({
        success: true,
        message: "Training module deleted successfully",
      });
    } catch (error) {
      console.error("Delete training module error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting training module",
        error: error.message,
      });
    }
  }
);

// ==================== ANALYTICS ====================

// GET /api/admin/analytics/revenue - Revenue analytics
router.get(
  "/analytics/revenue",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const { year = new Date().getFullYear() } = req.query;

      const monthlyData = [];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const bookings = await Booking.find({
          status: "completed",
          createdAt: { $gte: startDate, $lte: endDate },
        });

        const orders = await Order.find({
          status: "delivered",
          createdAt: { $gte: startDate, $lte: endDate },
        });

        const revenue =
          bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0) +
          orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        const transactions = bookings.length + orders.length;

        monthlyData.push({
          month: new Date(year, month).toLocaleString("default", {
            month: "short",
          }),
          revenue,
          transactions,
        });
      }

      res.json({
        success: true,
        data: monthlyData,
      });
    } catch (error) {
      console.error("Analytics revenue error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching revenue analytics",
        error: error.message,
      });
    }
  }
);

// GET /api/admin/analytics/services - Service analytics
router.get(
  "/analytics/services",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const query = { status: "completed" };
      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const serviceStats = await Booking.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "services",
            localField: "service",
            foreignField: "_id",
            as: "serviceInfo",
          },
        },
        { $unwind: "$serviceInfo" },
        {
          $group: {
            _id: "$serviceInfo.name",
            count: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
            category: { $first: "$serviceInfo.category" },
          },
        },
        { $sort: { count: -1 } },
      ]);

      res.json({
        success: true,
        data: serviceStats,
      });
    } catch (error) {
      console.error("Analytics services error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching service analytics",
        error: error.message,
      });
    }
  }
);

// GET /api/admin/analytics/employees - Employee analytics
router.get(
  "/analytics/employees",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const query = { status: "completed" };
      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const employeeStats = await Booking.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "users",
            localField: "selectedStylist",
            foreignField: "_id",
            as: "stylistInfo",
          },
        },
        { $unwind: "$stylistInfo" },
        {
          $group: {
            _id: "$stylistInfo._id",
            name: { $first: "$stylistInfo.username" },
            bookingsCompleted: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
          },
        },
        { $sort: { bookingsCompleted: -1 } },
      ]);

      res.json({
        success: true,
        data: employeeStats,
      });
    } catch (error) {
      console.error("Analytics employees error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching employee analytics",
        error: error.message,
      });
    }
  }
);

// ==================== SETTINGS ====================

// GET /api/admin/settings - Get settings
router.get("/settings", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const settings = {
      business: {
        name: "SandreaLee Salon",
        address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
        phone: "+63 123 456 7890",
        email: "info@sandrealize.com",
        openingHours: {
          monday: "9:00 AM - 8:00 PM",
          tuesday: "9:00 AM - 8:00 PM",
          wednesday: "9:00 AM - 8:00 PM",
          thursday: "9:00 AM - 8:00 PM",
          friday: "9:00 AM - 8:00 PM",
          saturday: "8:00 AM - 9:00 PM",
          sunday: "8:00 AM - 7:00 PM",
        },
      },
      booking: {
        allowGuestBooking: false,
        requirePaymentUpfront: false,
        cancellationWindowHours: 24,
        maxAdvanceBookingDays: 30,
      },
      payment: {
        acceptedMethods: ["gcash", "paymaya", "cash", "bank_transfer"],
        requireProofOfPayment: true,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        sendBookingReminders: true,
        reminderHoursBefore: 24,
      },
    };

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching settings",
      error: error.message,
    });
  }
});

// PUT /api/admin/settings - Update settings
router.put("/settings", authenticateAdmin, adminOnly, async (req, res) => {
  try {
    const settings = req.body;

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating settings",
      error: error.message,
    });
  }
});

// ==================== REPORTS ====================

// GET /api/admin/reports/sales - Sales report
router.get("/reports/sales", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = "day" } = req.query;

    const query = {
      status: "completed",
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };

    const bookings = await Booking.find(query);
    const orders = await Order.find({
      ...query,
      status: "delivered",
    });

    const totalSales =
      bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0) +
      orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const totalTransactions = bookings.length + orders.length;

    res.json({
      success: true,
      data: {
        totalSales,
        totalTransactions,
        bookingRevenue: bookings.reduce(
          (sum, b) => sum + (b.totalAmount || 0),
          0
        ),
        orderRevenue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
        bookingCount: bookings.length,
        orderCount: orders.length,
      },
    });
  } catch (error) {
    console.error("Sales report error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating sales report",
      error: error.message,
    });
  }
});

// GET /api/admin/reports/services - Services report
router.get(
  "/reports/services",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const query = {
        status: "completed",
      };

      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const serviceReport = await Booking.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "services",
            localField: "service",
            foreignField: "_id",
            as: "serviceInfo",
          },
        },
        { $unwind: "$serviceInfo" },
        {
          $group: {
            _id: "$serviceInfo._id",
            name: { $first: "$serviceInfo.name" },
            category: { $first: "$serviceInfo.category" },
            bookings: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      res.json({
        success: true,
        data: serviceReport,
      });
    } catch (error) {
      console.error("Services report error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating services report",
        error: error.message,
      });
    }
  }
);

// GET /api/admin/reports/attendance - Attendance report
router.get(
  "/reports/attendance",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const { startDate, endDate, employeeId } = req.query;

      const query = {};

      if (startDate && endDate) {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      if (employeeId) {
        query.userId = employeeId;
      }

      const attendanceRecords = await Attendance.find(query)
        .populate("userId", "username firstName")
        .sort({ date: -1 });

      const summary = {
        totalRecords: attendanceRecords.length,
        present: attendanceRecords.filter((a) => a.status === "present").length,
        late: attendanceRecords.filter((a) => a.status === "late").length,
        absent: attendanceRecords.filter((a) => a.status === "absent").length,
      };

      res.json({
        success: true,
        data: {
          summary,
          records: attendanceRecords,
        },
      });
    } catch (error) {
      console.error("Attendance report error:", error);
      res.status(500).json({
        success: false,
        message: "Error generating attendance report",
        error: error.message,
      });
    }
  }
);

// ==================== STATISTICS ====================

// GET /api/admin/statistics - General statistics
router.get("/statistics", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: "customer" });
    const totalEmployees = await User.countDocuments({ role: "salon_staff" });
    const totalBookings = await Booking.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalServices = await Service.countDocuments();

    const pendingBookings = await Booking.countDocuments({ status: "pending" });
    const pendingOrders = await Order.countDocuments({ status: "pending" });
    const pendingPayments = await Payment.countDocuments({ status: "pending" });

    const completedBookings = await Booking.find({ status: "completed" });
    const deliveredOrders = await Order.find({ status: "delivered" });

    const totalRevenue =
      completedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0) +
      deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    res.json({
      success: true,
      data: {
        customers: totalCustomers,
        employees: totalEmployees,
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          completed: completedBookings.length,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          delivered: deliveredOrders.length,
        },
        inventory: {
          products: totalProducts,
          services: totalServices,
        },
        payments: {
          pending: pendingPayments,
        },
        revenue: {
          total: totalRevenue,
          bookings: completedBookings.reduce(
            (sum, b) => sum + (b.totalAmount || 0),
            0
          ),
          orders: deliveredOrders.reduce(
            (sum, o) => sum + (o.totalAmount || 0),
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("Get statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
      error: error.message,
    });
  }
});

// ==================== ATTENDANCE MANAGEMENT ====================

// GET /api/admin/attendance - Get attendance records
router.get("/attendance", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const {
      employeeId,
      startDate,
      endDate,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};
    if (employeeId) query.userId = employeeId;
    if (status) query.status = status;
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const records = await Attendance.find(query)
      .populate("userId", "username firstName profileImage")
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Attendance.countDocuments(query);

    res.json({
      success: true,
      count: records.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: records,
    });
  } catch (error) {
    console.error("Get attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance records",
      error: error.message,
    });
  }
});

// POST /api/admin/attendance - Create attendance record
router.post("/attendance", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const attendance = new Attendance(req.body);
    await attendance.save();

    const populatedAttendance = await Attendance.findById(
      attendance._id
    ).populate("userId", "username firstName");

    // ✅ EMIT REAL-TIME UPDATE
    emitDashboardUpdate(req.io, "attendance-created", "created", {
      userId: populatedAttendance.userId?._id,
      username: populatedAttendance.userId?.username,
      date: populatedAttendance.date,
      status: populatedAttendance.status,
    });

    res.status(201).json({
      success: true,
      message: "Attendance record created successfully",
      data: populatedAttendance,
    });
  } catch (error) {
    console.error("Create attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating attendance record",
      error: error.message,
    });
  }
});

// PUT /api/admin/attendance/:id - Update attendance record
router.put(
  "/attendance/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const attendance = await Attendance.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate("userId", "username firstName");

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: "Attendance record not found",
        });
      }

      res.json({
        success: true,
        message: "Attendance record updated successfully",
        data: attendance,
      });
    } catch (error) {
      console.error("Update attendance error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating attendance record",
        error: error.message,
      });
    }
  }
);

// DELETE /api/admin/attendance/:id - Delete attendance record
router.delete(
  "/attendance/:id",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const attendance = await Attendance.findByIdAndDelete(req.params.id);

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: "Attendance record not found",
        });
      }

      res.json({
        success: true,
        message: "Attendance record deleted successfully",
      });
    } catch (error) {
      console.error("Delete attendance error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting attendance record",
        error: error.message,
      });
    }
  }
);

export default router;
