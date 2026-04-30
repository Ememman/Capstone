import express from "express";
import Booking from "../models/Booking.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { authMiddleware, customerOnly, staffOnly } from "../middleware/auth.js";
import notificationService from "../services/notificationService.js";
import mongoose from "mongoose";

const router = express.Router();

// POST /api/bookings/create - Create a new booking
router.post("/create", authMiddleware, customerOnly, async (req, res) => {
  try {
    console.log("📝 Booking creation request received");
    console.log("User ID:", req.user._id);
    console.log("User role:", req.user.role);
    console.log("User isGuest:", req.user.isGuest);
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const {
      serviceId,
      stylistPreference,
      selectedStylistId,
      preferredDate,
      preferredTime,
      customerNotes,
      paymentOption = "full", // Add payment option: "full" or "downpayment"
      downpaymentPercentage = 30, // Default 30%
    } = req.body;

    // Validate required fields
    if (!serviceId) {
      console.log("❌ Missing serviceId");
      return res.status(400).json({
        success: false,
        message: "Service ID is required",
      });
    }

    if (!stylistPreference) {
      console.log("❌ Missing stylistPreference");
      return res.status(400).json({
        success: false,
        message: "Stylist preference is required",
      });
    }

    if (!preferredDate) {
      console.log("❌ Missing preferredDate");
      return res.status(400).json({
        success: false,
        message: "Preferred date is required",
      });
    }

    if (!preferredTime) {
      console.log("❌ Missing preferredTime");
      return res.status(400).json({
        success: false,
        message: "Preferred time is required",
      });
    }

    // Check if user is guest
    if (req.user.isGuest) {
      console.log("❌ Guest user attempting to book");
      return res.status(403).json({
        success: false,
        message:
          "Guest users cannot create bookings. Please complete registration.",
      });
    }

    // Validate service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      console.log("❌ Service not found:", serviceId);
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    console.log("✅ Service found:", service.name);
    console.log("Service price range:", service.priceRange);

    // Validate stylist if specific preference
    let selectedStylist = null;
    if (stylistPreference === "specific") {
      if (!selectedStylistId) {
        console.log("❌ Missing selectedStylistId for specific preference");
        return res.status(400).json({
          success: false,
          message: "Stylist ID is required for specific stylist preference",
        });
      }

      selectedStylist = await User.findById(selectedStylistId);
      if (!selectedStylist || selectedStylist.role !== "salon_staff") {
        console.log("❌ Invalid stylist:", selectedStylistId);
        return res.status(404).json({
          success: false,
          message: "Stylist not found or invalid",
        });
      }

      // Check staff availability for the selected date and time
      const isStaffAvailable = await Booking.checkStaffAvailability(
        selectedStylistId,
        preferredDate,
        preferredTime
      );

      if (!isStaffAvailable) {
        console.log("❌ Staff not available at selected time");
        return res.status(400).json({
          success: false,
          message:
            "Selected stylist is not available at the chosen time. Please choose a different time or stylist.",
        });
      }

      console.log(
        "✅ Stylist validated and available:",
        selectedStylist.username
      );
    }

    // Extract price from service
    let servicePrice = 1000; // Default price

    if (service.priceRange) {
      // Extract first number from price range (e.g., "₱1,000" -> 1000)
      const priceMatch = service.priceRange.match(/[\d,]+/);
      if (priceMatch) {
        servicePrice = parseInt(priceMatch[0].replace(/,/g, ""));
      }
    }

    console.log("💰 Calculated service price:", servicePrice);

    // Validate payment option
    const validPaymentOptions = ["full", "downpayment"];
    if (!validPaymentOptions.includes(paymentOption)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment option. Must be 'full' or 'downpayment'",
      });
    }

    // Validate downpayment percentage
    if (
      paymentOption === "downpayment" &&
      (downpaymentPercentage < 10 || downpaymentPercentage > 50)
    ) {
      return res.status(400).json({
        success: false,
        message: "Downpayment percentage must be between 10% and 50%",
      });
    }

    // Validate and parse date
    let bookingDate;
    try {
      bookingDate = new Date(preferredDate);
      if (isNaN(bookingDate.getTime())) {
        throw new Error("Invalid date");
      }
    } catch (error) {
      console.log("❌ Invalid date format:", preferredDate);
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    bookingDate.setHours(0, 0, 0, 0);

    if (bookingDate < today) {
      console.log("❌ Date is in the past:", bookingDate);
      return res.status(400).json({
        success: false,
        message: "Cannot book appointments in the past",
      });
    }

    console.log("✅ All validations passed, creating booking...");

    // Create booking
    const booking = new Booking({
      customer: req.user._id,
      service: serviceId,
      bookingType: "service",
      stylistPreference,
      selectedStylist:
        stylistPreference === "specific" ? selectedStylistId : undefined,
      preferredDate: new Date(preferredDate),
      preferredTime,
      servicePrice,
      discountApplied: 0,
      totalAmount: servicePrice,
      paymentOption,
      downpaymentPercentage:
        paymentOption === "downpayment" ? downpaymentPercentage : 0,
      customerNotes: customerNotes || "",
      status: "pending",
    });

    await booking.save();

    console.log("✅ Booking created successfully:", booking._id);
    console.log("Booking payment details:", {
      paymentOption: booking.paymentOption,
      totalAmount: booking.totalAmount,
      downpaymentAmount: booking.downpaymentAmount,
      remainingAmount: booking.remainingAmount,
      nonRefundableAmount: booking.nonRefundableAmount,
      refundableAmount: booking.refundableAmount,
    });

    // Populate service details for response
    await booking.populate("service");
    if (booking.selectedStylist) {
      await booking.populate("selectedStylist", "username profileImage");
    }

    // Track booking creation activity
    await notificationService.trackUserActivity(
      req.user._id,
      "booking_created",
      {
        bookingId: booking._id,
        serviceId: serviceId,
        serviceName: service.name,
        preferredDate: booking.preferredDate,
        preferredTime: booking.preferredTime,
        totalAmount: booking.totalAmount,
        paymentOption: booking.paymentOption,
        downpaymentAmount: booking.downpaymentAmount,
      }
    );

    // Track service booking activity
    await notificationService.trackUserActivity(
      req.user._id,
      "service_booked",
      {
        serviceId: serviceId,
        serviceName: service.name,
        bookingId: booking._id,
        stylistPreference: stylistPreference,
      }
    );

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: booking,
    });
  } catch (error) {
    console.error("❌ Error creating booking:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
});

