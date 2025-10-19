import mongoose from "mongoose";

const learningModuleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  category: {
    type: String,
    required: true,
    enum: [
      "cutting",
      "coloring",
      "styling",
      "customer-service",
      "safety",
      "business",
      "trends",
      "tools",
      "first-aid",
      "social-media",
    ],
  },
  difficulty: {
    type: String,
    enum: ["beginner", "intermediate", "advanced"],
    default: "beginner",
  },
  instructor: {
    name: {
      type: String,
      required: true,
    },
    bio: String,
    profileImage: String,
    credentials: [String],
  },
  content: {
    type: {
      type: String,
      enum: ["video", "article", "interactive", "quiz", "mixed"],
      default: "mixed",
    },
    videoUrl: String,
    videoDuration: Number, // in minutes
    articleContent: String,
    resources: [
      {
        title: String,
        url: String,
        type: {
          type: String,
          enum: ["pdf", "video", "article", "tool", "template"],
        },
      },
    ],
    quiz: [
      {
        question: String,
        options: [String],
        correctAnswer: Number,
        explanation: String,
      },
    ],
  },
  coverImage: {
    type: String,
    required: true,
  },
  thumbnails: [String],
  tags: [String],
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    count: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rating: {
          type: Number,
          min: 1,
          max: 5,
        },
        comment: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  enrollment: {
    totalEnrolled: {
      type: Number,
      default: 0,
    },
    completed: {
      type: Number,
      default: 0,
    },
  },
  requirements: [String],
  learningObjectives: [String],
  estimatedDuration: {
    type: Number, // in minutes
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
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

// User progress tracking schema
const userProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LearningModule",
    required: true,
  },
  status: {
    type: String,
    enum: ["not-started", "in-progress", "completed", "paused"],
    default: "not-started",
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  timeSpent: {
    type: Number, // in minutes
    default: 0,
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
  quizScores: [
    {
      attempt: Number,
      score: Number,
      totalQuestions: Number,
      correctAnswers: Number,
      completedAt: Date,
    },
  ],
  bookmarked: {
    type: Boolean,
    default: false,
  },
  notes: [
    {
      content: String,
      timestamp: Number, // for video content
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  certificate: {
    issued: {
      type: Boolean,
      default: false,
    },
    issuedAt: Date,
    certificateUrl: String,
  },
});

// Indexes for efficient queries
learningModuleSchema.index({ category: 1, isActive: 1 });
learningModuleSchema.index({ "rating.average": -1 });
learningModuleSchema.index({ isFeatured: 1, isActive: 1 });
learningModuleSchema.index({ tags: 1 });

userProgressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });
userProgressSchema.index({ userId: 1, status: 1 });

// Calculate completion rate
learningModuleSchema.methods.getCompletionRate = function () {
  return this.enrollment.totalEnrolled > 0
    ? Math.round(
        (this.enrollment.completed / this.enrollment.totalEnrolled) * 100
      )
    : 0;
};

// Update rating average
learningModuleSchema.methods.updateRating = function () {
  if (this.rating.reviews.length > 0) {
    const sum = this.rating.reviews.reduce(
      (acc, review) => acc + review.rating,
      0
    );
    this.rating.average =
      Math.round((sum / this.rating.reviews.length) * 10) / 10;
    this.rating.count = this.rating.reviews.length;
  }
};

// Get popular modules
learningModuleSchema.statics.getPopularModules = function (limit = 10) {
  return this.find({ isActive: true })
    .sort({ "enrollment.totalEnrolled": -1, "rating.average": -1 })
    .limit(limit)
    .populate("createdBy", "username profileImage");
};

// Get featured modules
learningModuleSchema.statics.getFeaturedModules = function () {
  return this.find({ isFeatured: true, isActive: true })
    .sort({ "rating.average": -1 })
    .populate("createdBy", "username profileImage");
};

// Search modules
learningModuleSchema.statics.searchModules = function (query, filters = {}) {
  const searchQuery = {
    isActive: true,
    $or: [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { tags: { $in: [new RegExp(query, "i")] } },
    ],
  };

  if (filters.category) {
    searchQuery.category = filters.category;
  }

  if (filters.difficulty) {
    searchQuery.difficulty = filters.difficulty;
  }

  if (filters.minRating) {
    searchQuery["rating.average"] = { $gte: filters.minRating };
  }

  return this.find(searchQuery)
    .sort({ "rating.average": -1, "enrollment.totalEnrolled": -1 })
    .populate("createdBy", "username profileImage");
};

userProgressSchema.pre("save", function (next) {
  if (this.progress === 100 && this.status !== "completed") {
    this.status = "completed";
    this.completedAt = new Date();
  }
  next();
});

learningModuleSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const LearningModule = mongoose.model("LearningModule", learningModuleSchema);
const UserProgress = mongoose.model("UserProgress", userProgressSchema);

export { LearningModule, UserProgress };
