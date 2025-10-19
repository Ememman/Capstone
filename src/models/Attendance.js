import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  clockInTime: {
    type: Date,
    default: null,
  },
  clockOutTime: {
    type: Date,
    default: null,
  },
  clockInLocation: {
    latitude: {
      type: Number,
      required: function () {
        return this.clockInTime != null;
      },
    },
    longitude: {
      type: Number,
      required: function () {
        return this.clockInTime != null;
      },
    },
    address: String,
  },
  clockOutLocation: {
    latitude: {
      type: Number,
      required: function () {
        return this.clockOutTime != null;
      },
    },
    longitude: {
      type: Number,
      required: function () {
        return this.clockOutTime != null;
      },
    },
    address: String,
  },
  status: {
    type: String,
    enum: ["present", "absent", "late", "half-day"],
    default: "absent",
  },
  workingHours: {
    type: Number,
    default: 0, // in minutes
  },
  isValidLocation: {
    clockIn: {
      type: Boolean,
      default: false,
    },
    clockOut: {
      type: Boolean,
      default: false,
    },
  },
  notes: {
    type: String,
    maxlength: 500,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient queries
attendanceSchema.index({ userId: 1, date: 1 });
attendanceSchema.index({ date: 1 });

// Calculate working hours when both clock in and out are present
attendanceSchema.methods.calculateWorkingHours = function () {
  if (this.clockInTime && this.clockOutTime) {
    const diffMs = this.clockOutTime - this.clockInTime;
    this.workingHours = Math.floor(diffMs / (1000 * 60)); // Convert to minutes
  }
  return this.workingHours;
};

// Check if location is within salon premises (using Haversine formula)
attendanceSchema.statics.isWithinSalonRadius = (
  userLat,
  userLng,
  salonLat = 14.5995,
  salonLng = 120.9842,
  radiusKm = 0.1
) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((salonLat - userLat) * Math.PI) / 180;
  const dLng = ((salonLng - userLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((userLat * Math.PI) / 180) *
      Math.cos((salonLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return {
    isWithin: distance <= radiusKm,
    distance: distance,
    distanceMeters: Math.round(distance * 1000),
  };
};

// Get monthly attendance summary
attendanceSchema.statics.getMonthlyAttendance = async function (
  userId,
  year,
  month
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const attendance = await this.find({
    userId: userId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

  const summary = {
    totalDays: endDate.getDate(),
    workingDays: 0,
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    totalWorkingHours: 0,
    attendancePercentage: 0,
  };

  attendance.forEach((record) => {
    summary.workingDays++;
    switch (record.status) {
      case "present":
        summary.present++;
        break;
      case "absent":
        summary.absent++;
        break;
      case "late":
        summary.late++;
        summary.present++; // Late is still present
        break;
      case "half-day":
        summary.halfDay++;
        summary.present++; // Half day is still present
        break;
    }
    summary.totalWorkingHours += record.workingHours || 0;
  });

  summary.attendancePercentage =
    summary.workingDays > 0
      ? Math.round((summary.present / summary.workingDays) * 100)
      : 0;

  return summary;
};

attendanceSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  if (this.clockInTime && this.clockOutTime) {
    this.calculateWorkingHours();
  }
  next();
});

export default mongoose.model("Attendance", attendanceSchema);
