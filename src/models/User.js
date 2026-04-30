// models/User.js - COMPLETE UPDATED VERSION with FIXED delay system
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Validates password strength based on defined criteria.
 * @param {string} password - The password to validate.
 * @returns {Object} Validation result with isValid, strength, color, score, checks, and message.
 */
const validatePasswordStrength = (password) => {
  if (!password) {
    return {
      isValid: false,
      strength: "invalid",
      message: "Password is required",
    };
  }

  const checks = {
    length: password.length >= 8 && password.length <= 128,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password),
  };

  // Base requirement: length + uppercase + lowercase
  if (!checks.length || !checks.lowercase || !checks.uppercase) {
    return {
      isValid: false,
      strength: "invalid",
      color: "red",
      score: 0,
      checks,
      message:
        "Password must be 8-128 characters with uppercase and lowercase letters",
    };
  }

  let score = 1;
  let strength = "weak";
  let color = "red";

  // Medium strength: has number
  if (checks.number) {
    score += 1;
    strength = "medium";
    color = "yellow";
  }

  // Strong: has symbol
  if (checks.symbol) {
    score += 1;
    strength = "strong";
    color = "green";
  }

  return {
    isValid: true,
    strength,
    color,
    score,
    checks,
    message: getStrengthMessage(strength),
  };
};

/**
 * Returns a user-friendly message based on password strength.
 * @param {string} strength - The calculated strength level.
 * @returns {string} Descriptive message for the strength level.
 */
const getStrengthMessage = (strength) => {
  switch (strength) {
    case "weak":
      return "Weak password - Add numbers and symbols for better security";
    case "medium":
      return "Medium password - Add symbols for strong security";
    case "strong":
      return "Strong password - Great security!";
    default:
      return "Invalid password";
  }
};

const userSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [7, "Username must be at least 7 characters"],
      maxlength: [20, "Username cannot exceed 20 characters"],
      match: [
        /^[a-zA-Z0-9._-]+$/,
        "Username can only contain letters, numbers, dots, underscores, and hyphens",
      ],
    },
    firstName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([-.]?\w+)*@\w+([-.]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
      unique: true,
      sparse: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      validate: {
        validator: (v) => v && v.length === 11 && /^\d{11}$/.test(v),
        message: "Phone number must be 11 digits",
      },
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      // REMOVED maxlength constraint for hashed passwords
      validate: {
        validator: function (password) {
          // Skip validation for social auth and temp users
          if (this.authProvider && this.authProvider !== "local") return true;
          if (
            this.email?.includes("@temp.com") &&
            this.username?.includes("temp_")
          )
            return true;

          // For admin creation during setup, skip validation
          if (this.role === "admin" && this.isNew) return true;

          return validatePasswordStrength(password).isValid;
        },
        message: (props) => validatePasswordStrength(props.value).message,
      },
    },
    profileImage: {
      type: String,
      default: "", // Path or URL to profile image
    },
    role: {
      type: String,
      enum: ["admin", "customer", "salon_staff"],
      default: "customer",
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local",
    },
    verification: {
      phoneVerified: { type: Boolean, default: false },
      emailVerified: { type: Boolean, default: false },
      phoneOTP: {
        code: String,
        expiresAt: Date,
        attempts: { type: Number, default: 0 },
        lastSent: Date,
      },
      emailOTP: {
        code: String,
        expiresAt: Date,
        attempts: { type: Number, default: 0 },
        lastSent: Date,
      },
    },
    registrationStep: {
      type: String,
      enum: ["phone_verification", "profile_setup", "email_setup", "completed"],
      default: "phone_verification",
    },
    passwordStrength: {
      strength: {
        type: String,
        enum: ["weak", "medium", "strong"],
        default: "weak",
      },
      score: { type: Number, min: 0, max: 3, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
    },
    security: {
      failedLoginAttempts: { type: Number, default: 0 },
      lastFailedLogin: Date,
      nextAllowedLogin: Date,
      delaySeconds: { type: Number, default: 0 },
      accountLocked: { type: Boolean, default: false },
      lockUntil: Date,
      passwordChangedAt: { type: Date, default: Date.now },
      requirePasswordChange: { type: Boolean, default: false },
      resetPasswordToken: String,
      resetPasswordExpires: Date,
      resetPasswordAttempts: { type: Number, default: 0 },
      lastResetRequest: Date,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    isGuest: {
      type: Boolean,
      default: false,
      index: true,
    },
    staffId: {
      type: String,
      required: function () {
        return this.role === "salon_staff";
      },
      unique: true,
      sparse: true,
    },
    adminId: {
      type: String,
      required: function () {
        return this.role === "admin";
      },
      unique: true,
      sparse: true,
    },
    position: {
      type: String,
      required: function () {
        return this.role === "salon_staff" || this.role === "admin";
      },
      default: function () {
        if (this.role === "salon_staff") return "Stylist";
        if (this.role === "admin") return "Administrator";
        return undefined;
      },
    },
    hireDate: {
      type: Date,
      required: function () {
        return this.role === "salon_staff" || this.role === "admin";
      },
      default: function () {
        return this.role === "salon_staff" || this.role === "admin"
          ? new Date()
          : undefined;
      },
    },
    lastLogin: {
      type: Date,
    },
    // ✅ NEW: Activity tracking for auto-approval system
    lastActivity: {
      type: Date,
      index: true, // For efficient queries
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance (optimized for stylistsRoutes.js queries)
userSchema.index({ role: 1, isActive: 1 }); // For stylistsRoutes.js query
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ staffId: 1 });
userSchema.index({ adminId: 1 });
userSchema.index({ "security.resetPasswordToken": 1 });
// ✅ NEW: Composite index for efficient admin online checks
userSchema.index({ role: 1, lastActivity: 1 });

/**
 * Pre-save hook to hash password and update security fields.
 */
userSchema.pre("save", async function (next) {
  try {
    const isTempUser =
      this.email?.includes("@temp.com") && this.username?.includes("temp_");

    // Skip password processing if password not modified or temp user
    if (!this.isModified("password") || isTempUser) return next();

    // For admin creation during initial setup, skip validation but still hash
    const isAdminSetup = this.role === "admin" && this.isNew;

    if (
      (!this.authProvider || this.authProvider === "local") &&
      !isAdminSetup
    ) {
      const strengthCheck = validatePasswordStrength(this.password);
      if (!strengthCheck.isValid) {
        const error = new Error(strengthCheck.message);
        error.name = "ValidationError";
        return next(error);
      }
      this.passwordStrength = {
        strength: strengthCheck.strength,
        score: strengthCheck.score,
        lastUpdated: new Date(),
      };
    }

    // Always hash the password if it's modified
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);

    this.security.passwordChangedAt = new Date();
    this.security.failedLoginAttempts = 0;
    this.security.nextAllowedLogin = undefined;
    this.security.delaySeconds = 0;
    this.security.accountLocked = false;
    this.security.lockUntil = undefined;
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ FIXED: Compares a candidate password with the stored hash.
 * @param {string} candidatePassword - The password to compare.
 * @returns {Promise<boolean>} True if passwords match.
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    if (!this.password) {
      console.log("❌ No password hash found for user:", this.username);
      return false;
    }

    console.log("🔐 Comparing password for user:", this.username);
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log("✅ Password comparison result:", isMatch);
    return isMatch;
  } catch (error) {
    console.error("❌ Error comparing passwords:", error);
    return false;
  }
};

/**
 * Checks password strength for a given password.
 * @param {string} password - The password to check.
 * @returns {Object} Validation result.
 */
userSchema.methods.checkPasswordStrength = validatePasswordStrength;

// ✅ FIXED: Updated handleFailedLogin method to match route logic
userSchema.methods.handleFailedLogin = async function () {
  try {
    console.log("🔐 Handling failed login for user:", this.username);

    this.security.failedLoginAttempts =
      (this.security.failedLoginAttempts || 0) + 1;
    this.security.lastFailedLogin = new Date();

    const attempts = this.security.failedLoginAttempts;
    let delaySeconds = 0;

    // ✅ FIXED: Match the same logic as the route helper
    if (attempts === 4) {
      delaySeconds = 10;
    } else if (attempts === 8) {
      delaySeconds = 15;
    } else if (attempts >= 9) {
      const additionalDelays = [20, 25, 30, 40, 50, 60];
      const delayIndex = Math.min(attempts - 9, additionalDelays.length - 1);
      delaySeconds = additionalDelays[delayIndex];
    } else {
      delaySeconds = 0;
    }

    this.security.delaySeconds = delaySeconds;

    if (delaySeconds > 0) {
      this.security.nextAllowedLogin = new Date(
        Date.now() + delaySeconds * 1000
      );
      console.log(
        `⏰ Failed attempt ${attempts}, delay set to ${delaySeconds}s`
      );
    } else {
      this.security.nextAllowedLogin = undefined;
      console.log(`⚠️ Failed attempt ${attempts}, no delay applied`);
    }

    await this.save({ validateBeforeSave: false });
  } catch (error) {
    console.error("❌ Error handling failed login:", error);
  }
};

/**
 * ✅ FIXED: Resets security fields and updates activity on successful login.
 * @returns {Promise<void>}
 */
userSchema.methods.handleSuccessfulLogin = async function () {
  try {
    console.log("✅ Handling successful login for user:", this.username);

    this.lastLogin = new Date();

    // ✅ Update activity for admin/staff users
    if (this.role === "admin" || this.role === "salon_staff") {
      this.lastActivity = new Date();
    }

    // Reset security fields
    if (this.security.failedLoginAttempts > 0) {
      this.security.failedLoginAttempts = 0;
      this.security.lastFailedLogin = undefined;
      this.security.nextAllowedLogin = undefined;
      this.security.delaySeconds = 0;
      this.security.accountLocked = false;
      this.security.lockUntil = undefined;
    }

    await this.save({ validateBeforeSave: false });
    console.log("✅ Login security fields reset successfully");
  } catch (error) {
    console.error("❌ Error handling successful login:", error);
  }
};

/**
 * ✅ NEW: Updates the lastActivity timestamp for admin/staff users.
 * Used by middleware to track admin online status.
 * @returns {Promise<void>}
 */
userSchema.methods.updateActivity = async function () {
  try {
    if (this.role === "admin" || this.role === "salon_staff") {
      this.lastActivity = new Date();
      await this.save({ validateBeforeSave: false });
    }
  } catch (error) {
    console.error("❌ Error updating activity:", error);
  }
};

/**
 * ✅ FIXED: Checks if the account is locked.
 * @returns {boolean} True if account is locked.
 */
userSchema.methods.isAccountLocked = function () {
  const now = new Date();

  // Check if account is locked until a certain time
  if (this.security.accountLocked && this.security.lockUntil > now) {
    return true;
  }

  // Check if there's an active delay from failed attempts
  if (this.security.nextAllowedLogin && this.security.nextAllowedLogin > now) {
    return true;
  }

  return false;
};

/**
 * ✅ FIXED: Gets remaining lockout time in seconds.
 * @returns {number} Remaining seconds.
 */
userSchema.methods.getRemainingDelayTime = function () {
  const now = new Date();

  if (this.security.nextAllowedLogin && this.security.nextAllowedLogin > now) {
    return Math.ceil((this.security.nextAllowedLogin - now) / 1000);
  }

  if (this.security.lockUntil && this.security.lockUntil > now) {
    return Math.ceil((this.security.lockUntil - now) / 1000);
  }

  return 0;
};

/**
 * ✅ FIXED: Checks if forgot password should be recommended.
 * @returns {boolean} True if recommended.
 */
userSchema.methods.shouldRecommendForgotPassword = function () {
  return this.security.failedLoginAttempts >= 6;
};

/**
 * ✅ FIXED: Generates a password reset token.
 * @returns {string} The reset token.
 */
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.security.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.security.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  this.security.lastResetRequest = new Date();
  this.security.resetPasswordAttempts = 0;

  console.log("🔐 Generated password reset token for user:", this.username);
  return resetToken;
};

