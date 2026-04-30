// routes/notificationRoutes.js - FIXED VERSION
import express from "express";
import Notification from "../models/Notification.js";
import NotificationService from "../services/notificationService.js";
import { authMiddleware, staffOnly } from "../middleware/auth.js";

const router = express.Router();

// @route   GET /api/notifications
// @desc    Get user notifications/activities
// @access  Private
router.get("/", authMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === "true",
      types: type ? [type] : [],
      sortBy,
      sortOrder,
    };

    // FIX: Use service with error handling
    let result;
    try {
      result = await NotificationService.getUserActivityFeed(
        req.user._id,
        options
      );
    } catch (serviceError) {
      console.error("Notification service error:", serviceError);
      // Fallback to direct query if service fails
      const query = { user: req.user._id };

      if (unreadOnly === "true") {
        query.isRead = false;
      }

      if (type) {
        query.type = type;
      }

      const skip = (options.page - 1) * options.limit;

      const notifications = await Notification.find(query)
        .select("title message type isRead priority createdAt data")
        .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
        .skip(skip)
        .limit(options.limit);

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({
        user: req.user._id,
        isRead: false,
      });

      result = {
        notifications,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit),
        },
        unreadCount,
      };
    }

    res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: result.notifications,
      pagination: result.pagination,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving notifications",
      error: error.message,
    });
  }
});

// @route   GET /api/notifications/stats
// @desc    Get notification statistics
// @access  Private
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments({
      user: req.user._id,
    });

    const unreadCount = await NotificationService.getUnreadActivityCount(
      req.user._id
    );

    // Count by type
    const typeCounts = await Notification.aggregate([
      {
        $match: { user: req.user._id },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const typeBreakdown = typeCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        total: totalNotifications,
        unread: unreadCount,
        read: totalNotifications - unreadCount,
        typeBreakdown,
      },
    });
  } catch (error) {
    console.error("Error getting notification stats:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving notification statistics",
      error: error.message,
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
router.put("/:id/read", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Check if user owns this notification
    if (notification.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await notification.markAsRead();

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking notification as read",
      error: error.message,
    });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put("/read-all", authMiddleware, async (req, res) => {
  try {
    await Notification.markAllAsRead(req.user._id);

    const unreadCount = await NotificationService.getUnreadActivityCount(
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking all notifications as read",
      error: error.message,
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Check if user owns this notification
    if (notification.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await Notification.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notification",
      error: error.message,
    });
  }
});

// @route   DELETE /api/notifications
// @desc    Delete all notifications for user
// @access  Private
router.delete("/", authMiddleware, async (req, res) => {
  try {
    const { type, readOnly } = req.query;

    const query = { user: req.user._id };

    if (readOnly === "true") {
      query.isRead = true;
    }

    if (type) {
      query.type = type;
    }

    await Notification.deleteMany(query);

    const remainingCount = await Notification.countDocuments({
      user: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Notifications deleted successfully",
      data: {
        remainingCount,
      },
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notifications",
      error: error.message,
    });
  }
});

// @route   GET /api/notifications/admin/activities
// @desc    Get all activities (admin only)
// @access  Private (Staff only)
router.get("/admin/activities", authMiddleware, staffOnly, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      type,
      startDate,
      endDate,
    } = req.query;

    const query = {};

    if (userId) {
      query.user = userId;
    }

    if (type) {
      query.type = type;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    // FIX: Remove problematic populate
    const activities = await Notification.find(query)
      .select("title message type isRead priority createdAt user data")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    // Get activity statistics
    const activityStats = await Notification.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          lastActivity: { $max: "$createdAt" },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Activities retrieved successfully",
      data: {
        activities,
        statistics: activityStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting admin activities:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving activities",
      error: error.message,
    });
  }
});

export default router;