// GET /api/bookings/available-slots/:date - Get available time slots
router.get("/available-slots/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { staffId } = req.query; // Add staffId as query parameter
    console.log("⏰ Fetching available slots for:", date, "Staff:", staffId);

    let requestedDate;
    try {
      requestedDate = new Date(date);
      if (isNaN(requestedDate.getTime())) {
        throw new Error("Invalid date");
      }
    } catch (error) {
      console.log("❌ Invalid date format:", date);
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Get all bookings for the requested date
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Base query
    const baseQuery = {
      preferredDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $in: ["pending", "confirmed", "in-progress"] },
    };

    // If staffId is provided, get staff-specific bookings
    let bookedSlots;
    if (staffId && staffId !== "undefined" && staffId !== "null") {
      bookedSlots = await Booking.find({
        ...baseQuery,
        selectedStylist: staffId,
      }).select("preferredTime");
    } else {
      bookedSlots = await Booking.find(baseQuery).select("preferredTime");
    }

    // Define available time slots
    const allSlots = [
      "09:30 AM",
      "10:00 AM",
      "10:30 AM",
      "11:00 AM",
      "11:30 AM",
      "12:00 PM",
      "12:30 PM",
      "01:00 PM",
      "01:30 PM",
      "02:00 PM",
      "02:30 PM",
      "03:00 PM",
      "03:30 PM",
      "04:00 PM",
      "04:30 PM",
      "05:00 PM",
      "05:30 PM",
      "06:00 PM",
      "06:30 PM",
      "07:00 PM",
      "07:30 PM",
      "08:00 PM",
      "08:30 PM",
    ];

    // Filter out booked slots
    const bookedTimes = bookedSlots.map((booking) => booking.preferredTime);
    const availableSlots = allSlots.filter(
      (slot) => !bookedTimes.includes(slot)
    );

    console.log("✅ Total slots:", allSlots.length);
    console.log("Booked slots:", bookedTimes.length);
    console.log("Available slots:", availableSlots.length);

    res.json({
      success: true,
      availableSlots,
      bookedSlots: bookedTimes,
      date: requestedDate,
      staffId: staffId || null,
    });
  } catch (error) {
    console.error("❌ Error fetching time slots:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch available time slots",
      error: error.message,
    });
  }
});