/**
 * ✅ FIXED: Verifies a password reset token.
 * @param {string} token - The token to verify.
 * @returns {boolean} True if valid.
 */
userSchema.methods.verifyPasswordResetToken = function (token) {
  try {
    if (!token || !this.security.resetPasswordToken) {
      return false;
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const isValid =
      this.security.resetPasswordToken === hashedToken &&
      this.security.resetPasswordExpires > Date.now();

    console.log("🔐 Password reset token verification:", isValid);
    return isValid;
  } catch (error) {
    console.error("❌ Error verifying reset token:", error);
    return false;
  }
};

/**
 * ✅ FIXED: Clears password reset token.
 */
userSchema.methods.clearPasswordResetToken = function () {
  this.security.resetPasswordToken = undefined;
  this.security.resetPasswordExpires = undefined;
  this.security.resetPasswordAttempts = 0;
  console.log("🔐 Cleared password reset token for user:", this.username);
};

/**
 * Checks if user is salon staff.
 * @returns {boolean} True if salon_staff.
 */
userSchema.methods.isStaff = function () {
  return this.role === "salon_staff";
};

/**
 * Checks if user is an admin.
 * @returns {boolean} True if admin.
 */
userSchema.methods.isAdmin = function () {
  return this.role === "admin";
};

/**
 * Checks if user is a customer.
 * @returns {boolean} True if customer.
 */
userSchema.methods.isCustomer = function () {
  return this.role === "customer";
};

/**
 * Checks if user is a guest.
 * @returns {boolean} True if guest.
 */
userSchema.methods.isGuestUser = function () {
  return this.isGuest === true;
};

/**
 * Converts a guest user to a regular user.
 * @throws {Error} If user is not a guest.
 * @returns {Promise<void>}
 */
userSchema.methods.convertGuestToRegular = async function () {
  if (!this.isGuest) throw new Error("User is not a guest");

  console.log("🔄 Converting guest to regular user:", this.username);
  this.isGuest = false;
  this.registrationStep = "completed";
  await this.save();
};

/**
 * ✅ FIXED: Generates a phone OTP.
 * @returns {string} The OTP code.
 */
userSchema.methods.generatePhoneOTP = function () {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  this.verification.phoneOTP = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    attempts: 0,
    lastSent: new Date(),
  };

  console.log("📱 Generated phone OTP for user:", this.phoneNumber);
  return otp;
};

