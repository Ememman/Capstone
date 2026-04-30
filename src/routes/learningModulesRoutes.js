// routes/learningModulesRoutes.js - Updated with Complete Quiz System
import express from "express";
import { LearningModule, UserProgress } from "../models/LearningModules.js";
import { authMiddleware } from "../middleware/auth.js";
import { authenticateAdmin, staffOnly } from "../middleware/adminAuth.js";

const router = express.Router();

// Get all learning modules with filters
router.get("/", authMiddleware, async (req, res) => {
  try {
    const {
      category,
      difficulty,
      search,
      featured,
      popular,
      page = 1,
      limit = 12,
      minRating,
      hasQuiz,
    } = req.query;

    const query = { isActive: true };
    let sort = { createdAt: -1 };

    // Apply filters
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (minRating)
      query["rating.average"] = { $gte: Number.parseFloat(minRating) };
    if (featured === "true") query.isFeatured = true;
    if (hasQuiz === "true") query["quiz.isEnabled"] = true;
    if (hasQuiz === "false") query["quiz.isEnabled"] = false;

    // Handle search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    // Handle sorting
    if (popular === "true") {
      sort = { "enrollment.totalEnrolled": -1, "rating.average": -1 };
    } else if (featured === "true") {
      sort = { "rating.average": -1 };
    }

    const modules = await LearningModule.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("createdBy", "username profileImage")
      .select("-content.quiz -content.articleContent"); // Exclude heavy content

    const total = await LearningModule.countDocuments(query);

    // Get user progress for each module if user is authenticated
    const modulesWithProgress = await Promise.all(
      modules.map(async (module) => {
        const progress = await UserProgress.findOne({
          userId: req.user.id,
          moduleId: module._id,
        });

        return {
          ...module.toObject(),
          userProgress: progress
            ? {
                status: progress.status,
                progress: progress.progress,
                bookmarked: progress.bookmarked,
                lastAccessedAt: progress.lastAccessedAt,
                quizStats: progress.getQuizStats
                  ? progress.getQuizStats()
                  : null,
              }
            : null,
          completionRate:
            module.enrollment.totalEnrolled > 0
              ? Math.round(
                  (module.enrollment.completed /
                    module.enrollment.totalEnrolled) *
                    100
                )
              : 0,
        };
      })
    );

    res.json({
      success: true,
      data: modulesWithProgress,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total: total,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching learning modules",
      error: error.message,
    });
  }
});

// Get featured modules
router.get("/featured", authMiddleware, async (req, res) => {
  try {
    const modules = await LearningModule.find({
      isActive: true,
      isFeatured: true,
    })
      .limit(6)
      .populate("createdBy", "username profileImage")
      .sort({ "rating.average": -1 });

    const modulesWithProgress = await Promise.all(
      modules.map(async (module) => {
        const progress = await UserProgress.findOne({
          userId: req.user.id,
          moduleId: module._id,
        });

        return {
          ...module.toObject(),
          userProgress: progress,
          completionRate:
            module.enrollment.totalEnrolled > 0
              ? Math.round(
                  (module.enrollment.completed /
                    module.enrollment.totalEnrolled) *
                    100
                )
              : 0,
        };
      })
    );

    res.json({
      success: true,
      data: modulesWithProgress,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching featured modules",
      error: error.message,
    });
  }
});

// Get single learning module
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const module = await LearningModule.findById(req.params.id)
      .populate("createdBy", "username profileImage")
      .populate("rating.reviews.userId", "username profileImage");

    if (!module || !module.isActive) {
      return res.status(404).json({
        success: false,
        message: "Learning module not found",
      });
    }

    // Get user progress
    const progress = await UserProgress.findOne({
      userId: req.user.id,
      moduleId: module._id,
    });

    res.json({
      success: true,
      data: {
        ...module.toObject(),
        userProgress: progress,
        completionRate:
          module.enrollment.totalEnrolled > 0
            ? Math.round(
                (module.enrollment.completed /
                  module.enrollment.totalEnrolled) *
                  100
              )
            : 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching learning module",
      error: error.message,
    });
  }
});

