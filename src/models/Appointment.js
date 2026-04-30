import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
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
    appointmentDate: {
      type: Date,
      required: true,
    },
    appointmentTime: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["upcoming", "completed", "cancelled"],
      default: "upcoming",
    },
    salonLocation: {
      name: {
        type: String,
        required: true,
        trim: true,
        default: "SandreaLee Salon",
      },
      address: {
        type: String,
        required: true,
        trim: true,
        default:
          "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    cancelledBy: {
      type: String,
      enum: ["customer", "staff", "system"],
      trim: true,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    totalAmount: {
      type: Number,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    staffNotes: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // Rating fields
    rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rating",
    },
    isRated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

appointmentSchema.index({ customer: 1 });
appointmentSchema.index({ service: 1 });
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ customer: 1, status: 1 });
appointmentSchema.index({ appointmentDate: 1, status: 1 });
appointmentSchema.index({ assignedStaff: 1, status: 1 });

appointmentSchema.virtual("formattedDateTime").get(function () {
  const date = this.appointmentDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${date} ${this.appointmentTime}`;
});

appointmentSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    if (this.status === "cancelled" && !this.cancellationReason) {
      this.cancellationReason = "Cancelled by staff";
      this.cancelledBy = "staff";
    }
    if (this.status === "completed" && !this.completedBy) {
      this.completedBy = this.assignedStaff;
    }
  }
  next();
});

appointmentSchema.statics.findByStaff = function (staffId, filters = {}) {
  return this.find({ assignedStaff: staffId, ...filters })
    .populate("customer", "username firstName email phoneNumber profileImage")
    .populate("service", "name duration priceRange category")
    .sort({ appointmentDate: 1, appointmentTime: 1 });
};

appointmentSchema.statics.getStaffStats = async function (
  staffId,
  period = "month"
) {
  const today = new Date();
  let startDate, endDate;

  if (period === "month") {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (period === "week") {
    startDate = new Date(today.setDate(today.getDate() - today.getDay()));
    endDate = new Date(today.setDate(today.getDate() - today.getDay() + 6));
  } else {
    startDate = new Date(today.setHours(0, 0, 0, 0));
    endDate = new Date(today.setHours(23, 59, 59, 999));
  }

  const stats = await this.aggregate([
    {
      $match: {
        assignedStaff: staffId,
        appointmentDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      revenue: stat.totalRevenue || 0,
    };
    return acc;
  }, {});
};

// FIXED: Method to check if appointment can be rated
appointmentSchema.methods.canBeRated = function () {
  const canRate = this.status === "completed" && !this.isRated;
  console.log(
    `Appointment ${this._id} canBeRated: ${canRate} (status: ${this.status}, isRated: ${this.isRated})`
  );
  return canRate;
};

// FIXED: Method to mark appointment as rated
appointmentSchema.methods.markAsRated = async function (ratingId) {
  this.isRated = true;
  this.rating = ratingId;
  await this.save();
  console.log(
    `✅ Appointment ${this._id} marked as rated with rating ${ratingId}`
  );
};

// NEW: Method to rate the appointment
appointmentSchema.methods.rateAppointment = async function (
  ratingValue,
  userId,
  comment = null,
  categories = null
) {
  try {
    const Rating = mongoose.model("Rating");

    // Check if appointment can be rated
    if (!this.canBeRated()) {
      throw new Error("This appointment cannot be rated at this time");
    }

    // Check if user has already rated this appointment
    const existingRating = await Rating.findOne({
      rater: userId,
      "ratedEntity.type": "appointment",
      "ratedEntity.id": this._id,
    });

    if (existingRating) {
      throw new Error("You have already rated this appointment");
    }

    // Create new rating
    const newRating = new Rating({
      rater: userId,
      ratedEntity: {
        type: "appointment",
        id: this._id,
      },
      ratedStaff: this.assignedStaff,
      ratedService: this.service,
      rating: ratingValue,
      comment: comment,
      categories: categories,
    });

    await newRating.save();

    // Mark appointment as rated
    await this.markAsRated(newRating._id);

    return newRating;
  } catch (error) {
    console.error("Error rating appointment:", error);
    throw error;
  }
};

const Appointment = mongoose.model("Appointment", appointmentSchema);
export default Appointment;
