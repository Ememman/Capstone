// appointmentRoutes.js - COMPLETE UPDATED WITH ACTIVITY TRACKING
import express from "express";
import Appointment from "../models/Appointment.js";
import mongoose from "mongoose";
import {
  optionalAuth,
  authMiddleware,
  customerOnly,
  staffOnly,
} from "../middleware/auth.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

// @desc    Get all appointments
// @route   GET /api/appointments
// @access  Public (with optional auth for staff view)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const {
      status,
      customer,
      service,
      date,
      page = 1,
      limit = 10,
      view = "customer",
    } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (customer) filter.customer = customer;
    if (service) filter.service = service;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.appointmentDate = { $gte: startDate, $lt: endDate };
    }

    const skip = (page - 1) * limit;

    let populateFields = "username email";
    if (view === "staff" && req.user && req.user.role === "salon_staff") {
      populateFields = "username email phoneNumber profileImage";
    }

    const appointments = await Appointment.find(filter)
      .populate("customer", populateFields)
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position") // Added assigned staff population
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .skip(skip)
      .limit(Number.parseInt(limit));

    const total = await Appointment.countDocuments(filter);

    res.json({
      success: true,
      message: "Appointments retrieved successfully",
      data: appointments,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
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
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Get appointment by ID
// @route   GET /api/appointments/:id
// @access  Public (with optional auth for staff view)
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { view = "customer" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    let populateFields = "username email";
    if (view === "staff" && req.user && req.user.role === "salon_staff") {
      populateFields = "username email phoneNumber profileImage";
    }

    const appointment = await Appointment.findById(id)
      .populate("customer", populateFields)
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position") // Added assigned staff population
      .populate("completedBy", "username profileImage position"); // Added completedBy population

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    res.json({
      success: true,
      message: "Appointment retrieved successfully",
      data: appointment,
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
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Get appointments by customer
// @route   GET /api/appointments/customer/:customerId
// @access  Private (customers can only see their own, staff can see all)
router.get("/customer/:customerId", authMiddleware, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status, view = "customer" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    if (
      req.user.role === "customer" &&
      req.user._id.toString() !== customerId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own appointments.",
      });
    }

    const filter = { customer: customerId };
    if (status) filter.status = status;

    let populateFields = "username email";
    if (view === "staff" && req.user.role === "salon_staff") {
      populateFields = "username email phoneNumber profileImage";
    }

    const appointments = await Appointment.find(filter)
      .populate("customer", populateFields)
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position") // Added assigned staff population
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    res.json({
      success: true,
      message: "Customer appointments retrieved successfully",
      data: appointments,
      count: appointments.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Create new appointment
// @route   POST /api/appointments
// @access  Private (customers only)
router.post("/", authMiddleware, customerOnly, async (req, res) => {
  try {
    const {
      service,
      appointmentDate,
      appointmentTime,
      notes,
      salonLocation,
      totalAmount,
      assignedStaff, // Allow customer to choose staff if needed
    } = req.body;

    const customer = req.user._id;

    // Validate required fields
    if (!service || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: "Service, appointment date, and time are required",
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(service)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
    }

    if (assignedStaff && !mongoose.Types.ObjectId.isValid(assignedStaff)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    // Check for conflicting appointments
    const existingAppointment = await Appointment.findOne({
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      status: { $in: ["upcoming", "completed"] },
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: "Time slot is already booked",
      });
    }

    const appointment = new Appointment({
      customer,
      service,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      notes,
      salonLocation,
      totalAmount,
      assignedStaff,
    });

    const savedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      savedAppointment._id
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    // Track appointment scheduling activity
    await notificationService.trackUserActivity(
      customer,
      "appointment_scheduled",
      {
        appointmentId: savedAppointment._id,
        serviceId: service,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        assignedStaff: assignedStaff,
      }
    );

    res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      data: populatedAppointment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Update appointment
// @route   PUT /api/appointments/:id
// @access  Private (customers can update their own, staff can update all)
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      req.user.role === "customer" &&
      appointment.customer.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own appointments.",
      });
    }

    // Update appointment
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      { ...req.body },
      { new: true, runValidators: true }
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    // Track appointment update activity
    await notificationService.trackUserActivity(
      appointment.customer,
      "appointment_updated",
      {
        appointmentId: appointment._id,
        updatedFields: Object.keys(req.body),
      }
    );

    res.json({
      success: true,
      message: "Appointment updated successfully",
      data: updatedAppointment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Cancel appointment
// @route   PUT /api/appointments/:id/cancel
// @access  Private (customers can cancel their own, staff can cancel all)
router.put("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      req.user.role === "customer" &&
      appointment.customer.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only cancel your own appointments.",
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Appointment is already cancelled",
      });
    }

    appointment.status = "cancelled";
    if (cancellationReason) {
      appointment.cancellationReason = cancellationReason;
    }

    // Set cancelled by based on user role
    appointment.cancelledBy =
      req.user.role === "customer" ? "customer" : "staff";

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    // Track appointment cancellation activity
    await notificationService.trackUserActivity(
      appointment.customer,
      "appointment_cancelled",
      {
        appointmentId: appointment._id,
        cancellationReason: cancellationReason,
        cancelledBy: appointment.cancelledBy,
      }
    );

    res.json({
      success: true,
      message: "Appointment cancelled successfully",
      data: populatedAppointment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Complete appointment
// @route   PUT /api/appointments/:id/complete
// @access  Private (staff only)
router.put("/:id/complete", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { staffNotes } = req.body;

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (appointment.status !== "upcoming") {
      return res.status(400).json({
        success: false,
        message: "Only upcoming appointments can be completed",
      });
    }

    appointment.status = "completed";
    appointment.completedBy = req.user._id;
    appointment.paymentStatus = "paid";
    if (staffNotes) {
      appointment.staffNotes = staffNotes;
    }

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    // Track appointment completion activity
    await notificationService.trackUserActivity(
      appointment.customer,
      "appointment_completed",
      {
        appointmentId: appointment._id,
        serviceId: appointment.service,
        completedBy: req.user._id,
        staffNotes: staffNotes,
      }
    );

    res.json({
      success: true,
      message:
        "Appointment completed successfully. Customer can now rate the service.",
      data: populatedAppointment,
      canRate: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Delete appointment - FIXED VERSION
// @route   DELETE /api/appointments/:id
// @access  Private (staff only)
router.delete("/:id", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Deleting appointment: ${id}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log(`❌ Invalid appointment ID: ${id}`);
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      console.log(`❌ Appointment ${id} not found`);
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Check if staff has permission to delete this appointment
    const canDeleteAny = req.user.permissions?.includes(
      "manage_all_appointments"
    );
    const isAssignedStaff =
      appointment.assignedStaff?.toString() === req.user._id.toString();

    if (!canDeleteAny && !isAssignedStaff) {
      console.log(
        `❌ Staff ${req.user._id} not authorized to delete appointment ${id}`
      );
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only delete appointments assigned to you.",
      });
    }

    await Appointment.findByIdAndDelete(id);

    console.log(`✅ Appointment ${id} deleted successfully`);

    res.json({
      success: true,
      message: "Appointment deleted successfully",
    });
  } catch (error) {
    console.error("Delete appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Get all clients (for staff view)
// @route   GET /api/appointments/staff/clients
// @access  Private (staff only)
router.get("/staff/clients", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const appointments = await Appointment.find(filter)
      .populate("customer", "username email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position")
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    res.json({
      success: true,
      message: "Client appointments retrieved successfully",
      data: appointments,
      count: appointments.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// ==================== STAFF APPOINTMENT ACTIONS ====================

// @desc    Get appointments assigned to staff
// @route   GET /api/appointments/staff/my-appointments
// @access  Private (staff only)
router.get(
  "/staff/my-appointments",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      const { status, date, page = 1, limit = 10 } = req.query;
      const staffId = req.user._id;

      // Build filter object
      const filter = { assignedStaff: staffId };
      if (status && status !== "all") filter.status = status;
      if (date) {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        filter.appointmentDate = { $gte: startDate, $lt: endDate };
      }

      const skip = (page - 1) * limit;

      const appointments = await Appointment.find(filter)
        .populate(
          "customer",
          "username firstName email phoneNumber profileImage"
        )
        .populate("service", "name duration priceRange category")
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .skip(skip)
        .limit(Number.parseInt(limit));

      const total = await Appointment.countDocuments(filter);

      res.json({
        success: true,
        message: "Staff appointments retrieved successfully",
        data: appointments,
        pagination: {
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// @desc    Get appointments for specific staff member - NEW ROUTE
// @route   GET /api/appointments/staff/:staffId
// @access  Private (staff only)
router.get("/staff/:staffId", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { staffId } = req.params;
    const { status, date, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    // Build filter object
    const filter = { assignedStaff: staffId };
    if (status && status !== "all") filter.status = status;
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
      .populate("assignedStaff", "username profileImage position")
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Appointment.countDocuments(filter);

    res.json({
      success: true,
      message: "Staff appointments retrieved successfully",
      data: appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get staff appointments error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Staff marks appointment as completed - FIXED ENDPOINT
// @route   PUT /api/appointments/staff/:id/complete
// @access  Private (staff only)
router.put(
  "/staff/:id/complete",
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
        const Leaderboard = require("../models/Leaderboards.js");
        await Leaderboard.updateAppointmentCompletion(
          staffId,
          appointment.totalAmount || 0,
          appointment.service?.category || "standard"
        );
      } catch (leaderboardError) {
        console.error("Error updating leaderboard:", leaderboardError);
        // Don't fail the request if leaderboard update fails
      }

      // Track appointment completion activity
      await notificationService.trackUserActivity(
        appointment.customer,
        "appointment_completed",
        {
          appointmentId: appointment._id,
          serviceId: appointment.service,
          completedBy: staffId,
          staffNotes: staffNotes,
        }
      );

      console.log(`✅ Appointment ${id} marked as completed successfully`);

      res.json({
        success: true,
        message: "Appointment marked as completed successfully",
        data: updatedAppointment,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// @desc    Staff cancels appointment - FIXED ENDPOINT
// @route   PUT /api/appointments/staff/:id/cancel
// @access  Private (staff only)
router.put("/staff/:id/cancel", authMiddleware, staffOnly, async (req, res) => {
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
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    // Track appointment cancellation activity
    await notificationService.trackUserActivity(
      appointment.customer,
      "appointment_cancelled",
      {
        appointmentId: appointment._id,
        cancellationReason: cancellationReason,
        cancelledBy: "staff",
        staffNotes: staffNotes,
      }
    );

    res.json({
      success: true,
      message: "Appointment cancelled successfully",
      data: populatedAppointment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Staff updates appointment notes
// @route   PUT /api/appointments/staff/:id/notes
// @access  Private (staff only)
router.put("/staff/:id/notes", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { staffNotes } = req.body;
    const staffId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Check if staff is assigned to this appointment
    if (appointment.assignedStaff?.toString() !== staffId.toString()) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only update notes for appointments assigned to you.",
      });
    }

    appointment.staffNotes = staffNotes || "";

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    res.json({
      success: true,
      message: "Appointment notes updated successfully",
      data: populatedAppointment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// @desc    Assign staff to appointment
// @route   PUT /api/appointments/staff/:id/assign
// @access  Private (staff only - with permission)
router.put("/staff/:id/assign", authMiddleware, staffOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { staffId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Check if current user has permission to assign staff
    const canAssignStaff = req.user.permissions?.includes("assign_staff");
    if (!canAssignStaff) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You don't have permission to assign staff.",
      });
    }

    appointment.assignedStaff = staffId;

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("service", "name duration priceRange category")
      .populate("assignedStaff", "username profileImage position");

    res.json({
      success: true,
      message: "Staff assigned to appointment successfully",
      data: populatedAppointment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
