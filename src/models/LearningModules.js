// models/LearningModules.js - Updated with Enhanced Quiz System
import mongoose from "mongoose";

const quizQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
  },
  questionType: {
    type: String,
    enum: ["multiple-choice", "true-false", "short-answer"],
    default: "multiple-choice",
  },
  options: [
    {
      id: String,
      text: String,
    },
  ],
  correctAnswer: {
    type: String,
    required: true,
  },
  explanation: {
    type: String,
    trim: true,
  },
  points: {
    type: Number,
    default: 1,
  },
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

const quizAttemptSchema = new mongoose.Schema({
  attemptNumber: {
    type: Number,
    required: true,
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  correctAnswers: Number,
  totalQuestions: Number,
  timeSpent: Number,
  answers: [
    {
      questionId: mongoose.Schema.Types.ObjectId,
      selectedAnswer: String,
      isCorrect: Boolean,
      pointsEarned: Number,
    },
  ],
  passed: Boolean,
  completedAt: {
    type: Date,
    default: Date.now,
  },
});

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
      "Hair Styling",
      "Coloring",
      "Safety",
      "Marketing",
      "Customer Service",
      "Management",
      "cutting",
      "styling",
      "customer-service",
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

  // YouTube video fields
  youtubeVideos: [
    {
      title: {
        type: String,
        required: true,
      },
      videoUrl: {
        type: String,
        required: true,
        validate: {
          validator: function (v) {
            return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(
              v
            );
          },
          message: "Please provide a valid YouTube URL",
        },
      },
      description: String,
      duration: String,
      thumbnail: String,
      isActive: {
        type: Boolean,
        default: true,
      },
      order: {
        type: Number,
        default: 0,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  // Enhanced Quiz System
  quiz: {
    isEnabled: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      trim: true,
      default: function () {
        return `${this.title} Assessment`;
      },
    },
    description: String,
    passingScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
    timeLimit: {
      type: Number,
      default: 30,
      min: 1,
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },
    questions: [quizQuestionSchema],
    totalPoints: {
      type: Number,
      default: 0,
    },
    showResults: {
      type: Boolean,
      default: true,
    },
    randomizeQuestions: {
      type: Boolean,
      default: false,
    },
    allowRetakes: {
      type: Boolean,
      default: true,
    },
    requiredForCompletion: {
      type: Boolean,
      default: true,
    },
  },

  // Quiz Analytics
  quizAnalytics: {
    totalAttempts: {
      type: Number,
      default: 0,
    },
    averageScore: {
      type: Number,
      default: 0,
    },
    passRate: {
      type: Number,
      default: 0,
    },
    averageTimeSpent: {
      type: Number,
      default: 0,
    },
    questionStatistics: [
      {
        questionId: mongoose.Schema.Types.ObjectId,
        questionText: String,
        correctAttempts: {
          type: Number,
          default: 0,
        },
        totalAttempts: {
          type: Number,
          default: 0,
        },
        successRate: {
          type: Number,
          default: 0,
        },
      },
    ],
  },

  // Existing content fields (keeping for backward compatibility)
  content: {
    type: {
      type: String,
      enum: ["video", "article", "interactive", "quiz", "mixed"],
      default: "mixed",
    },
    videoUrl: String,
    videoDuration: Number,
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
    // Legacy quiz - keeping for backward compatibility
    quiz: [
      {
        question: String,
        options: [String],
        correctAnswer: Number,
        explanation: String,
      },
    ],
  },

  // Training module specific fields
  duration: {
    type: String,
    required: true,
  },
  totalEmployees: {
    type: Number,
    default: 0,
  },
  employeesCompleted: {
    type: Number,
    default: 0,
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  status: {
    type: String,
    enum: ["Active", "Inactive", "Draft"],
    default: "Active",
  },

  // Existing fields
  coverImage: String,
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
  estimatedDuration: Number,
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

// Enhanced User Progress Tracking Schema
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
    enum: ["not-started", "in-progress", "completed", "paused", "failed"],
    default: "not-started",
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  timeSpent: {
    type: Number,
    default: 0,
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,

  // Enhanced Quiz Tracking
  quizAttempts: [quizAttemptSchema],
  currentAttempt: {
    type: Number,
    default: 0,
  },
  bestScore: {
    type: Number,
    default: 0,
  },
  quizCompleted: {
    type: Boolean,
    default: false,
  },
  lastQuizAttempt: Date,

  bookmarked: {
    type: Boolean,
    default: false,
  },
  notes: [
    {
      content: String,
      timestamp: Number,
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

// Indexes
learningModuleSchema.index({ category: 1, isActive: 1 });
learningModuleSchema.index({ "rating.average": -1 });
learningModuleSchema.index({ isFeatured: 1, isActive: 1 });
learningModuleSchema.index({ tags: 1 });
learningModuleSchema.index({ status: 1 });
learningModuleSchema.index({ "quiz.isEnabled": 1 });

userProgressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });
userProgressSchema.index({ userId: 1, status: 1 });
userProgressSchema.index({ "quizAttempts.score": -1 });
userProgressSchema.index({ lastQuizAttempt: -1 });

// Methods
learningModuleSchema.methods.getCompletionRate = function () {
  return this.totalEmployees > 0
    ? Math.round((this.employeesCompleted / this.totalEmployees) * 100)
    : 0;
};

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

// Quiz Methods
learningModuleSchema.methods.calculateQuizStats = function () {
  if (this.quiz.questions.length > 0) {
    this.quiz.totalPoints = this.quiz.questions.reduce((total, question) => {
      return total + (question.points || 1);
    }, 0);
  }
};

learningModuleSchema.methods.getYouTubeEmbedUrl = function (videoUrl) {
  if (!videoUrl) return null;

  const regex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = videoUrl.match(regex);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
};

// User Progress Methods
userProgressSchema.methods.canTakeQuiz = function (module) {
  if (!module.quiz.isEnabled) return false;

  if (
    module.quiz.maxAttempts > 0 &&
    this.quizAttempts.length >= module.quiz.maxAttempts
  ) {
    return false;
  }

  return module.quiz.allowRetakes || !this.quizCompleted;
};

userProgressSchema.methods.addQuizAttempt = function (attemptData) {
  const attemptNumber = this.quizAttempts.length + 1;

  this.quizAttempts.push({
    attemptNumber,
    ...attemptData,
  });

  this.currentAttempt = attemptNumber;
  this.lastQuizAttempt = new Date();

  // Update best score
  if (attemptData.score > this.bestScore) {
    this.bestScore = attemptData.score;
  }

  // Mark as completed if passed and required
  if (attemptData.passed) {
    this.quizCompleted = true;
  }
};

userProgressSchema.methods.getQuizStats = function () {
  const stats = {
    totalAttempts: this.quizAttempts.length,
    bestScore: this.bestScore,
    lastScore:
      this.quizAttempts.length > 0
        ? this.quizAttempts[this.quizAttempts.length - 1].score
        : 0,
    averageScore: 0,
    passed: this.quizCompleted,
  };

  if (this.quizAttempts.length > 0) {
    const totalScore = this.quizAttempts.reduce(
      (sum, attempt) => sum + attempt.score,
      0
    );
    stats.averageScore = Math.round(totalScore / this.quizAttempts.length);
  }

  return stats;
};

// Static methods
learningModuleSchema.statics.getPopularModules = function (limit = 10) {
  return this.find({ isActive: true })
    .sort({ "enrollment.totalEnrolled": -1, "rating.average": -1 })
    .limit(limit)
    .populate("createdBy", "username profileImage");
};

learningModuleSchema.statics.getFeaturedModules = function () {
  return this.find({ isFeatured: true, isActive: true })
    .sort({ "rating.average": -1 })
    .populate("createdBy", "username profileImage");
};

learningModuleSchema.statics.searchModules = function (query, filters = {}) {
  const searchQuery = {
    isActive: true,
    $or: [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { tags: { $in: [new RegExp(query, "i")] } },
    ],
  };

  if (filters.category) searchQuery.category = filters.category;
  if (filters.difficulty) searchQuery.difficulty = filters.difficulty;
  if (filters.minRating)
    searchQuery["rating.average"] = { $gte: filters.minRating };
  if (filters.hasQuiz) searchQuery["quiz.isEnabled"] = true;

  return this.find(searchQuery)
    .sort({ "rating.average": -1, "enrollment.totalEnrolled": -1 })
    .populate("createdBy", "username profileImage");
};

// Quiz Analytics Static Methods
learningModuleSchema.statics.updateQuizAnalytics = async function (moduleId) {
  const module = await this.findById(moduleId);
  if (!module || !module.quiz.isEnabled) return;

  const allProgress = await this.model("UserProgress").find({ moduleId });
  const quizAttempts = allProgress.flatMap((progress) => progress.quizAttempts);

  if (quizAttempts.length === 0) return;

  // Calculate basic analytics
  module.quizAnalytics.totalAttempts = quizAttempts.length;
  module.quizAnalytics.averageScore = Math.round(
    quizAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
      quizAttempts.length
  );
  module.quizAnalytics.passRate = Math.round(
    (quizAttempts.filter((attempt) => attempt.passed).length /
      quizAttempts.length) *
      100
  );
  module.quizAnalytics.averageTimeSpent = Math.round(
    quizAttempts.reduce((sum, attempt) => sum + (attempt.timeSpent || 0), 0) /
      quizAttempts.length
  );

  // Calculate question statistics
  module.quizAnalytics.questionStatistics = module.quiz.questions.map(
    (question) => {
      const questionAttempts = quizAttempts.filter((attempt) =>
        attempt.answers.some(
          (answer) => answer.questionId.toString() === question._id.toString()
        )
      );

      const correctAttempts = questionAttempts.filter((attempt) =>
        attempt.answers.some(
          (answer) =>
            answer.questionId.toString() === question._id.toString() &&
            answer.isCorrect
        )
      ).length;

      return {
        questionId: question._id,
        questionText: question.question,
        correctAttempts,
        totalAttempts: questionAttempts.length,
        successRate:
          questionAttempts.length > 0
            ? Math.round((correctAttempts / questionAttempts.length) * 100)
            : 0,
      };
    }
  );

  await module.save();
};

// Pre-save middleware
learningModuleSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate progress
  if (this.totalEmployees > 0) {
    this.progress = Math.round(
      (this.employeesCompleted / this.totalEmployees) * 100
    );
  }

  // Calculate quiz total points
  if (this.quiz.isEnabled && this.quiz.questions) {
    this.quiz.totalPoints = this.quiz.questions.reduce((total, question) => {
      return total + (question.points || 1);
    }, 0);
  }

  next();
});

userProgressSchema.pre("save", function (next) {
  // Update completion status
  if (this.progress === 100 && this.status !== "completed") {
    this.status = "completed";
    this.completedAt = new Date();
  }

  // Update last accessed
  this.lastAccessedAt = new Date();

  next();
});

// Post-save hook to update quiz analytics
userProgressSchema.post("save", async function () {
  try {
    await mongoose.model("LearningModule").updateQuizAnalytics(this.moduleId);
  } catch (error) {
    console.error("Error updating quiz analytics:", error);
  }
});

const LearningModule = mongoose.model("LearningModule", learningModuleSchema);
const UserProgress = mongoose.model("UserProgress", userProgressSchema);

export { LearningModule, UserProgress };
