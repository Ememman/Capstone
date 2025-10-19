// middleware/auth.js
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

// Staff only middleware (for backward compatibility)
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

  next();
};

// Admin middleware (for backward compatibility)
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

export const protect = authMiddleware;

export default {
  authMiddleware,
  optionalAuth,
  requireRole,
  customerOnly,
  staffOnly,
  adminOnly,
  requireActiveAccount,
  rateLimitAuth,
  refreshTokenIfNeeded,
  validateJWTConfig,
  protect,
};
