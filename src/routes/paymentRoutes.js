import express from "express";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";
import Order from "../models/Order.js";
import { authMiddleware, customerOnly, staffOnly } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Ensure upload directory exists
const uploadDir = "uploads/payments/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "payment-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and PDF files are allowed"));
    }
  },
});

// ⚠️ IMPORTANT: Place specific routes BEFORE parameterized routes
// GET /api/payments/stats/overview - Get payment statistics (admin only)
router.get("/stats/overview", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("📊 Fetching payment statistics");

    const { startDate, endDate } = req.query;

    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await Payment.getPaymentStats(start, end);

    // Get auto-approval stats
    const autoApprovedCount = await Payment.countDocuments({
      autoApproved: true,
      createdAt: { $gte: start, $lte: end },
    });

    console.log("✅ Statistics fetched");

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        stats,
        autoApprovedCount,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching payment statistics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment statistics",
      error: error.message,
    });
  }
});

// POST /api/payments/create - Create payment for booking or order
router.post("/create", authMiddleware, customerOnly, async (req, res) => {
  try {
    console.log("💳 Creating payment...");
    console.log("Request body:", req.body);
    console.log("User:", req.user._id);

    const { bookingId, orderId, paymentMethod } = req.body;

    let amount = 0;
    let paymentType = "";

    // Validate booking or order
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        console.log("❌ Booking not found:", bookingId);
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      if (booking.customer.toString() !== req.user._id.toString()) {
        console.log("❌ Access denied for user:", req.user._id);
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      amount = booking.totalAmount;
      paymentType = "booking";
      console.log("✅ Booking found, amount:", amount);
    } else if (orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        console.log("❌ Order not found:", orderId);
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.customer.toString() !== req.user._id.toString()) {
        console.log("❌ Access denied for user:", req.user._id);
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      amount = order.totalAmount;
      paymentType = "order";
      console.log("✅ Order found, amount:", amount);
    } else {
      console.log("❌ Missing bookingId or orderId");
      return res.status(400).json({
        success: false,
        message: "Either bookingId or orderId is required",
      });
    }

    // Create payment
    const payment = new Payment({
      booking: bookingId,
      order: orderId,
      customer: req.user._id,
      paymentType,
      amount,
      paymentMethod,
    });

    // Generate QR code data
    payment.generateQRCode();

    await payment.save();

    console.log("✅ Payment created:", payment._id);

    // Update booking or order with payment reference
    if (bookingId) {
      await Booking.findByIdAndUpdate(bookingId, { payment: payment._id });
    } else if (orderId) {
      await Order.findByIdAndUpdate(orderId, { payment: payment._id });
    }

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: {
        _id: payment._id,
        paymentReference: payment.paymentReference,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        qrCode: payment.qrCode,
        customer: payment.customer,
        booking: payment.booking,
        order: payment.order,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Error creating payment:", error);
    res.status(400).json({
      success: false,
      message: "Error creating payment",
      error: error.message,
    });
  }
});

// GET /api/payments - Get all payments (admin) or user's payments
router.get("/", authMiddleware, async (req, res) => {
  try {
    console.log("💳 Fetching payments for user:", req.user._id);

    const query = {};

    // If customer, only show their payments
    if (req.user.role === "customer") {
      query.customer = req.user._id;
    }

    const { status, paymentMethod, startDate, endDate } = req.query;

    // Add filters
    if (status) query.status = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const payments = await Payment.find(query)
      .populate("customer", "username email")
      .populate("booking", "preferredDate preferredTime")
      .populate("order", "orderNumber")
      .populate("processedBy", "username")
      .sort({ createdAt: -1 });

    console.log("✅ Payments fetched:", payments.length);

    res.json({
      success: true,
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    console.error("❌ Error fetching payments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
});

// POST /api/payments/:id/upload-proof - Upload proof of payment with auto-approval
router.post(
  "/:id/upload-proof",
  authMiddleware,
  customerOnly,
  upload.single("proofImage"),
  async (req, res) => {
    try {
      console.log("📤 Uploading proof of payment for:", req.params.id);
      console.log("File:", req.file);
      console.log("Body:", req.body);

      const payment = await Payment.findById(req.params.id);

      if (!payment) {
        console.log("❌ Payment not found:", req.params.id);
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      if (payment.customer.toString() !== req.user._id.toString()) {
        console.log("❌ Access denied for user:", req.user._id);
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      if (!req.file) {
        console.log("❌ No file uploaded");
        return res.status(400).json({
          success: false,
          message: "Proof of payment image is required",
        });
      }

      // Extract payment details from request body
      const { referenceNumber, name, amountPaid, dateOfTransaction } = req.body;

      // Update payment with proof of payment
      payment.proofOfPayment = {
        imageUrl: `/uploads/payments/${req.file.filename}`,
        uploadedAt: new Date(),
        fileName: req.file.originalname,
        fileSize: req.file.size,
        referenceNumber: referenceNumber || "",
        name: name || "",
        amountPaid: amountPaid ? parseFloat(amountPaid) : payment.amount,
        dateOfTransaction: dateOfTransaction
          ? new Date(dateOfTransaction)
          : new Date(),
      };
      payment.status = "processing";

      await payment.save();

      console.log("✅ Proof of payment uploaded successfully");

      // 🤖 IMMEDIATE AUTO-APPROVAL CHECK (no delay)
      const adminOnline = await Payment.isAdminOnline();
      console.log("👤 Admin online:", adminOnline);

      let autoApprovalResult = null;

      if (!adminOnline) {
        console.log(
          "🤖 No admin online, attempting auto-approval immediately..."
        );

        autoApprovalResult = await payment.autoVerify();
        await payment.save();

        console.log(
          `🤖 Auto-verification: ${
            autoApprovalResult.approved ? "APPROVED ✅" : "PENDING ⏳"
          } (Score: ${autoApprovalResult.score}/100)`
        );

        if (autoApprovalResult.approved) {
          // Update booking status if payment is approved
          if (payment.booking) {
            await Booking.findByIdAndUpdate(payment.booking, {
              status: "confirmed",
              paymentStatus: "paid",
            });
          }
        }
      } else {
        console.log("👤 Admin is online - manual review required");
        payment.lastAdminCheck = new Date();
        await payment.save();
      }

      res.json({
        success: true,
        message: autoApprovalResult?.approved
          ? "Payment auto-approved successfully!"
          : "Proof of payment uploaded successfully. Awaiting verification.",
        data: {
          _id: payment._id,
          paymentReference: payment.paymentReference,
          proofOfPayment: payment.proofOfPayment,
          status: payment.status,
          autoApproved: payment.autoApproved,
          verificationScore: payment.verificationScore,
          autoApprovalReason: payment.autoApprovalReason,
        },
      });
    } catch (error) {
      console.error("❌ Error uploading proof of payment:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading proof of payment",
        error: error.message,
      });
    }
  }
);

// 🔧 FIX: Enhanced status endpoint with detailed logging
// GET /api/payments/:id/status - Get payment status (for polling)
router.get("/:id/status", authMiddleware, async (req, res) => {
  try {
    console.log("🔍 [STATUS CHECK] Payment ID:", req.params.id);

    const payment = await Payment.findById(req.params.id)
      .select(
        "status autoApproved verificationScore processingNotes autoApprovalReason processedAt processedBy"
      )
      .populate("processedBy", "username")
      .lean();

    if (!payment) {
      console.log("❌ [STATUS CHECK] Payment not found:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    console.log("✅ [STATUS CHECK] Current status:", payment.status);
    console.log("📊 [STATUS CHECK] Full payment data:", {
      id: req.params.id,
      status: payment.status,
      autoApproved: payment.autoApproved,
      processedBy: payment.processedBy?.username,
      processedAt: payment.processedAt,
    });

    res.json({
      success: true,
      data: {
        status: payment.status,
        autoApproved: payment.autoApproved || false,
        verificationScore: payment.verificationScore || 0,
        processingNotes: payment.processingNotes || "",
        autoApprovalReason: payment.autoApprovalReason || "",
        processedAt: payment.processedAt,
        processedBy: payment.processedBy,
      },
    });
  } catch (error) {
    console.error("❌ [STATUS CHECK] Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment status",
      error: error.message,
    });
  }
});

// GET /api/payments/:id - Get payment details
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    console.log("💳 Fetching payment:", req.params.id);

    const payment = await Payment.findById(req.params.id)
      .populate("customer", "username email")
      .populate("booking")
      .populate("order")
      .populate("processedBy", "username");

    if (!payment) {
      console.log("❌ Payment not found:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check access permissions
    if (
      req.user.role === "customer" &&
      payment.customer._id.toString() !== req.user._id.toString()
    ) {
      console.log("❌ Access denied for user:", req.user._id);
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    console.log("✅ Payment found:", payment._id);

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("❌ Error fetching payment:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment",
      error: error.message,
    });
  }
});

// 🔧 FIX: Enhanced approve endpoint with better logging
// PUT /api/payments/:id/approve - Approve payment (admin only)
router.put("/:id/approve", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("✅ [ADMIN APPROVE] Starting approval for:", req.params.id);
    console.log(
      "✅ [ADMIN APPROVE] Admin user:",
      req.user._id,
      req.user.username
    );

    const { notes } = req.body;

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      console.log("❌ [ADMIN APPROVE] Payment not found:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    console.log("📝 [ADMIN APPROVE] Payment before approval:", {
      status: payment.status,
      autoApproved: payment.autoApproved,
    });

    // Override auto-approval if admin manually approves
    payment.autoApproved = false;
    await payment.approve(req.user._id, notes);

    console.log("✅ [ADMIN APPROVE] Payment after approval:", {
      status: payment.status,
      processedBy: payment.processedBy,
      processedAt: payment.processedAt,
    });

    // Reload payment to get populated fields
    const updatedPayment = await Payment.findById(req.params.id)
      .populate("processedBy", "username")
      .populate("booking");

    console.log("✅ [ADMIN APPROVE] Payment manually approved successfully");

    res.json({
      success: true,
      message: "Payment approved successfully",
      data: updatedPayment,
    });
  } catch (error) {
    console.error("❌ [ADMIN APPROVE] Error:", error);
    res.status(500).json({
      success: false,
      message: "Error approving payment",
      error: error.message,
    });
  }
});

// PUT /api/payments/:id/deny - Deny payment (admin only)
router.put("/:id/deny", authMiddleware, staffOnly, async (req, res) => {
  try {
    console.log("❌ Denying payment:", req.params.id);

    const { notes } = req.body;

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      console.log("❌ Payment not found:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    await payment.deny(req.user._id, notes);

    console.log("✅ Payment denied:", payment._id);

    res.json({
      success: true,
      message: "Payment denied successfully",
      data: payment,
    });
  } catch (error) {
    console.error("❌ Error denying payment:", error);
    res.status(500).json({
      success: false,
      message: "Error denying payment",
      error: error.message,
    });
  }
});

export default router;