// GET /api/bookings/available-slots-with-staff/:date - Get available time slots considering staff availability
router.get("/available-slots-with-staff/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const { staffId } = req.query; // Get staffId from query parameters
    console.log(
      "⏰ Fetching available slots with staff consideration for:",
      date,
      "Staff:",
      staffId
    );

    let requestedDate;
    try {
      requestedDate = new Date(date);
      if (isNaN(requestedDate.getTime())) {
        throw new Error("Invalid date");
      }
    } catch (error) {
      console.log("❌ Invalid date format:", date);
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Get all bookings for the requested date
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Base query for all bookings on this date
    const baseQuery = {
      preferredDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $in: ["pending", "confirmed", "in-progress"] },
    };

    // Get all booked slots
    const allBookedSlots = await Booking.find(baseQuery).select(
      "preferredTime selectedStylist"
    );

    // Get staff-specific booked slots if staffId is provided
    let staffBookedSlots = [];
    if (staffId && staffId !== "undefined" && staffId !== "null") {
      const staffBookings = await Booking.find({
        ...baseQuery,
        selectedStylist: staffId,
      }).select("preferredTime");
      staffBookedSlots = staffBookings.map((booking) => booking.preferredTime);
    }

    // Define available time slots
    const allSlots = [
      "09:30 AM",
      "10:00 AM",
      "10:30 AM",
      "11:00 AM",
      "11:30 AM",
      "12:00 PM",
      "12:30 PM",
      "01:00 PM",
      "01:30 PM",
      "02:00 PM",
      "02:30 PM",
      "03:00 PM",
      "03:30 PM",
      "04:00 PM",
      "04:30 PM",
      "05:00 PM",
      "05:30 PM",
      "06:00 PM",
      "06:30 PM",
      "07:00 PM",
      "07:30 PM",
      "08:00 PM",
      "08:30 PM",
    ];

    // Filter out all booked slots
    const allBookedTimes = allBookedSlots.map(
      (booking) => booking.preferredTime
    );
    const availableSlots = allSlots.filter(
      (slot) => !allBookedTimes.includes(slot)
    );

    // For staff-specific availability
    let staffAvailableSlots = [];
    let staffUnavailableSlots = [];

    if (staffId && staffId !== "undefined" && staffId !== "null") {
      staffAvailableSlots = allSlots.filter(
        (slot) => !staffBookedSlots.includes(slot)
      );
      staffUnavailableSlots = staffBookedSlots;
    }

    console.log("✅ Total slots:", allSlots.length);
    console.log("All booked slots:", allBookedTimes.length);
    console.log("Available slots:", availableSlots.length);

    if (staffId) {
      console.log("Staff booked slots:", staffBookedSlots.length);
      console.log("Staff available slots:", staffAvailableSlots.length);
    }

    res.json({
      success: true,
      availableSlots,
      bookedSlots: allBookedTimes,
      staffAvailableSlots,
      staffUnavailableSlots,
      date: requestedDate,
      staffId: staffId || null,
    });
  } catch (error) {
    console.error("❌ Error fetching time slots with staff:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch available time slots",
      error: error.message,
    });
  }
});

// POST /api/bookings/check-staff-availability - Check specific staff availability
router.post("/check-staff-availability", async (req, res) => {
  try {
    const { staffId, date, time } = req.body;

    if (!staffId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Staff ID, date, and time are required",
      });
    }

    const isAvailable = await Booking.checkStaffAvailability(
      staffId,
      date,
      time
    );

    res.json({
      success: true,
      isAvailable,
      staffId,
      date,
      time,
    });
  } catch (error) {
    console.error("❌ Error checking staff availability:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to check staff availability",
      error: error.message,
    });
  }
});

// GET /api/bookings/staff-availability/:date - Get all staff availability for a date
router.get("/staff-availability/:date", async (req, res) => {
  try {
    const { date } = req.params;

    const staffAvailability = await Booking.getStaffAvailabilityForDate(date);

    res.json({
      success: true,
      date,
      data: staffAvailability,
    });
  } catch (error) {
    console.error("❌ Error getting staff availability:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to get staff availability",
      error: error.message,
    });
  }
});