/**
 * ✅ FIXED: Generates an email OTP.
 * @returns {string} The OTP code.
 */
userSchema.methods.generateEmailOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.verification.emailOTP = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    attempts: 0,
    lastSent: new Date(),
  };

  console.log("📧 Generated email OTP for user:", this.email);
  return otp;
};

/**
 * ✅ FIXED: Verifies a phone OTP.
 * @param {string} otp - The OTP to verify.
 * @returns {Object} Result with success and message.
 */
userSchema.methods.verifyPhoneOTP = function (otp) {
  try {
    if (!this.verification.phoneOTP || !this.verification.phoneOTP.code) {
      return {
        success: false,
        message: "No OTP found. Please request a new one.",
      };
    }

    if (this.verification.phoneOTP.expiresAt < new Date()) {
      return {
        success: false,
        message: "OTP has expired. Please request a new one.",
      };
    }

    if (this.verification.phoneOTP.attempts >= 3) {
      return {
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      };
    }

    if (this.verification.phoneOTP.code !== otp) {
      this.verification.phoneOTP.attempts += 1;
      return {
        success: false,
        message: "Invalid OTP. Please try again.",
        remainingAttempts: 3 - this.verification.phoneOTP.attempts,
      };
    }

    this.verification.phoneVerified = true;
    this.verification.phoneOTP = undefined;

    console.log("✅ Phone OTP verified successfully for:", this.phoneNumber);
    return { success: true, message: "Phone number verified successfully!" };
  } catch (error) {
    console.error("❌ Error verifying phone OTP:", error);
    return {
      success: false,
      message: "Error verifying OTP. Please try again.",
    };
  }
};

