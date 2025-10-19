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
    // Booking details
    bookingType: {
      type: String,
      enum: ["service", "product"],
      required: true,
      default: "service",
    },
    // Stylist selection
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
    // Date and time
    preferredDate: {
      type: Date,
      required: true,
    },
    preferredTime: {
      type: String,
      required: true,
      validate: {
        validator: (time) => {
          // Validate time format (HH:MM)
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        },
        message: "Time must be in HH:MM format",
      },
    },
    // Booking status
    status: {
      type: String,
      enum: ["pending", "confirmed", "in-progress", "completed", "cancelled"],
      default: "pending",
    },
    // Pricing
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
    // Salon information
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
    // Additional notes
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
    // Payment reference
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    // Cancellation
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
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
bookingSchema.index({ customer: 1 });
bookingSchema.index({ service: 1 });
bookingSchema.index({ preferredDate: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ preferredDate: 1, status: 1 });
bookingSchema.index({ selectedStylist: 1 });

// Virtual for formatted booking datetime
bookingSchema.virtual("formattedDateTime").get(function () {
  const date = this.preferredDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${date} ${this.preferredTime}`;
});

// Pre-save middleware to calculate total amount
bookingSchema.pre("save", function (next) {
  if (this.isModified("servicePrice") || this.isModified("discountApplied")) {
    this.totalAmount = this.servicePrice - this.discountApplied;
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

// Method to get available time slots for a date
bookingSchema.statics.getAvailableTimeSlots = async function (date, serviceId) {
  const startTime = 9; // 9 AM
  const endTime = 20; // 8 PM
  const slotDuration = 1; // 1 hour slots

  const timeSlots = [];
  for (let hour = startTime; hour < endTime; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, "0")}:00`);
  }

  // Get booked slots for the date
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

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