// Enroll in a module
router.post("/:id/enroll", authMiddleware, async (req, res) => {
  try {
    const moduleId = req.params.id;
    const userId = req.user.id;

    const module = await LearningModule.findById(moduleId);
    if (!module || !module.isActive) {
      return res.status(404).json({
        success: false,
        message: "Learning module not found",
      });
    }

    // Check if already enrolled
    let progress = await UserProgress.findOne({ userId, moduleId });

    if (!progress) {
      progress = new UserProgress({
        userId,
        moduleId,
        status: "in-progress",
      });

      // Update enrollment count
      module.enrollment.totalEnrolled += 1;
      await module.save();
    }

    progress.lastAccessedAt = new Date();
    await progress.save();

    res.json({
      success: true,
      message: "Successfully enrolled in module",
      data: {
        progress,
        hasQuiz: module.quiz?.isEnabled || false,
        quizEnabled: module.quiz?.isEnabled || false,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error enrolling in module",
      error: error.message,
    });
  }
});

// Update progress
router.put("/:id/progress", authMiddleware, async (req, res) => {
  try {
    const { progress: progressValue, timeSpent, notes } = req.body;
    const moduleId = req.params.id;
    const userId = req.user.id;

    const progress = await UserProgress.findOne({ userId, moduleId });

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Not enrolled in this module",
      });
    }

    if (progressValue !== undefined) {
      progress.progress = Math.min(100, Math.max(0, progressValue));
    }

    if (timeSpent !== undefined) {
      progress.timeSpent += timeSpent;
    }

    if (notes) {
      progress.notes.push({
        content: notes.content,
        timestamp: notes.timestamp,
      });
    }

    progress.lastAccessedAt = new Date();

    // If completed, update module completion count
    if (progress.progress === 100 && progress.status !== "completed") {
      progress.status = "completed";
      progress.completedAt = new Date();

      const module = await LearningModule.findById(moduleId);
      if (module) {
        module.enrollment.completed += 1;
        await module.save();
      }
    }

    await progress.save();

    res.json({
      success: true,
      message: "Progress updated successfully",
      data: progress,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating progress",
      error: error.message,
    });
  }
});

// ==================== QUIZ SYSTEM ROUTES ====================

