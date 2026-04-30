import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    bookingType: {
      type: String,
      enum: ["service", "product"],
      required: true,
      default: "service",
    },
    stylistPreference: {
      type: String,
      enum: ["any", "specific"],
      required: true,
      default: "any",
    },
    selectedStylist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.stylistPreference === "specific";
      },
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    preferredTime: {
      type: String,
      required: true,
      validate: {
        validator: (time) => {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9] [AP]M$/.test(time);
        },
        message: "Time must be in HH:MM AM/PM format",
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "in-progress", "completed", "cancelled"],
      default: "pending",
    },

    // Payment fields
    paymentOption: {
      type: String,
      enum: ["full", "downpayment"],
      default: "full",
      required: true,
    },
    downpaymentPercentage: {
      type: Number,
      default: 30,
      min: 0,
      max: 100,
    },
    servicePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountApplied: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    downpaymentAmount: {
      type: Number,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "downpayment_paid",
        "fully_paid",
        "overdue",
        "refunded",
      ],
      default: "pending",
    },
    refundableAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    nonRefundableAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    salonInfo: {
      name: {
        type: String,
        default: "SandreaLee Salon",
      },
      address: {
        type: String,
        default:
          "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
      },
      openingHours: {
        monday: { type: String, default: "9:00 AM - 8:00 PM" },
        tuesday: { type: String, default: "9:00 AM - 8:00 PM" },
        wednesday: { type: String, default: "9:00 AM - 8:00 PM" },
        thursday: { type: String, default: "9:00 AM - 8:00 PM" },
        friday: { type: String, default: "9:00 AM - 8:00 PM" },
        saturday: { type: String, default: "8:00 AM - 9:00 PM" },
        sunday: { type: String, default: "8:00 AM - 7:00 PM" },
      },
    },
    customerNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    adminNotes: {
      type: String,
      maxlength: 500,
      trim: true,
    },

    // Payment references
    payments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],

    cancellationReason: {
      type: String,
      maxlength: 200,
      trim: true,
    },
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    refundStatus: {
      type: String,
      enum: ["none", "pending", "processed", "denied"],
      default: "none",
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundProcessedAt: Date,
    refundProcessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Enhanced rating fields
    rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rating",
    },
    isRated: {
      type: Boolean,
      default: false,
    },
    ratedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
bookingSchema.index({ customer: 1 });
bookingSchema.index({ service: 1 });
bookingSchema.index({ preferredDate: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ preferredDate: 1, status: 1 });
bookingSchema.index({ selectedStylist: 1 });
bookingSchema.index({ paymentOption: 1 });
bookingSchema.index({ refundStatus: 1 });

