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
    totalAmount: {
      type: Number,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better query performance
appointmentSchema.index({ customer: 1 });
appointmentSchema.index({ service: 1 });
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ customer: 1, status: 1 });
appointmentSchema.index({ appointmentDate: 1, status: 1 });

// Virtual for formatted appointment datetime
appointmentSchema.virtual("formattedDateTime").get(function () {
  const date = this.appointmentDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${date} ${this.appointmentTime}`;
});

// Pre-save middleware to set cancellation reason when status changes to cancelled
appointmentSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "cancelled" &&
    !this.cancellationReason
  ) {
    this.cancellationReason = "Cancelled by customer";
  }
  next();
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
