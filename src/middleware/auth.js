// middleware/auth.js - ENHANCED for Salon Staff functionality
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
    return jwt.verify(token, process.env.JWT_SECRET || "sandrea_lee_salon_jwt_super_secret_key_2026");
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

// Main authentication middleware - requires valid token
export const authMiddleware = async (req, res, next) => {
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

    // Get user from database - FIXED: Use decoded.userId
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      console.error(
        `User not found for ID: ${decoded.userId}, Token: ${token}`
      );
      return res.status(404).json({
        success: false,
        message: "User not found.",
        error: "USER_NOT_FOUND",
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

    // ✅ NEW: Update last activity for staff/admin users
    if (user.role === "salon_staff" || user.role === "admin") {
      try {
        user.lastActivity = new Date();
        await user.save({ validateBeforeSave: false });
        console.log(`✅ Updated activity for ${user.role}: ${user.username}`);
      } catch (activityError) {
        console.warn("Could not update user activity:", activityError.message);
      }
    }

    // Attach user to request object
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message, error.stack);
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

// Optional authentication middleware - doesn't require token but validates if present
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    // If no token, continue without user
    if (!token) {
      req.user = null;
      return next();
    }

    // Verify token if present
    const decoded = verifyToken(token);

    // Get user from database - FIXED: Use decoded.userId
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      console.warn(
        `Optional auth: User not found for ID: ${decoded.userId}, Token: ${token}`
      );
      req.user = null;
      return next();
    }

    // Check if account is locked
    if (user.isAccountLocked && user.isAccountLocked()) {
      req.user = null;
      return next();
    }

    // ✅ NEW: Update last activity for staff/admin users (optional auth)
    if (user.role === "salon_staff" || user.role === "admin") {
      try {
        user.lastActivity = new Date();
        await user.save({ validateBeforeSave: false });
      } catch (activityError) {
        console.warn("Could not update user activity:", activityError.message);
      }
    }

    // Attach user to request object
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    console.warn("Optional auth warning:", error.message, error.stack);
    req.user = null;
    next();
  }
};

// Role-based middleware - requires specific roles
export const requireRole = (...allowedRoles) => {
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

// Customer only middleware
export const customerOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please login as a customer.",
      error: "NO_AUTH",
    });
  }

  if (req.user.role !== "customer") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Customer account required.",
      error: "CUSTOMER_ONLY",
      userRole: req.user.role,
    });
  }

  next();
};

// Staff only middleware (ENHANCED for Salon Staff)
export const staffOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please login as staff.",
      error: "NO_AUTH",
    });
  }

  if (req.user.role !== "salon_staff") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Staff account required.",
      error: "STAFF_ONLY",
      userRole: req.user.role,
    });
  }

  // ✅ NEW: Check if staff account is active
  if (req.user.isActive === false) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Staff account is deactivated.",
      error: "ACCOUNT_DEACTIVATED",
    });
  }

  next();
};

// Admin middleware (ENHANCED)
export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please login as admin.",
      error: "NO_AUTH",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin account required.",
      error: "ADMIN_ONLY",
      userRole: req.user.role,
    });
  }

  next();
};

// ✅ NEW: Staff or Admin middleware (for shared functionality)
export const staffOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication required.",
      error: "NO_AUTH",
    });
  }

  if (!["salon_staff", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Staff or admin account required.",
      error: "STAFF_OR_ADMIN_ONLY",
      userRole: req.user.role,
    });
  }

  next();
};

// ✅ NEW: Customer or Staff middleware (for some shared features)
export const customerOrStaff = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication required.",
      error: "NO_AUTH",
    });
  }

  if (!["customer", "salon_staff"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Customer or staff account required.",
      error: "CUSTOMER_OR_STAFF_ONLY",
      userRole: req.user.role,
    });
  }

  next();
};

// Account status verification middleware
export const requireActiveAccount = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
      error: "NO_AUTH",
    });
  }

  // Check if account is locked
  if (req.user.isAccountLocked && req.user.isAccountLocked()) {
    const lockTimeRemaining = req.user.security?.lockUntil
      ? Math.ceil((req.user.security.lockUntil - new Date()) / (1000 * 60))
      : 0;

    return res.status(423).json({
      success: false,
      message: "Account is temporarily locked.",
      error: "ACCOUNT_LOCKED",
      lockUntil: req.user.security?.lockUntil,
      minutesRemaining: lockTimeRemaining,
    });
  }

  // Check if password change is required
  if (req.user.security?.requirePasswordChange) {
    return res.status(403).json({
      success: false,
      message: "Password change required.",
      error: "PASSWORD_CHANGE_REQUIRED",
    });
  }

  // ✅ NEW: Check if staff account is active
  if (req.user.role === "salon_staff" && req.user.isActive === false) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Staff account is deactivated.",
      error: "ACCOUNT_DEACTIVATED",
    });
  }

  next();
};

// Rate limiting middleware (basic implementation)
const loginAttempts = new Map();

