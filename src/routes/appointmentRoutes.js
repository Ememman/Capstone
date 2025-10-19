import express from "express";
import Appointment from "../models/Appointment.js";
import mongoose from "mongoose";
import {
  optionalAuth,
  authMiddleware,
  customerOnly,
  staffOnly,
} from "../middleware/auth.js";

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
      .populate("service", "name duration priceRange category");

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
    });

    const savedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      savedAppointment._id
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category");

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
      .populate("service", "name duration priceRange category");

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

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category");

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

    if (appointment.status !== "upcoming") {
      return res.status(400).json({
        success: false,
        message: "Only upcoming appointments can be completed",
      });
    }

    appointment.status = "completed";
    appointment.paymentStatus = "paid";

    const updatedAppointment = await appointment.save();
    const populatedAppointment = await Appointment.findById(
      updatedAppointment._id
    )
      .populate("customer", "username email")
      .populate("service", "name duration priceRange category");

    res.json({
      success: true,
      message: "Appointment completed successfully",
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

// @desc    Delete appointment
// @route   DELETE /api/appointments/:id
// @access  Private (staff only)
router.delete("/:id", authMiddleware, staffOnly, async (req, res) => {
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

    await Appointment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Appointment deleted successfully",
    });
  } catch (error) {
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

export default router;
