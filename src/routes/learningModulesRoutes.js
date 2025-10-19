import express from "express";
import { LearningModule, UserProgress } from "../models/LearningModules.js";
import { authMiddleware } from "../middleware/auth.js";

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
    } = req.query;

    const query = { isActive: true };
    let sort = { createdAt: -1 };

    // Apply filters
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (minRating)
      query["rating.average"] = { $gte: Number.parseFloat(minRating) };
    if (featured === "true") query.isFeatured = true;

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
              }
            : null,
          completionRate: module.getCompletionRate(),
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
    const modules = await LearningModule.getFeaturedModules();

    const modulesWithProgress = await Promise.all(
      modules.map(async (module) => {
        const progress = await UserProgress.findOne({
          userId: req.user.id,
          moduleId: module._id,
        });

        return {
          ...module.toObject(),
          userProgress: progress,
          completionRate: module.getCompletionRate(),
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
        completionRate: module.getCompletionRate(),
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
      data: progress,
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

// Submit quiz
router.post("/:id/quiz", authMiddleware, async (req, res) => {
  try {
    const { answers } = req.body;
    const moduleId = req.params.id;
    const userId = req.user.id;

    const module = await LearningModule.findById(moduleId);
    if (!module || !module.content.quiz || module.content.quiz.length === 0) {
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
      progress = new UserProgress({ userId, moduleId });
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
        "title coverImage category estimatedDuration rating"
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
    };

    // Get bookmarked modules
    const bookmarked = userProgress.filter((p) => p.bookmarked);

    // Get recent activity
    const recentActivity = userProgress
      .filter((p) => p.lastAccessedAt)
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        stats,
        recentActivity,
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
