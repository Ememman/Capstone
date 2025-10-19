import express from "express";
import Booking from "../models/Booking.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { authMiddleware, customerOnly, staffOnly } from "../middleware/auth.js";

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
    if (stylistPreference === "specific") {
      if (!selectedStylistId) {
        console.log("❌ Missing selectedStylistId for specific preference");
        return res.status(400).json({
          success: false,
          message: "Stylist ID is required for specific stylist preference",
        });
      }

      const stylist = await User.findById(selectedStylistId);
      if (!stylist || stylist.role !== "salon_staff") {
        console.log("❌ Invalid stylist:", selectedStylistId);
        return res.status(404).json({
          success: false,
          message: "Stylist not found or invalid",
        });
      }
      console.log("✅ Stylist validated:", stylist.username);
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
      customerNotes: customerNotes || "",
      status: "pending",
    });

    await booking.save();

    console.log("✅ Booking created successfully:", booking._id);
    console.log("Booking details:", {
      id: booking._id,
      customer: booking.customer,
      service: booking.service,
      date: booking.preferredDate,
      time: booking.preferredTime,
      amount: booking.totalAmount,
    });

    // Populate service details for response
    await booking.populate("service");
    if (booking.selectedStylist) {
      await booking.populate("selectedStylist", "username profileImage");
    }

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
    console.log("⏰ Fetching available slots for:", date);

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

    const bookedSlots = await Booking.find({
      preferredDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $in: ["pending", "confirmed", "in-progress"] },
    }).select("preferredTime");

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
      .populate("payment")
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

// GET /api/bookings/:id - Get booking details
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    console.log("📋 Fetching booking:", req.params.id);

    const booking = await Booking.findById(req.params.id)
      .populate("service", "name duration priceRange category")
      .populate("customer", "username email phoneNumber")
      .populate("selectedStylist", "username profileImage")
      .populate("payment");

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

// PUT /api/bookings/:id/cancel - Cancel booking
router.put("/:id/cancel", authMiddleware, customerOnly, async (req, res) => {
  try {
    console.log("🚫 Cancelling booking:", req.params.id);

    const { cancellationReason } = req.body;

    const booking = await Booking.findById(req.params.id);

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

    booking.status = "cancelled";
    booking.cancellationReason =
      cancellationReason || "Customer requested cancellation";
    booking.cancelledAt = new Date();
    booking.cancelledBy = req.user._id;

    await booking.save();

    console.log("✅ Booking cancelled:", booking._id);

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      data: booking,
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

// PUT /api/bookings/:id/status - Update booking status (staff only)
router.put("/:id/status", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("🔄 Updating booking status:", req.params.id);

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

    res.json({
      success: true,
      message: "Booking status updated successfully",
      data: booking,
    });
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

export default router;