export const rateLimitAuth = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    // Clean old entries
    for (const [key, data] of loginAttempts.entries()) {
      if (now - data.firstAttempt > windowMs) {
        loginAttempts.delete(key);
      }
    }

    // Check current attempts
    const attempts = loginAttempts.get(identifier);

    if (attempts && attempts.count >= maxAttempts) {
      const timeLeft = windowMs - (now - attempts.firstAttempt);
      return res.status(429).json({
        success: false,
        message: "Too many authentication attempts. Please try again later.",
        error: "RATE_LIMITED",
        retryAfter: Math.ceil(timeLeft / 1000),
      });
    }

    // Record attempt
    if (attempts) {
      attempts.count++;
    } else {
      loginAttempts.set(identifier, {
        count: 1,
        firstAttempt: now,
      });
    }

    next();
  };
};

// Token refresh middleware
export const refreshTokenIfNeeded = async (req, res, next) => {
  if (!req.user || !req.token) {
    return next();
  }

  try {
    const decoded = jwt.decode(req.token);
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;

    // If token expires in less than 1 hour, generate a new one
    if (timeUntilExpiry < 3600) {
      // FIXED: Use userId instead of id
      const newToken = jwt.sign(
        { userId: req.user._id, role: req.user.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Add new token to response headers
      res.set("X-New-Token", newToken);

      // Also set cookie if original token came from cookie
      if (req.cookies && req.cookies.token) {
        res.cookie("token", newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
      }
    }

    next();
  } catch (error) {
    // If token refresh fails, continue with original token
    console.warn("Token refresh warning:", error.message);
    next();
  }
};

// Middleware to check JWT secret configuration
export const validateJWTConfig = (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET environment variable is not set");
    return res.status(500).json({
      success: false,
      message: "Authentication service unavailable",
      error: "CONFIG_ERROR",
    });
  }

  if (process.env.JWT_SECRET.length < 32) {
    console.warn(
      "JWT_SECRET should be at least 32 characters long for security"
    );
  }

  next();
};

// ✅ NEW: Online status check for staff/admin
export const checkOnlineStatus = async (req, res, next) => {
  if (!req.user || !["salon_staff", "admin"].includes(req.user.role)) {
    return next();
  }

  try {
    // Check if user was active in the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isOnline =
      req.user.lastActivity && req.user.lastActivity > fifteenMinutesAgo;

    // Attach online status to request
    req.user.isOnline = isOnline;

    next();
  } catch (error) {
    console.warn("Online status check failed:", error.message);
    req.user.isOnline = false;
    next();
  }
};

// ✅ NEW: Permission-based middleware for staff features
export const requireStaffPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== "salon_staff") {
      return res.status(403).json({
        success: false,
        message: "Staff access required.",
        error: "STAFF_ACCESS_REQUIRED",
      });
    }

    // Define staff permissions based on position/role
    const staffPermissions = {
      // Basic permissions for all staff
      basic: ["view_appointments", "clock_in_out", "view_learning_modules"],

      // Senior stylist permissions
      senior: ["manage_appointments", "train_junior_staff", "approve_work"],

      // Manager permissions
      manager: ["manage_staff", "view_reports", "manage_inventory"],
    };

    // Check if user has the required permission
    let userPermissions = staffPermissions.basic;

    if (req.user.position?.toLowerCase().includes("manager")) {
      userPermissions = [
        ...userPermissions,
        ...staffPermissions.manager,
        ...staffPermissions.senior,
      ];
    } else if (req.user.position?.toLowerCase().includes("senior")) {
      userPermissions = [...userPermissions, ...staffPermissions.senior];
    }

    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${permission}`,
        error: "INSUFFICIENT_PERMISSIONS",
        userPosition: req.user.position,
        requiredPermission: permission,
      });
    }

    next();
  };
};

// ✅ NEW: GPS location validation middleware for attendance
export const validateLocation = (req, res, next) => {
  const { latitude, longitude } = req.body;

  if (!latitude || !longitude) {
    return res.status(400).json({
      success: false,
      message: "Location coordinates (latitude and longitude) are required.",
      error: "LOCATION_REQUIRED",
    });
  }

  // Validate coordinate ranges
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({
      success: false,
      message: "Invalid location coordinates provided.",
      error: "INVALID_COORDINATES",
    });
  }

  next();
};

// ✅ NEW: Guest access middleware (for guest users)
export const guestOrAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      // No token, treat as guest
      req.user = null;
      req.isGuest = true;
      return next();
    }

    // Verify token if present
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      req.user = null;
      req.isGuest = true;
      return next();
    }

    req.user = user;
    req.token = token;
    req.isGuest = user.isGuest || false;

    next();
  } catch (error) {
    console.warn("Guest or auth warning:", error.message);
    req.user = null;
    req.isGuest = true;
    next();
  }
};

// ✅ NEW: Registration completion check
export const requireRegistrationComplete = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
      error: "NO_AUTH",
    });
  }

  if (req.user.registrationStep !== "completed" && !req.user.isGuest) {
    return res.status(403).json({
      success: false,
      message:
        "Please complete your registration before accessing this feature.",
      error: "REGISTRATION_INCOMPLETE",
      currentStep: req.user.registrationStep,
    });
  }

  next();
};

// Alias for backward compatibility
export const protect = authMiddleware;

export default {
  authMiddleware,
  optionalAuth,
  requireRole,
  customerOnly,
  staffOnly,
  adminOnly,
  staffOrAdmin,
  customerOrStaff,
  requireActiveAccount,
  rateLimitAuth,
  refreshTokenIfNeeded,
  validateJWTConfig,
  checkOnlineStatus,
  requireStaffPermission,
  validateLocation,
  guestOrAuth,
  requireRegistrationComplete,
  protect,
};
