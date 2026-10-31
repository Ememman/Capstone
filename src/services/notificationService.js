// services/notificationService.js - FIXED VERSION
import Notification from "../models/Notification.js";

class NotificationService {
  // Activity Tracking Methods
  static async trackUserActivity(userId, activityType, data = {}) {
    try {
      const notificationData = {
        user: userId,
        type: activityType,
        data: data,
        priority: "low",
      };

      // Set specific titles and messages for different activities
      switch (activityType) {
        case "user_registered":
          notificationData.title = "Welcome to SandreaLee Salon!";
          notificationData.message =
            "Your account has been successfully created. Start exploring our services!";
          break;

        case "user_logged_in":
          notificationData.title = "Login Successful";
          notificationData.message =
            "You have successfully logged into your account.";
          break;

        case "password_changed":
          notificationData.title = "Password Updated";
          notificationData.message =
            "Your password has been changed successfully.";
          notificationData.priority = "high";
          break;

        case "profile_updated":
          notificationData.title = "Profile Updated";
          notificationData.message =
            "Your profile information has been updated successfully.";
          break;

        case "profile_picture_updated":
          notificationData.title = "Profile Picture Updated";
          notificationData.message =
            "Your profile picture has been updated successfully.";
          break;

        case "product_purchased":
          notificationData.title = "Purchase Completed";
          notificationData.message = `You purchased ${
            data.productName || "a product"
          } for ₱${data.amount || "0"}.`;
          notificationData.relatedEntity = {
            type: "product",
            id: data.productId,
          };
          notificationData.actionUrl = `/orders/${data.orderId}`;
          break;

        case "service_booked":
          notificationData.title = "Service Booked";
          notificationData.message = `You booked ${
            data.serviceName || "a service"
          } for ${data.date || "an upcoming date"}.`;
          notificationData.relatedEntity = {
            type: "service",
            id: data.serviceId,
          };
          notificationData.actionUrl = `/bookings/${data.bookingId}`;
          break;

        case "order_created":
          notificationData.title = "Order Placed";
          notificationData.message = `Your order #${data.orderNumber} has been placed successfully.`;
          notificationData.relatedEntity = {
            type: "order",
            id: data.orderId,
          };
          notificationData.actionUrl = `/orders/${data.orderId}`;
          break;

        case "booking_created":
          notificationData.title = "Booking Created";
          notificationData.message = `Your booking for ${data.serviceName} has been created.`;
          notificationData.relatedEntity = {
            type: "booking",
            id: data.bookingId,
          };
          notificationData.actionUrl = `/bookings/${data.bookingId}`;
          break;

        case "appointment_scheduled":
          notificationData.title = "Appointment Scheduled";
          notificationData.message = `Your appointment for ${data.serviceName} is scheduled for ${data.date}.`;
          notificationData.relatedEntity = {
            type: "appointment",
            id: data.appointmentId,
          };
          notificationData.actionUrl = `/appointments/${data.appointmentId}`;
          break;

        case "rating_submitted":
          notificationData.title = "Rating Submitted";
          notificationData.message = `Thank you for rating ${
            data.entityName || "the service"
          }!`;
          // FIX: Don't reference rating model directly
          notificationData.relatedEntity = {
            type: "rating",
            id: data.ratingId,
          };
          break;

        default:
          notificationData.title = "Activity Recorded";
          notificationData.message = "Your activity has been recorded.";
      }

      const notification = await Notification.createNotification(
        notificationData
      );
      console.log(`✅ Activity tracked: ${activityType} for user ${userId}`);

      // Real-time WebSocket emission to web and mobile clients
      if (typeof global !== "undefined" && global.io) {
        global.io.to(`user-${userId}`).emit("new_notification", notification);
        global.io.to(`customer-${userId}`).emit("new_notification", notification);
        global.io.to("admin-dashboard").emit("dashboard-update", {
          type: "notification",
          action: activityType,
          data: notification,
          timestamp: new Date().toISOString(),
        });
      }
      return notification;
    } catch (error) {
      console.error("❌ Error tracking user activity:", error);
      throw error;
    }
  }

  // Bulk activity tracking for multiple events
  static async trackMultipleActivities(userId, activities) {
    try {
      const notifications = [];
      for (const activity of activities) {
        const notification = await this.trackUserActivity(
          userId,
          activity.type,
          activity.data
        );
        notifications.push(notification);
      }
      return notifications;
    } catch (error) {
      console.error("❌ Error tracking multiple activities:", error);
      throw error;
    }
  }

  // FIXED: Get user activity feed with error handling
  static async getUserActivityFeed(userId, options = {}) {
    try {
      console.log(`📋 Getting activity feed for user: ${userId}`);

      // Use the fixed method from Notification model
      const result = await Notification.getUserNotifications(userId, options);

      console.log(
        `✅ Retrieved ${result.notifications.length} notifications for user ${userId}`
      );
      return result;
    } catch (error) {
      console.error("❌ Error getting user activity feed:", error);
      // Return empty result instead of throwing error
      return {
        notifications: [],
        pagination: {
          page: options.page || 1,
          limit: options.limit || 20,
          total: 0,
          pages: 0,
        },
        unreadCount: 0,
      };
    }
  }

  // FIXED: Get unread activity count with error handling
  static async getUnreadActivityCount(userId) {
    try {
      return await Notification.countDocuments({
        user: userId,
        isRead: false,
      });
    } catch (error) {
      console.error("❌ Error getting unread activity count:", error);
      return 0; // Return 0 instead of throwing error
    }
  }
}

export default NotificationService;
