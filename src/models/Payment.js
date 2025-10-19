import mongoose from "mongoose";
import crypto from "crypto";

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["booking", "order"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "PHP",
    },
    paymentMethod: {
      type: String,
      enum: [
        "gcash",
        "paymaya",
        "paypal",
        "cash",
        "credit",
        "bpi",
        "bdo",
        "metrobank",
        "unionbank",
        "landbank",
        "pnb",
        "security_bank",
        "rcbc",
        "chinabank",
        "eastwest",
        "other_bank",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "approved",
        "completed",
        "denied",
        "refunded",
        "cancelled",
      ],
      default: "pending",
    },
    qrCode: {
      data: String,
      imageUrl: String,
      expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      },
    },
    paymentReference: {
      type: String,
      unique: true,
      default: () =>
        `PAY-${Date.now()}-${crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase()}`,
    },
    proofOfPayment: {
      imageUrl: String,
      uploadedAt: Date,
      fileName: String,
      fileSize: Number,
      referenceNumber: String,
      name: String,
      amountPaid: Number,
      dateOfTransaction: Date,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    processedAt: Date,
    processingNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    // 🤖 AUTO-APPROVAL FIELDS
    autoApproved: {
      type: Boolean,
      default: false,
    },
    autoApprovalReason: {
      type: String,
    },
    verificationScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    lastAdminCheck: {
      type: Date,
    },
    transactionId: String,
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    refund: {
      amount: Number,
      reason: String,
      processedAt: Date,
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      refundReference: String,
    },
    attempts: [
      {
        attemptedAt: {
          type: Date,
          default: Date.now,
        },
        method: String,
        status: String,
        errorMessage: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
paymentSchema.index({ customer: 1 });
paymentSchema.index({ booking: 1 });
paymentSchema.index({ order: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ "qrCode.expiresAt": 1 });
paymentSchema.index({ autoApproved: 1 });
paymentSchema.index({ verificationScore: 1 });

// Virtual for payment summary
paymentSchema.virtual("summary").get(function () {
  return {
    reference: this.paymentReference,
    amount: this.amount,
    method: this.paymentMethod,
    status: this.status,
    createdAt: this.createdAt,
  };
});

// Method to generate QR code data
paymentSchema.methods.generateQRCode = function () {
  const qrData = {
    reference: this.paymentReference,
    amount: this.amount,
    method: this.paymentMethod,
    expiresAt: this.qrCode.expiresAt,
  };

  this.qrCode.data = JSON.stringify(qrData);
  return this.qrCode.data;
};

// Method to check if QR code is expired
paymentSchema.methods.isQRCodeExpired = function () {
  return new Date() > this.qrCode.expiresAt;
};

// 🤖 AUTO-VERIFICATION METHOD
paymentSchema.methods.autoVerify = async function () {
  let score = 0;
  const reasons = [];

  console.log("🤖 Starting auto-verification for payment:", this._id);

  // Check 1: Proof of payment uploaded (30 points)
  if (this.proofOfPayment?.imageUrl) {
    score += 30;
    reasons.push("Proof image uploaded");
    console.log("✅ Proof image: +30 points");
  }

  // Check 2: Reference number provided (20 points)
  if (
    this.proofOfPayment?.referenceNumber &&
    this.proofOfPayment.referenceNumber.trim().length > 0
  ) {
    score += 20;
    reasons.push("Reference number provided");
    console.log("✅ Reference number: +20 points");
  }

  // Check 3: Amount matches (30 points for exact, 20 for sufficient)
  if (this.proofOfPayment?.amountPaid) {
    const amountDiff = Math.abs(this.proofOfPayment.amountPaid - this.amount);

    if (amountDiff < 1) {
      score += 30;
      reasons.push("Amount matches exactly");
      console.log("✅ Amount exact match: +30 points");
    } else if (this.proofOfPayment.amountPaid >= this.amount) {
      score += 20;
      reasons.push("Amount sufficient");
      console.log("✅ Amount sufficient: +20 points");
    } else {
      reasons.push("Amount insufficient");
      console.log("⚠️ Amount insufficient: 0 points");
    }
  }

  // Check 4: Name provided (10 points)
  if (this.proofOfPayment?.name && this.proofOfPayment.name.trim().length > 0) {
    score += 10;
    reasons.push("Name provided");
    console.log("✅ Name provided: +10 points");
  }

  // Check 5: Transaction date is recent - within last 7 days (10 points)
  if (this.proofOfPayment?.dateOfTransaction) {
    const transactionDate = new Date(this.proofOfPayment.dateOfTransaction);
    const daysDiff = Math.abs(
      (new Date() - transactionDate) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff <= 7) {
      score += 10;
      reasons.push("Recent transaction (within 7 days)");
      console.log("✅ Recent transaction: +10 points");
    } else {
      reasons.push(`Transaction is ${Math.floor(daysDiff)} days old`);
      console.log(
        `⚠️ Old transaction (${Math.floor(daysDiff)} days): 0 points`
      );
    }
  }

  this.verificationScore = score;

  console.log(`🤖 Final verification score: ${score}/100`);
  console.log(`🤖 Reasons: ${reasons.join(", ")}`);

  // Auto-approve if score is 80% or higher
  if (score >= 80) {
    console.log("✅ Score >= 80, auto-approving payment!");

    this.status = "approved";
    this.autoApproved = true;
    this.autoApprovalReason = `Auto-approved (Score: ${score}/100) - ${reasons.join(
      ", "
    )}`;
    this.processedAt = new Date();

    // Update related booking/order
    if (this.booking) {
      const Booking = mongoose.model("Booking");
      await Booking.findByIdAndUpdate(this.booking, {
        status: "confirmed",
        paymentStatus: "paid",
      });
      console.log("✅ Booking status updated to confirmed");
    }

    if (this.order) {
      const Order = mongoose.model("Order");
      await Order.findByIdAndUpdate(this.order, {
        status: "confirmed",
        paymentStatus: "paid",
      });
      console.log("✅ Order status updated to confirmed");
    }

    return { approved: true, score, reasons };
  } else {
    console.log(`⏳ Score < 80 (${score}/100), keeping in processing status`);
    this.processingNotes = `Awaiting manual review (Score: ${score}/100 - needs 80+)`;
    return { approved: false, score, reasons };
  }
};

// 🤖 STATIC METHOD: Check if any admin is online
paymentSchema.statics.isAdminOnline = async function () {
  const User = mongoose.model("User");

  // Check if any admin/staff was active in the last 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const activeAdmin = await User.findOne({
    role: { $in: ["admin", "salon_staff"] },
    lastActivity: { $gte: tenMinutesAgo },
    isActive: true,
  });

  const isOnline = !!activeAdmin;
  console.log(`👤 Admin online check: ${isOnline ? "YES" : "NO"}`);

  if (isOnline && activeAdmin) {
    console.log(
      `👤 Active admin: ${activeAdmin.username} (last active: ${activeAdmin.lastActivity})`
    );
  }

  return isOnline;
};

// 🔧 FIX: Enhanced approve method with logging
// Method to process payment approval
paymentSchema.methods.approve = async function (adminId, notes) {
  console.log("🔧 [APPROVE METHOD] Starting approval process");
  console.log("🔧 [APPROVE METHOD] Current status:", this.status);

  this.status = "approved";
  this.processedBy = adminId;
  this.processedAt = new Date();
  this.processingNotes = notes;

  console.log("🔧 [APPROVE METHOD] New status set to: approved");
  console.log("🔧 [APPROVE METHOD] Processed by:", adminId);
  console.log("🔧 [APPROVE METHOD] Processed at:", this.processedAt);

  await this.save();

  console.log("🔧 [APPROVE METHOD] Payment saved to database");

  if (this.booking) {
    console.log("🔧 [APPROVE METHOD] Updating booking:", this.booking);
    const Booking = mongoose.model("Booking");
    await Booking.findByIdAndUpdate(this.booking, {
      status: "confirmed",
      paymentStatus: "paid",
    });
    console.log("🔧 [APPROVE METHOD] Booking updated to confirmed");
  }

  if (this.order) {
    console.log("🔧 [APPROVE METHOD] Updating order:", this.order);
    const Order = mongoose.model("Order");
    await Order.findByIdAndUpdate(this.order, {
      status: "confirmed",
      paymentStatus: "paid",
    });
    console.log("🔧 [APPROVE METHOD] Order updated to confirmed");
  }

  console.log("🔧 [APPROVE METHOD] Approval process complete");
};

// Method to process payment denial
paymentSchema.methods.deny = async function (adminId, notes) {
  this.status = "denied";
  this.processedBy = adminId;
  this.processedAt = new Date();
  this.processingNotes = notes;

  await this.save();

  if (this.booking) {
    const Booking = mongoose.model("Booking");
    await Booking.findByIdAndUpdate(this.booking, { status: "cancelled" });
  }

  if (this.order) {
    const Order = mongoose.model("Order");
    await Order.findByIdAndUpdate(this.order, { status: "cancelled" });
  }
};

// Static method to get payment statistics
paymentSchema.statics.getPaymentStats = async function (startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  return stats;
};

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
