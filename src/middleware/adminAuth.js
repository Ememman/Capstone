// middleware/adminAuth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Helper function to extract token from request
const extractToken = (req) => {
  let token = null;

  // Check Authorization header (Bearer token)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  // Check cookies (for web sessions)
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // Check x-auth-token header (alternative method)
  else if (req.headers["x-auth-token"]) {
    token = req.headers["x-auth-token"];
  }

  return token;
};

// Helper function to verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token expired");
    } else if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    } else {
      throw new Error("Token verification failed");
    }
  }
};

// 🤖 ACTIVITY TRACKING MIDDLEWARE
export const trackAdminActivity = async (req, res, next) => {
  if (
    req.user &&
    (req.user.role === "admin" || req.user.role === "salon_staff")
  ) {
    try {
      // Update lastActivity timestamp
      req.user.lastActivity = new Date();
      await req.user.save({ validateBeforeSave: false });
      console.log(
        `🔄 Activity tracked for ${req.user.username} (${req.user.role})`
      );
    } catch (error) {
      console.error("❌ Error tracking admin activity:", error.message);
      // Don't block the request if activity tracking fails
    }
  }
  next();
};

// Main admin authentication middleware - requires valid token and admin/staff role
export const authenticateAdmin = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
        error: "NO_TOKEN",
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
    }

    // Check if user is admin or salon staff
    if (!["admin", "salon_staff"].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or staff privileges required.",
        error: "INSUFFICIENT_PERMISSIONS",
      });
    }

    // Check if staff is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated. Please contact administrator.",
        error: "ACCOUNT_DEACTIVATED",
      });
    }

    // Check if account is locked
    if (user.isAccountLocked && user.isAccountLocked()) {
      return res.status(423).json({
        success: false,
        message:
          "Account is temporarily locked due to multiple failed login attempts.",
        error: "ACCOUNT_LOCKED",
        lockUntil: user.security?.lockUntil,
      });
    }

    // Check if user needs to change password
    if (user.security?.requirePasswordChange) {
      return res.status(403).json({
        success: false,
        message: "Password change required before accessing this resource.",
        error: "PASSWORD_CHANGE_REQUIRED",
      });
    }

    req.user = user;
    req.token = token;

    // 🤖 AUTOMATICALLY TRACK ACTIVITY
    // Update lastActivity for admin/staff
    user.lastActivity = new Date();
    await user.save({ validateBeforeSave: false });

    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error.message);

    let statusCode = 401;
    let errorCode = "AUTH_ERROR";
    let message = "Authentication failed";

    if (error.message === "Token expired") {
      statusCode = 401;
      errorCode = "TOKEN_EXPIRED";
      message = "Token has expired. Please login again.";
    } else if (error.message === "Invalid token") {
      statusCode = 401;
      errorCode = "INVALID_TOKEN";
      message = "Invalid authentication token.";
    }

    res.status(statusCode).json({
      success: false,
      message,
      error: errorCode,
    });
  }
};

// Staff only middleware (for both admin and salon_staff)
export const staffOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Authentication required.",
        error: "NO_AUTH",
      });
    }

    if (!["admin", "salon_staff"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Staff or admin privileges required.",
        error: "STAFF_ONLY",
        userRole: req.user.role,
      });
    }

    next();
  } catch (error) {
    console.error("Staff only middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during authorization check",
      error: "SERVER_ERROR",
    });
  }
};

// Admin only middleware (strictly for admin role)
export const adminOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Authentication required.",
        error: "NO_AUTH",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
        error: "ADMIN_ONLY",
        userRole: req.user.role,
      });
    }

    next();
  } catch (error) {
    console.error("Admin only middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during authorization check",
      error: "SERVER_ERROR",
    });
  }
};

// Role-based middleware for admin routes
export const requireAdminRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Authentication required.",
        error: "NO_AUTH",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
        error: "INSUFFICIENT_PERMISSIONS",
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }

    next();
  };
};

export default {
  authenticateAdmin,
  trackAdminActivity,
  staffOnly,
  adminOnly,
  requireAdminRole,
};