// Virtuals
bookingSchema.virtual("formattedDateTime").get(function () {
  const date = this.preferredDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${date} ${this.preferredTime}`;
});

bookingSchema.virtual("paymentSummary").get(function () {
  return {
    paymentOption: this.paymentOption,
    totalAmount: this.totalAmount,
    downpaymentAmount: this.downpaymentAmount,
    remainingAmount: this.remainingAmount,
    amountPaid: this.amountPaid,
    refundableAmount: this.refundableAmount,
    nonRefundableAmount: this.nonRefundableAmount,
  };
});

// Pre-save middleware to calculate amounts
bookingSchema.pre("save", function (next) {
  if (
    this.isModified("servicePrice") ||
    this.isModified("discountApplied") ||
    this.isModified("paymentOption") ||
    this.isModified("downpaymentPercentage")
  ) {
    // Calculate total amount
    this.totalAmount = this.servicePrice - this.discountApplied;

    // Calculate downpayment and remaining amounts based on payment option
    if (this.paymentOption === "downpayment") {
      this.downpaymentAmount = Math.round(
        (this.totalAmount * this.downpaymentPercentage) / 100
      );
      this.remainingAmount = this.totalAmount - this.downpaymentAmount;

      // For downpayment option, 30% is non-refundable reservation fee
      this.nonRefundableAmount = this.downpaymentAmount;
      this.refundableAmount = this.totalAmount - this.nonRefundableAmount;
    } else {
      // For full payment, everything is refundable (adjust based on your policy)
      this.downpaymentAmount = 0;
      this.remainingAmount = 0;
      this.nonRefundableAmount = 0;
      this.refundableAmount = this.totalAmount;
    }
  }
  next();
});

// Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function () {
  const now = new Date();
  const bookingDateTime = new Date(this.preferredDate);
  const timeDiff = bookingDateTime - now;
  const hoursDiff = timeDiff / (1000 * 60 * 60);

  return (
    this.status === "pending" || (this.status === "confirmed" && hoursDiff > 24)
  );
};

// Method to calculate refund amount when cancelling
bookingSchema.methods.calculateRefundAmount = function () {
  if (this.paymentOption === "downpayment") {
    if (this.amountPaid <= this.downpaymentAmount) {
      // Only downpayment was made - non-refundable
      return 0;
    } else {
      // Both downpayment and remaining were paid - refund the remaining portion
      return this.amountPaid - this.downpaymentAmount;
    }
  } else {
    // Full payment option - full refund (adjust based on your policy)
    return this.amountPaid;
  }
};

// Method to update paid amount when payment is approved
bookingSchema.methods.updatePaidAmount = async function (paymentAmount) {
  this.amountPaid += paymentAmount;

  // Update payment status based on amount paid
  if (this.paymentOption === "downpayment") {
    if (
      this.amountPaid >= this.downpaymentAmount &&
      this.amountPaid < this.totalAmount
    ) {
      this.paymentStatus = "downpayment_paid";
    } else if (this.amountPaid >= this.totalAmount) {
      this.paymentStatus = "fully_paid";
    }
  } else {
    if (this.amountPaid >= this.totalAmount) {
      this.paymentStatus = "fully_paid";
    }
  }

  await this.save();
};

// Method to check if booking can be rated
bookingSchema.methods.canBeRated = function () {
  const isCompleted = this.status === "completed";
  const notRated = !this.isRated;
  const canRate = isCompleted && notRated;

  console.log(`📊 Booking.canBeRated detailed check:`, {
    bookingId: this._id,
    status: this.status,
    isCompleted: isCompleted,
    isRated: this.isRated,
    notRated: notRated,
    canRate: canRate,
  });

  return canRate;
};

// Method to mark booking as rated
bookingSchema.methods.markAsRated = async function (ratingId) {
  this.isRated = true;
  this.rating = ratingId;
  this.ratedAt = new Date();
  await this.save();
  console.log(`✅ Booking ${this._id} marked as rated with rating ${ratingId}`);
};

// Method to update booking rating stats
bookingSchema.methods.updateRatingStats = async function () {
  try {
    const Rating = mongoose.model("Rating");
    const ratingStats = await Rating.getAverageRating("booking", this._id);

    console.log(`📊 Booking rating stats updated:`, {
      bookingId: this._id,
      averageRating: ratingStats.averageRating,
      totalRatings: ratingStats.totalRatings,
    });

    return this;
  } catch (error) {
    console.error("Error updating booking rating stats:", error);
    throw error;
  }
};

// Method to rate the booking
bookingSchema.methods.rateBooking = async function (
  ratingValue,
  userId,
  comment = null,
  categories = null,
  staffId = null
) {
  try {
    const Rating = mongoose.model("Rating");

    // Check if booking can be rated
    if (!this.canBeRated()) {
      throw new Error("This booking cannot be rated at this time");
    }

    // Check if user has already rated this booking
    const existingRating = await Rating.findOne({
      rater: userId,
      "ratedEntity.type": "booking",
      "ratedEntity.id": this._id,
    });

    if (existingRating) {
      throw new Error("You have already rated this booking");
    }

    // Create new rating
    const newRating = new Rating({
      rater: userId,
      ratedEntity: {
        type: "booking",
        id: this._id,
      },
      ratedStaff: staffId || this.selectedStylist,
      ratedService: this.service,
      rating: ratingValue,
      comment: comment,
      categories: categories,
    });

    await newRating.save();

    // Mark booking as rated
    await this.markAsRated(newRating._id);

    // Update related entities rating stats
    await this.updateRatingStats();

    if (this.service) {
      const Service = mongoose.model("Service");
      const service = await Service.findById(this.service);
      if (service && service.updateRatingStats) {
        await service.updateRatingStats();
      }
    }

    if (this.selectedStylist) {
      const User = mongoose.model("User");
      const stylist = await User.findById(this.selectedStylist);
      if (stylist && stylist.updateRatingStats) {
        await stylist.updateRatingStats();
      }
    }

    return newRating;
  } catch (error) {
    console.error("Error rating booking:", error);
    throw error;
  }
};

// Static method to check staff availability for a specific date and time
bookingSchema.statics.checkStaffAvailability = async function (
  staffId,
  date,
  time
) {
  try {
    const requestedDate = new Date(date);
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if staff has any booking at the same date and time
    const existingBooking = await this.findOne({
      selectedStylist: staffId,
      preferredDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      preferredTime: time,
      status: { $in: ["pending", "confirmed", "in-progress"] },
    });

    return !existingBooking; // Return true if available, false if booked
  } catch (error) {
    console.error("Error checking staff availability:", error);
    throw error;
  }
};

// Static method to get all unavailable time slots for a staff on a specific date
bookingSchema.statics.getStaffUnavailableSlots = async function (
  staffId,
  date
) {
  try {
    const requestedDate = new Date(date);
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all bookings for the staff on the requested date
    const staffBookings = await this.find({
      selectedStylist: staffId,
      preferredDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $in: ["pending", "confirmed", "in-progress"] },
    }).select("preferredTime");

    return staffBookings.map((booking) => booking.preferredTime);
  } catch (error) {
    console.error("Error getting staff unavailable slots:", error);
    throw error;
  }
};

// Static method to get available time slots for a specific staff
bookingSchema.statics.getStaffAvailableSlots = async function (staffId, date) {
  try {
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

    const unavailableSlots = await this.getStaffUnavailableSlots(staffId, date);
    return allSlots.filter((slot) => !unavailableSlots.includes(slot));
  } catch (error) {
    console.error("Error getting staff available slots:", error);
    throw error;
  }
};

// Static method to get all staff members with their availability for a date
bookingSchema.statics.getStaffAvailabilityForDate = async function (date) {
  try {
    const User = mongoose.model("User");
    const requestedDate = new Date(date);

    // Get all salon staff
    const staffMembers = await User.find({
      role: "salon_staff",
      isActive: true,
    }).select("username profileImage position");

    // Get all bookings for the date
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dayBookings = await this.find({
      preferredDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $in: ["pending", "confirmed", "in-progress"] },
      selectedStylist: { $ne: null },
    }).select("selectedStylist preferredTime");

    // Create availability map for each staff
    const staffAvailability = await Promise.all(
      staffMembers.map(async (staff) => {
        const staffBookings = dayBookings.filter(
          (booking) =>
            booking.selectedStylist.toString() === staff._id.toString()
        );

        const bookedSlots = staffBookings.map(
          (booking) => booking.preferredTime
        );
        const availableSlots = [
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
        ].filter((slot) => !bookedSlots.includes(slot));

        return {
          staffId: staff._id,
          staffName: staff.username,
          profileImage: staff.profileImage,
          position: staff.position,
          bookedSlots,
          availableSlots,
          availabilityPercentage: Math.round(
            (availableSlots.length / 23) * 100
          ),
        };
      })
    );

    return staffAvailability;
  } catch (error) {
    console.error("Error getting staff availability for date:", error);
    throw error;
  }
};

bookingSchema.statics.getAvailableTimeSlots = async function (date, serviceId) {
  const startTime = 9;
  const endTime = 20;
  const slotDuration = 1;

  const timeSlots = [];
  for (let hour = startTime; hour < endTime; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, "0")}:00`);
  }

  const bookedSlots = await this.find({
    preferredDate: {
      $gte: new Date(date.setHours(0, 0, 0, 0)),
      $lt: new Date(date.setHours(23, 59, 59, 999)),
    },
    status: { $in: ["confirmed", "in-progress"] },
  }).select("preferredTime");

  const bookedTimes = bookedSlots.map((booking) => booking.preferredTime);

  return timeSlots.filter((slot) => !bookedTimes.includes(slot));
};

// Static method to find bookings by customer
bookingSchema.statics.findByCustomer = function (customerId, filters = {}) {
  return this.find({ customer: customerId, ...filters })
    .populate("service", "name category duration priceRange")
    .populate("selectedStylist", "username profileImage position")
    .sort({ preferredDate: 1, preferredTime: 1 });
};

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