/**
 * ✅ FIXED: Verifies an email OTP.
 * @param {string} otp - The OTP to verify.
 * @returns {Object} Result with success and message.
 */
userSchema.methods.verifyEmailOTP = function (otp) {
  try {
    if (!this.verification.emailOTP || !this.verification.emailOTP.code) {
      return {
        success: false,
        message: "No OTP found. Please request a new one.",
      };
    }

    if (this.verification.emailOTP.expiresAt < new Date()) {
      return {
        success: false,
        message: "OTP has expired. Please request a new one.",
      };
    }

    if (this.verification.emailOTP.attempts >= 3) {
      return {
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      };
    }

    if (this.verification.emailOTP.code !== otp) {
      this.verification.emailOTP.attempts += 1;
      return {
        success: false,
        message: "Invalid OTP. Please try again.",
        remainingAttempts: 3 - this.verification.emailOTP.attempts,
      };
    }

    this.verification.emailVerified = true;
    this.verification.emailOTP = undefined;

    console.log("✅ Email OTP verified successfully for:", this.email);
    return { success: true, message: "Email verified successfully!" };
  } catch (error) {
    console.error("❌ Error verifying email OTP:", error);
    return {
      success: false,
      message: "Error verifying OTP. Please try again.",
    };
  }
};

/**
 * ✅ FIXED: Checks if user can request a new OTP.
 * @param {string} type - 'phone' or 'email'.
 * @returns {boolean} True if OTP can be requested.
 */
userSchema.methods.canRequestOTP = function (type = "phone") {
  const otpData =
    type === "phone" ? this.verification.phoneOTP : this.verification.emailOTP;

  if (!otpData || !otpData.lastSent) return true;

  const timeSinceLastSent = (new Date() - otpData.lastSent) / 1000;
  const canRequest = timeSinceLastSent >= 60; // 60 seconds cooldown

  console.log(`⏰ OTP request check for ${type}:`, {
    canRequest,
    timeSinceLastSent,
  });
  return canRequest;
};

/**
 * Static method to validate password strength.
 * @param {string} password - The password to validate.
 * @returns {Object} Validation result.
 */
userSchema.statics.validatePasswordStrength = validatePasswordStrength;

/**
 * Static method to get password requirements.
 * @returns {Object} Password requirements and strength levels.
 */
userSchema.statics.getPasswordRequirements = () => ({
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: false,
  requireSymbol: false,
  strengthLevels: {
    weak: {
      description: "Weak password - Red indicator",
      requirements: "8-128 characters with uppercase and lowercase letters",
      color: "red",
      colorCode: "#D62C01",
    },
    medium: {
      description: "Medium password - Yellow indicator",
      requirements: "Weak requirements + at least one number",
      color: "yellow",
      colorCode: "#FAAE16",
    },
    strong: {
      description: "Strong password - Green indicator",
      requirements:
        "Medium requirements + at least one symbol (!@#$%^&*()_+-=[]{}|;:,.<>?)",
      color: "green",
      colorCode: "#71D29C",
    },
  },
});

const User = mongoose.model("User", userSchema);
export default User;