// GET /api/training/:id/progress - Get user progress for a module
router.get("/:id/progress", authMiddleware, async (req, res) => {
  try {
    const moduleId = req.params.id;
    const userId = req.user.id;

    const progress = await UserProgress.findOne({ userId, moduleId });
    const module = await LearningModule.findById(moduleId);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check if user can take quiz
    const canTakeQuiz = () => {
      if (!module.quiz?.isEnabled) return false;

      if (
        module.quiz.maxAttempts > 0 &&
        progress?.quizAttempts?.length >= module.quiz.maxAttempts
      ) {
        return false;
      }

      return module.quiz.allowRetakes || !progress?.quizCompleted;
    };

    res.json({
      success: true,
      data: {
        progress: progress || {
          userId,
          moduleId,
          status: "not-started",
          progress: 0,
          quizAttempts: [],
          currentAttempt: 0,
          bestScore: 0,
          quizCompleted: false,
        },
        canTakeQuiz: canTakeQuiz(),
        moduleQuizEnabled: module.quiz?.isEnabled || false,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user progress",
      error: error.message,
    });
  }
});

// POST /api/training/:id/quiz/attempt - Submit quiz attempt
router.post("/:id/quiz/attempt", authMiddleware, async (req, res) => {
  try {
    const moduleId = req.params.id;
    const userId = req.user.id;
    const attemptData = req.body;

    const module = await LearningModule.findById(moduleId);
    if (!module || !module.quiz?.isEnabled) {
      return res.status(404).json({
        success: false,
        message: "Module or quiz not found",
      });
    }

    // Find or create user progress
    let progress = await UserProgress.findOne({ userId, moduleId });
    if (!progress) {
      progress = new UserProgress({
        userId,
        moduleId,
        status: "in-progress",
      });
    }

    // Check daily attempts
    const today = new Date().toDateString();
    const todaysAttempts = progress.quizAttempts.filter(
      (attempt) => new Date(attempt.completedAt).toDateString() === today
    );

    const maxAttempts = module.quiz.maxAttempts || 3;
    if (todaysAttempts.length >= maxAttempts && !attemptData.passed) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${maxAttempts} attempts per day reached. Try again tomorrow.`,
      });
    }

    // Check if user already passed
    if (progress.quizCompleted) {
      return res.status(400).json({
        success: false,
        message: "You have already passed this quiz",
      });
    }

    // Add quiz attempt
    const attemptNumber = progress.quizAttempts.length + 1;
    const newAttempt = {
      attemptNumber,
      score: attemptData.score,
      correctAnswers: attemptData.correctAnswers,
      totalQuestions: attemptData.totalQuestions,
      timeSpent: attemptData.timeSpent,
      answers: attemptData.answers,
      passed: attemptData.passed,
      completedAt: new Date(),
    };

    progress.quizAttempts.push(newAttempt);
    progress.currentAttempt = attemptNumber;
    progress.lastQuizAttempt = new Date();

    // Update best score
    if (attemptData.score > progress.bestScore) {
      progress.bestScore = attemptData.score;
    }

    // Mark as completed if passed and required
    if (attemptData.passed) {
      progress.quizCompleted = true;
      progress.status = "completed";
      progress.completedAt = new Date();
      progress.progress = 100;

      // Update module completion stats
      module.employeesCompleted += 1;
      module.progress = Math.round(
        (module.employeesCompleted / module.totalEmployees) * 100
      );
    }

    progress.lastAccessedAt = new Date();
    await progress.save();
    await module.save();

    // Update quiz analytics
    await LearningModule.updateQuizAnalytics(moduleId);

    res.json({
      success: true,
      message: attemptData.passed ? "Quiz passed!" : "Quiz attempt saved",
      data: {
        attemptNumber: progress.currentAttempt,
        score: attemptData.score,
        passed: attemptData.passed,
        progress: progress.progress,
        bestScore: progress.bestScore,
        remainingAttempts: maxAttempts - (todaysAttempts.length + 1),
        quizCompleted: progress.quizCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error submitting quiz attempt",
      error: error.message,
    });
  }
});

// GET /api/training/:id/quiz/results - Get quiz results for a module
router.get("/:id/quiz/results", authMiddleware, async (req, res) => {
  try {
    const moduleId = req.params.id;
    const userId = req.user.id;

    const progress = await UserProgress.findOne({ userId, moduleId });
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "No quiz attempts found",
      });
    }

    // Calculate quiz stats
    const getQuizStats = () => {
      const stats = {
        totalAttempts: progress.quizAttempts?.length || 0,
        bestScore: progress.bestScore || 0,
        lastScore:
          progress.quizAttempts?.length > 0
            ? progress.quizAttempts[progress.quizAttempts.length - 1].score
            : 0,
        averageScore: 0,
        passed: progress.quizCompleted || false,
      };

      if (progress.quizAttempts?.length > 0) {
        const totalScore = progress.quizAttempts.reduce(
          (sum, attempt) => sum + attempt.score,
          0
        );
        stats.averageScore = Math.round(
          totalScore / progress.quizAttempts.length
        );
      }

      return stats;
    };

    const quizStats = getQuizStats();

    res.json({
      success: true,
      data: {
        attempts: progress.quizAttempts || [],
        stats: quizStats,
        totalAttempts: progress.quizAttempts?.length || 0,
        bestScore: progress.bestScore || 0,
        quizCompleted: progress.quizCompleted || false,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching quiz results",
      error: error.message,
    });
  }
});

// GET /api/training/:id/quiz/analytics - Get quiz analytics for admin
router.get(
  "/:id/quiz/analytics",
  authenticateAdmin,
  staffOnly,
  async (req, res) => {
    try {
      const moduleId = req.params.id;

      const module = await LearningModule.findById(moduleId);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }

      const allProgress = await UserProgress.find({ moduleId }).populate(
        "userId",
        "username firstName profileImage"
      );

      const analytics = {
        totalAttempts: module.quizAnalytics?.totalAttempts || 0,
        averageScore: module.quizAnalytics?.averageScore || 0,
        passRate: module.quizAnalytics?.passRate || 0,
        averageTimeSpent: module.quizAnalytics?.averageTimeSpent || 0,
        questionStatistics: module.quizAnalytics?.questionStatistics || [],
        userPerformance: allProgress.map((progress) => ({
          user: progress.userId,
          bestScore: progress.bestScore || 0,
          totalAttempts: progress.quizAttempts?.length || 0,
          lastAttempt:
            progress.quizAttempts?.[progress.quizAttempts?.length - 1]
              ?.completedAt,
          quizCompleted: progress.quizCompleted || false,
        })),
        moduleInfo: {
          title: module.title,
          totalQuestions: module.quiz?.questions?.length || 0,
          passingScore: module.quiz?.passingScore || 70,
          totalEnrolled: module.enrollment?.totalEnrolled || 0,
        },
      };

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching quiz analytics",
        error: error.message,
      });
    }
  }
);

// PUT /api/training/:id/quiz - Update module quiz settings (Admin only)
router.put("/:id/quiz", authenticateAdmin, staffOnly, async (req, res) => {
  try {
    const moduleId = req.params.id;
    const quizData = req.body;

    const module = await LearningModule.findById(moduleId);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Update quiz data
    module.quiz = {
      ...module.quiz,
      ...quizData,
      // Ensure questions array is preserved if not provided
      questions: quizData.questions || module.quiz?.questions || [],
    };

    // Calculate total points
    if (module.quiz.questions) {
      module.quiz.totalPoints = module.quiz.questions.reduce(
        (total, question) => {
          return total + (question.points || 1);
        },
        0
      );
    }

    await module.save();

    res.json({
      success: true,
      message: "Quiz updated successfully",
      data: module.quiz,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating quiz",
      error: error.message,
    });
  }
});

// Legacy quiz submission (for backward compatibility)
router.post("/:id/quiz", authMiddleware, async (req, res) => {
  try {
    const { answers } = req.body;
    const moduleId = req.params.id;
    const userId = req.user.id;

    const module = await LearningModule.findById(moduleId);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check if using new quiz system
    if (module.quiz?.isEnabled) {
      return res.status(400).json({
        success: false,
        message: "Please use the new quiz attempt endpoint",
      });
    }

    // Fallback to legacy quiz system
    if (!module.content.quiz || module.content.quiz.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found for this module",
      });
    }

    const progress = await UserProgress.findOne({ userId, moduleId });
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Not enrolled in this module",
      });
    }

    // Calculate score
    let correctAnswers = 0;
    const totalQuestions = module.content.quiz.length;

    module.content.quiz.forEach((question, index) => {
      if (answers[index] === question.correctAnswer) {
        correctAnswers++;
      }
    });

    const score = Math.round((correctAnswers / totalQuestions) * 100);

    // Save quiz result
    const attemptNumber = progress.quizScores.length + 1;
    progress.quizScores.push({
      attempt: attemptNumber,
      score,
      totalQuestions,
      correctAnswers,
      completedAt: new Date(),
    });

    // Update progress if quiz passed (assuming 70% is passing)
    if (score >= 70) {
      progress.progress = 100;
      progress.status = "completed";
      progress.completedAt = new Date();
    }

    await progress.save();

    res.json({
      success: true,
      message:
        score >= 70
          ? "Quiz passed! Module completed."
          : "Quiz completed. Try again to improve your score.",
      data: {
        score,
        correctAnswers,
        totalQuestions,
        passed: score >= 70,
        attempt: attemptNumber,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error submitting quiz",
      error: error.message,
    });
  }
});

// Toggle bookmark
router.post("/:id/bookmark", authMiddleware, async (req, res) => {
  try {
    const moduleId = req.params.id;
    const userId = req.user.id;

    let progress = await UserProgress.findOne({ userId, moduleId });

    if (!progress) {
      // Create progress record if doesn't exist
      progress = new UserProgress({
        userId,
        moduleId,
        status: "not-started",
      });
    }

    progress.bookmarked = !progress.bookmarked;
    await progress.save();

    res.json({
      success: true,
      message: progress.bookmarked ? "Module bookmarked" : "Bookmark removed",
      data: { bookmarked: progress.bookmarked },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error toggling bookmark",
      error: error.message,
    });
  }
});

// Get user's learning dashboard
router.get("/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's progress
    const userProgress = await UserProgress.find({ userId })
      .populate(
        "moduleId",
        "title coverImage category estimatedDuration rating quiz"
      )
      .sort({ lastAccessedAt: -1 });

    // Calculate statistics
    const stats = {
      totalEnrolled: userProgress.length,
      completed: userProgress.filter((p) => p.status === "completed").length,
      inProgress: userProgress.filter((p) => p.status === "in-progress").length,
      totalTimeSpent: userProgress.reduce((sum, p) => sum + p.timeSpent, 0),
      averageProgress:
        userProgress.length > 0
          ? Math.round(
              userProgress.reduce((sum, p) => sum + p.progress, 0) /
                userProgress.length
            )
          : 0,
      totalQuizzesTaken: userProgress.reduce(
        (sum, p) => sum + (p.quizAttempts?.length || 0),
        0
      ),
      quizzesPassed: userProgress.filter((p) => p.quizCompleted).length,
    };

    // Get bookmarked modules
    const bookmarked = userProgress.filter((p) => p.bookmarked);

    // Get recent activity
    const recentActivity = userProgress
      .filter((p) => p.lastAccessedAt)
      .sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt))
      .slice(0, 5);

    // Get recent quiz attempts
    const recentQuizAttempts = userProgress
      .filter((p) => p.quizAttempts && p.quizAttempts.length > 0)
      .flatMap((p) =>
        p.quizAttempts.map((attempt) => ({
          module: p.moduleId,
          score: attempt.score,
          passed: attempt.passed,
          completedAt: attempt.completedAt,
        }))
      )
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        stats,
        recentActivity,
        recentQuizAttempts,
        bookmarked,
        allProgress: userProgress,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user dashboard",
      error: error.message,
    });
  }
});

export default router;