// GET /api/bookings - Get user's bookings
router.get("/", authMiddleware, async (req, res) => {
  try {
    console.log("📋 Fetching bookings for user:", req.user._id);

    const query = {};

    // If customer, only show their bookings
    if (req.user.role === "customer") {
      query.customer = req.user._id;
    }

    const { status } = req.query;
    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate("service", "name duration priceRange category")
      .populate("customer", "username email phoneNumber")
      .populate("selectedStylist", "username profileImage")
      .populate("payments")
      .sort({ createdAt: -1 });

    console.log("✅ Bookings fetched:", bookings.length);

    res.json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("❌ Error fetching bookings:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

// GET /api/bookings/my-bookings - Get current user's bookings
router.get("/my-bookings", authMiddleware, async (req, res) => {
  try {
    console.log("📋 Fetching current user's bookings:", req.user._id);

    const query = { customer: req.user._id };

    const { status } = req.query;
    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate("service", "name duration priceRange category")
      .populate("selectedStylist", "username profileImage position")
      .populate("payments")
      .sort({ preferredDate: -1, createdAt: -1 });

    console.log("✅ User bookings fetched:", bookings.length);

    res.json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("❌ Error fetching user bookings:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

// GET /api/bookings/:id - Get booking details
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    console.log("📋 Fetching booking:", req.params.id);

    const booking = await Booking.findById(req.params.id)
      .populate("service", "name duration priceRange category")
      .populate("customer", "username email phoneNumber")
      .populate("selectedStylist", "username profileImage position")
      .populate("payments");

    if (!booking) {
      console.log("❌ Booking not found:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check access permissions
    if (
      req.user.role === "customer" &&
      booking.customer._id.toString() !== req.user._id.toString()
    ) {
      console.log("❌ Access denied for user:", req.user._id);
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    console.log("✅ Booking found:", booking._id);

    res.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error("❌ Error fetching booking:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch booking",
      error: error.message,
    });
  }
});

// PUT /api/bookings/:id/cancel - Cancel booking with refund calculation
router.put("/:id/cancel", authMiddleware, customerOnly, async (req, res) => {
  try {
    console.log("🚫 Cancelling booking:", req.params.id);

    const { cancellationReason } = req.body;

    const booking = await Booking.findById(req.params.id)
      .populate("payments")
      .populate("service", "name duration priceRange");

    if (!booking) {
      console.log("❌ Booking not found:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check if user owns the booking
    if (booking.customer.toString() !== req.user._id.toString()) {
      console.log("❌ Access denied for user:", req.user._id);
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check if booking can be cancelled
    if (!booking.canBeCancelled()) {
      console.log("❌ Booking cannot be cancelled:", booking.status);
      return res.status(400).json({
        success: false,
        message: "Booking cannot be cancelled at this time",
      });
    }

    // Calculate refund amount
    const refundAmount = booking.calculateRefundAmount();
    const nonRefundableAmount = booking.amountPaid - refundAmount;

    // Update booking status
    booking.status = "cancelled";
    booking.cancellationReason =
      cancellationReason || "Customer requested cancellation";
    booking.cancelledAt = new Date();
    booking.cancelledBy = req.user._id;

    if (refundAmount > 0) {
      booking.refundStatus = "pending";
      booking.refundAmount = refundAmount;
    } else {
      booking.refundStatus = "none";
      booking.refundAmount = 0;
    }

    await booking.save();

    // Track booking cancellation activity
    await notificationService.trackUserActivity(
      req.user._id,
      "booking_cancelled",
      {
        bookingId: booking._id,
        serviceId: booking.service,
        cancellationReason: booking.cancellationReason,
        amountPaid: booking.amountPaid,
        refundAmount: refundAmount,
        nonRefundableAmount: nonRefundableAmount,
        paymentOption: booking.paymentOption,
      }
    );

    console.log("✅ Booking cancelled:", {
      bookingId: booking._id,
      amountPaid: booking.amountPaid,
      refundAmount: refundAmount,
      nonRefundableAmount: nonRefundableAmount,
    });

    res.json({
      success: true,
      message:
        refundAmount > 0
          ? `Booking cancelled successfully. ₱${refundAmount} refund pending. ₱${nonRefundableAmount} is non-refundable reservation fee.`
          : `Booking cancelled successfully. ₱${nonRefundableAmount} is non-refundable reservation fee.`,
      data: {
        booking,
        refundDetails: {
          refundAmount,
          nonRefundableAmount,
          refundStatus: booking.refundStatus,
          note:
            booking.paymentOption === "downpayment"
              ? "30% downpayment is non-refundable reservation fee"
              : "Full refund available based on cancellation policy",
        },
      },
    });
  } catch (error) {
    console.error("❌ Error cancelling booking:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message,
    });
  }
});

// PUT /api/bookings/:id/process-refund - Process refund (staff only)
router.put(
  "/:id/process-refund",
  authMiddleware,
  staffOnly,
  async (req, res) => {
    try {
      console.log("💰 Processing refund for booking:", req.params.id);

      const { refundReference, notes } = req.body;

      const booking = await Booking.findById(req.params.id);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      if (booking.refundStatus !== "pending") {
        return res.status(400).json({
          success: false,
          message: "No pending refund for this booking",
        });
      }

      // Update booking refund status
      booking.refundStatus = "processed";
      booking.refundProcessedAt = new Date();
      booking.refundProcessedBy = req.user._id;
      booking.adminNotes = notes || "Refund processed";

      await booking.save();

      // Create refund record in payment (optional)
      const Payment = mongoose.model("Payment");
      const refundPayment = new Payment({
        customer: booking.customer,
        booking: booking._id,
        paymentType: "refund",
        amount: -booking.refundAmount, // Negative amount for refund
        paymentMethod: "refund",
        status: "completed",
        processingNotes: `Refund for cancelled booking - ${
          notes || "Customer cancellation"
        }`,
        refund: {
          amount: booking.refundAmount,
          reason: booking.cancellationReason,
          processedAt: new Date(),
          processedBy: req.user._id,
          refundReference: refundReference,
        },
      });

      await refundPayment.save();

      // Add refund payment to booking's payments array
      booking.payments.push(refundPayment._id);
      await booking.save();

      console.log("✅ Refund processed:", {
        bookingId: booking._id,
        refundAmount: booking.refundAmount,
        processedBy: req.user._id,
      });

      res.json({
        success: true,
        message: `Refund of ₱${booking.refundAmount} processed successfully`,
        data: {
          booking,
          refundPayment,
        },
      });
    } catch (error) {
      console.error("❌ Error processing refund:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to process refund",
        error: error.message,
      });
    }
  }
);

// PUT /api/bookings/:id/status - Update booking status (staff only)
router.put("/:id/status", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("🔄 Updating booking status:", req.params.id);

    // Validate booking ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID format",
      });
    }

    const { status, adminNotes } = req.body;

    const validStatuses = [
      "pending",
      "confirmed",
      "in-progress",
      "completed",
      "cancelled",
    ];

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    if (!validStatuses.includes(status)) {
      console.log("❌ Invalid status:", status);
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      console.log("❌ Booking not found:", req.params.id);
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

    console.log("✅ Booking status updated:", oldStatus, "->", status);

    // Track booking status update activity
    await notificationService.trackUserActivity(
      booking.customer,
      "booking_status_updated",
      {
        bookingId: booking._id,
        oldStatus: oldStatus,
        newStatus: status,
        adminNotes: adminNotes,
      }
    );

    // Track booking completion activity
    if (status === "completed") {
      await notificationService.trackUserActivity(
        booking.customer,
        "booking_completed",
        {
          bookingId: booking._id,
          serviceId: booking.service,
        }
      );
    }

    // Track booking confirmation activity
    if (status === "confirmed") {
      await notificationService.trackUserActivity(
        booking.customer,
        "booking_confirmed",
        {
          bookingId: booking._id,
          serviceId: booking.service,
          preferredDate: booking.preferredDate,
          preferredTime: booking.preferredTime,
        }
      );
    }

    // Return canRate information similar to orders
    const response = {
      success: true,
      message: "Booking status updated successfully",
      data: booking,
    };

    if (status === "completed") {
      response.canRate = true;
      response.message += ". Customer can now rate the service.";
    }

    res.json(response);
  } catch (error) {
    console.error("❌ Error updating booking status:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
      error: error.message,
    });
  }
});

// GET /api/bookings/stats/overview - Get booking statistics (staff only)
router.get("/stats/overview", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("📊 Fetching booking statistics");

    const { startDate, endDate } = req.query;

    let start, end;
    try {
      start = startDate
        ? new Date(startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      end = endDate ? new Date(endDate) : new Date();

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid dates");
      }
    } catch (dateError) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate or endDate format",
      });
    }

    const bookings = await Booking.find({
      createdAt: {
        $gte: start,
        $lte: end,
      },
    });

    const stats = {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      inProgress: bookings.filter((b) => b.status === "in-progress").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      totalRevenue: bookings
        .filter((b) => b.status === "completed")
        .reduce((sum, b) => sum + b.totalAmount, 0),
    };

    console.log("✅ Stats calculated:", stats);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        stats,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching booking statistics:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch booking statistics",
      error: error.message,
    });
  }
});

// GET /api/bookings/staff/all - Get all bookings for staff
router.get("/staff/all", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("📋 Fetching all bookings for staff...");

    const { status, page = 1, limit = 100 } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate("service", "name duration priceRange category")
      .populate("customer", "username firstName email phoneNumber profileImage")
      .populate("selectedStylist", "username profileImage position")
      .populate("payments")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    console.log("✅ All bookings fetched for staff:", bookings.length);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching all bookings for staff:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

export default router;
