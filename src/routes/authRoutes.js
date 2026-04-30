// routes/authRoutes.js - UPDATED with activity tracking
import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { verifyGoogleToken, verifyFacebookToken } from "../utils/socialAuth.js";
import notificationService from "../services/notificationService.js";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

dotenv.config();

const router = express.Router();

// ✅ Console startup message
console.log("📱 SMS Mode: All SMS codes will appear in TERMINAL ONLY");
console.log("📧 Email Mode: Using notificationService (Gmail/SMTP)");

// ✅ RATE LIMITER for OTP requests (prevent abuse)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per IP
  message: {
    success: false,
    message:
      "Too many OTP requests from this IP, please try again in 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to authenticate token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "Invalid token" });
  }
};

// Generate token with userId
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15d" });
};

// Helper function to generate username suggestions
const generateUsernameSuggestions = (baseUsername) => {
  const suggestions = [];
  const randomNumbers = Math.floor(100 + Math.random() * 900);

  suggestions.push(`${baseUsername}${randomNumbers}`);
  suggestions.push(`${baseUsername}_${Math.floor(10 + Math.random() * 90)}`);
  suggestions.push(`TheReal${baseUsername}`);
  suggestions.push(`${baseUsername}Official`);

  return suggestions.slice(0, 3);
};

// Configure multer for image uploads
const uploadDir = path.join(process.cwd(), "uploads", "profile-images");

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Created upload directory: ${uploadDir}`);
  }
} catch (error) {
  console.error(`Failed to create upload directory: ${error.message}`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const filename = `profile-${req.body.userId}-${Date.now()}.jpg`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// ✅ FIXED: Helper function for progressive delay system - PROPERLY IMPLEMENTED
async function handleFailedLoginWithProgressiveDelay(user) {
  try {
    console.log(
      "🔐 Handling failed login with progressive delay for user:",
      user.username
    );

    // Increment failed attempts
    user.security.failedLoginAttempts =
      (user.security.failedLoginAttempts || 0) + 1;
    user.security.lastFailedLogin = new Date();

    const attempts = user.security.failedLoginAttempts;
    let delaySeconds = 0;
    let shouldShowDelay = false;

    // ✅ FIXED: CORRECT progressive delays based on exact requirements
    if (attempts === 4) {
      // 4th attempt: 10 seconds delay
      delaySeconds = 10;
      shouldShowDelay = true;
      console.log(`⏰ 4th failed attempt - Applying 10-second delay`);
    } else if (attempts === 8) {
      // 8th attempt: 15 seconds delay
      delaySeconds = 15;
      shouldShowDelay = true;
      console.log(`⏰ 8th failed attempt - Applying 15-second delay`);
    } else if (attempts >= 9) {
      // 9th+ attempts: Progressive increase
      const additionalDelays = [20, 25, 30, 40, 50, 60];
      const delayIndex = Math.min(attempts - 9, additionalDelays.length - 1);
      delaySeconds = additionalDelays[delayIndex];
      shouldShowDelay = true;
      console.log(
        `⏰ ${attempts}th failed attempt - Applying ${delaySeconds}-second delay`
      );
    } else {
      // 1st-3rd, 5th-7th attempts: No delay, just error message
      delaySeconds = 0;
      shouldShowDelay = false;
      console.log(`⚠️ ${attempts}th failed attempt - No delay applied`);
    }

    user.security.delaySeconds = delaySeconds;

    // ✅ FIXED: Only set nextAllowedLogin if there's an actual delay
    if (delaySeconds > 0) {
      user.security.nextAllowedLogin = new Date(
        Date.now() + delaySeconds * 1000
      );
      console.log(
        `⏰ Next login allowed after: ${user.security.nextAllowedLogin}`
      );
    } else {
      user.security.nextAllowedLogin = undefined;
    }

    await user.save({ validateBeforeSave: false });

    return { delaySeconds, shouldShowDelay };
  } catch (error) {
    console.error("❌ Error handling failed login with delay:", error);
    return { delaySeconds: 0, shouldShowDelay: false };
  }
}

// @route   POST /api/auth/setup-profile
// @desc    Setup username, first name, and profile image
// @access  Public
router.post(
  "/setup-profile",
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const { userId, username, firstName } = req.body;

      if (!userId || !username || !firstName) {
        return res.status(400).json({
          success: false,
          message: "User ID, username, and first name are required",
        });
      }

      if (username.length < 7) {
        return res.status(400).json({
          success: false,
          message: "Username should be at least 7 characters long.",
        });
      }

      const existingUsername = await User.findOne({
        username,
        _id: { $ne: userId },
      });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: "Username already exists",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      if (!user.verification.phoneVerified) {
        return res.status(400).json({
          success: false,
          message: "Phone number must be verified before setting up profile",
        });
      }

      let profileImagePath = null;
      if (req.file) {
        try {
          await fs.promises.access(req.file.path);
          profileImagePath = `/uploads/profile-images/${req.file.filename}`;
          console.log(`File uploaded successfully: ${req.file.path}`);
        } catch (error) {
          console.error(`Error accessing uploaded file: ${error.message}`);
          return res.status(500).json({
            success: false,
            message: "Failed to process uploaded file",
          });
        }
      } else {
        console.log("No profile image uploaded, using default avatar");
        profileImagePath = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      }

      user.username = username;
      user.firstName = firstName;
      user.profileImage = profileImagePath;
      user.registrationStep = "email_setup";

      await user.save({ validateBeforeSave: false });

      // Track profile setup activity
      await notificationService.trackUserActivity(user._id, "profile_updated", {
        username: user.username,
        firstName: user.firstName,
      });

      res.status(200).json({
        success: true,
        message: "Profile setup completed",
        nextStep: "email_setup",
        user: {
          id: user._id,
          username: user.username,
          firstName: user.firstName,
          profileImage: user.profileImage,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("Setup profile error:", error);

      if (req.file) {
        try {
          await fs.promises.unlink(req.file.path);
          console.log(`Cleaned up file: ${req.file.path}`);
        } catch (err) {
          console.error(`Error deleting file: ${err.message}`);
        }
      }

      res.status(500).json({
        success: false,
        message: error.message || "Failed to setup profile",
      });
    }
  }
);

// @route   POST /api/auth/check-username
// @desc    Check if username is available
// @access  Public
router.post("/check-username", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    if (username.length < 7) {
      return res.status(400).json({
        success: false,
        message: "Username must be at least 7 characters",
      });
    }

    const existingUser = await User.findOne({
      username,
      email: { $not: /@temp\.com$/ },
    });

    if (existingUser) {
      const suggestions = generateUsernameSuggestions(username);

      return res.status(200).json({
        success: false,
        available: false,
        message: "This username isn't available. Try a different one.",
        suggestions: suggestions,
      });
    }

    res.status(200).json({
      success: true,
      available: true,
      message: "Username is available",
    });
  } catch (error) {
    console.log("Error checking username", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   GET /api/auth/password-requirements
// @desc    Get password requirements for frontend
// @access  Public
router.get("/password-requirements", (req, res) => {
  try {
    const requirements = User.getPasswordRequirements();
    res.status(200).json({
      success: true,
      data: requirements,
    });
  } catch (error) {
    console.log("Error getting password requirements", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/check-password-strength
// @desc    Check password strength in real-time
// @access  Public
router.post("/check-password-strength", (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    const strengthCheck = User.validatePasswordStrength(password);

    res.status(200).json({
      success: true,
      data: {
        strength: strengthCheck.strength,
        color: strengthCheck.color,
        score: strengthCheck.score,
        isValid: strengthCheck.isValid,
        message: strengthCheck.message,
        checks: strengthCheck.checks,
      },
    });
  } catch (error) {
    console.log("Error checking password strength", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   GET /api/auth/roles
// @desc    Get available roles for login
// @access  Public
router.get("/roles", (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        roles: [
          {
            id: "salon_staff",
            name: "Salon Staff",
            description: "Those who sell Service",
            authMethods: ["email_phone"],
          },
          {
            id: "customer",
            name: "Customer",
            description: "Those who need Service",
            authMethods: ["email_phone", "google", "facebook"],
          },
        ],
      },
    });
  } catch (error) {
    console.log("Error getting roles", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/guest
// @desc    Create a guest user session
// @access  Public
router.post("/guest", async (req, res) => {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    const guestId = `${timestamp}${randomStr}`;
    const uniquePhone = `99${timestamp.toString().slice(-9)}`;
    const randomPart = Math.random().toString(36).substr(2, 5);
    const guestPassword = `Guest${randomPart}1!`;

    const guestUser = new User({
      username: `Guest_${randomStr}`,
      email: `guest_${guestId}@temp.guest`,
      phoneNumber: uniquePhone,
      password: guestPassword,
      profileImage: "",
      role: "customer",
      authProvider: "local",
      isGuest: true,
      registrationStep: "completed",
      verification: {
        phoneVerified: false,
        emailVerified: false,
      },
      passwordStrength: {
        strength: "strong",
        score: 3,
        lastUpdated: new Date(),
      },
    });

    await guestUser.save({ validateBeforeSave: false });

    const token = generateToken(guestUser._id);

    res.status(201).json({
      success: true,
      message: "Guest session created",
      token,
      user: {
        id: guestUser._id,
        username: guestUser.username,
        email: guestUser.email,
        phoneNumber: guestUser.phoneNumber,
        profileImage: guestUser.profileImage,
        role: guestUser.role,
        isGuest: true,
        createdAt: guestUser.createdAt,
      },
    });
  } catch (error) {
    console.log("Error creating guest user", error);
    console.log("Error details:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// @route   POST /api/auth/convert-guest
// @desc    Convert guest user to regular user
// @access  Public
router.post("/convert-guest", async (req, res) => {
  try {
    const { userId, email, username, password, phoneNumber } = req.body;

    if (!userId || !email || !username || !password || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (phoneNumber.length !== 11 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Phone number should be exactly 11 digits.",
      });
    }

    if (username.length < 7) {
      return res.status(400).json({
        success: false,
        message: "Username should be at least 7 characters long.",
      });
    }

    const passwordStrengthCheck = User.validatePasswordStrength(password);
    if (!passwordStrengthCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordStrengthCheck.message,
      });
    }

    const existingEmail = await User.findOne({ email, _id: { $ne: userId } });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const existingUsername = await User.findOne({
      username,
      _id: { $ne: userId },
    });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    const existingPhone = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.isGuest) {
      return res.status(400).json({
        success: false,
        message: "Invalid guest user",
      });
    }

    user.email = email;
    user.username = username;
    user.password = password;
    user.phoneNumber = phoneNumber;
    user.profileImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    user.isGuest = false;
    user.registrationStep = "completed";

    await user.save();

    // Track guest conversion activity
    await notificationService.trackUserActivity(user._id, "user_registered", {
      username: user.username,
      email: user.email,
      convertedFromGuest: true,
    });

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Guest account converted to regular account successfully!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: false,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error converting guest user", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: user.isGuest || false,
        createdAt: user.createdAt,
        verification: user.verification,
      },
    });
  } catch (error) {
    console.log("Error getting user profile", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { username, email, phoneNumber } = req.body;
    const user = req.user;

    if (username && username !== user.username) {
      const existingUsername = await User.findOne({
        username,
        _id: { $ne: user._id },
      });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }
    }

    if (email && email !== user.email) {
      const existingEmail = await User.findOne({
        email,
        _id: { $ne: user._id },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "Email already taken",
        });
      }
    }

    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingPhone = await User.findOne({
        phoneNumber,
        _id: { $ne: user._id },
      });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Phone number already taken",
        });
      }
    }

    if (username) user.username = username;
    if (email) user.email = email;
    if (phoneNumber) user.phoneNumber = phoneNumber;

    await user.save({ validateBeforeSave: false });

    // Track profile update activity
    await notificationService.trackUserActivity(user._id, "profile_updated", {
      username: user.username,
      email: user.email,
    });

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: user.isGuest || false,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

// @route   POST /api/auth/profile/picture
// @desc    Update user profile picture
// @access  Private
router.post(
  "/profile/picture",
  authenticateToken,
  upload.single("profileImage"),
  async (req, res) => {
    try {
      console.log("📸 Profile picture upload request received");
      console.log("User ID:", req.user._id);
      console.log("File:", req.file);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file provided",
        });
      }

      const user = req.user;

      if (user.profileImage && !user.profileImage.includes("dicebear")) {
        try {
          if (user.profileImage.startsWith("/uploads")) {
            const oldImagePath = path.join(
              process.cwd(),
              user.profileImage.replace(/^\//, "")
            );
            if (fs.existsSync(oldImagePath)) {
              fs.unlinkSync(oldImagePath);
              console.log("🗑️ Deleted old profile image:", oldImagePath);
            }
          }
        } catch (deleteError) {
          console.warn("⚠️ Could not delete old image:", deleteError.message);
        }
      }

      const imageUrl = `/uploads/profile-images/${req.file.filename}`;
      user.profileImage = imageUrl;
      await user.save({ validateBeforeSave: false });

      // Track profile picture update activity
      await notificationService.trackUserActivity(
        user._id,
        "profile_picture_updated"
      );

      console.log("✅ Profile picture updated successfully");
      console.log("New image URL:", imageUrl);

      res.json({
        success: true,
        message: "Profile picture updated successfully",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage,
          role: user.role,
          isGuest: user.isGuest || false,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("❌ Error uploading profile picture:", error);

      if (req.file) {
        try {
          const filePath = path.join(
            process.cwd(),
            "uploads/profile-images",
            req.file.filename
          );
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log("🧹 Cleaned up failed upload:", filePath);
          }
        } catch (cleanupError) {
          console.warn("⚠️ Could not clean up file:", cleanupError.message);
        }
      }

      res.status(500).json({
        success: false,
        message: "Failed to upload profile picture",
        error: error.message,
      });
    }
  }
);

// @route   POST /api/auth/register
// @desc    Register a new user (legacy)
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { email, username, password, phoneNumber, role } = req.body;

    if (!username || !email || !password || !phoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (phoneNumber.length !== 11) {
      return res.status(400).json({
        success: false,
        message: "Phone number should be exactly 11 numbers long.",
      });
    }

    if (!/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Phone number should contain only numbers.",
      });
    }

    if (username.length < 7) {
      return res.status(400).json({
        success: false,
        message: "Username should be at least 7 characters long.",
      });
    }

    const passwordStrengthCheck = User.validatePasswordStrength(password);
    if (!passwordStrengthCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordStrengthCheck.message,
        passwordStrength: {
          strength: passwordStrengthCheck.strength,
          color: passwordStrengthCheck.color,
          score: passwordStrengthCheck.score,
          checks: passwordStrengthCheck.checks,
        },
      });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    const existingPhoneNumber = await User.findOne({ phoneNumber });
    if (existingPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    const profileImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    const user = new User({
      email,
      username,
      password,
      phoneNumber,
      profileImage,
      role: role || "customer",
      authProvider: "local",
      isGuest: false,
    });

    await user.save();

    // Track user registration activity
    await notificationService.trackUserActivity(user._id, "user_registered", {
      username: user.username,
      email: user.email,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: `Account created successfully! Password strength: ${passwordStrengthCheck.strength}`,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: false,
        createdAt: user.createdAt,
      },
      passwordStrength: {
        strength: passwordStrengthCheck.strength,
        color: passwordStrengthCheck.color,
        score: passwordStrengthCheck.score,
      },
    });
  } catch (error) {
    console.log("Error in register route", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: errors.join(", "),
        validationErrors: errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✅ UPDATED: Send Phone OTP (SMS TERMINAL ONLY)
router.post("/send-phone-otp", otpLimiter, async (req, res) => {
  try {
    const { phoneNumber, role, email } = req.body;

    if (!phoneNumber || !role) {
      return res.status(400).json({
        success: false,
        message: "Phone number and role are required",
      });
    }

    if (!/^0\d{10}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Phone number should start with 0 and be 11 digits total.",
      });
    }

    const existingVerifiedUser = await User.findOne({
      phoneNumber,
      "verification.phoneVerified": true,
    });

    if (existingVerifiedUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered and verified",
      });
    }

    let user = await User.findOne({
      phoneNumber,
      "verification.phoneVerified": false,
    });

    if (!user) {
      user = new User({
        phoneNumber,
        role,
        username: `temp_${phoneNumber}`,
        email: email || `temp_${phoneNumber}@temp.com`,
        password: "TempPassword123!",
        registrationStep: "phone_verification",
        isGuest: false,
        verification: {
          phoneVerified: false,
          emailVerified: false,
        },
      });
    }

    if (!user.canRequestOTP("phone")) {
      return res.status(429).json({
        success: false,
        message: "Please wait 60 seconds before requesting another OTP",
      });
    }

    const otp = user.generatePhoneOTP();
    await user.save({ validateBeforeSave: false });

    // ✅ SMS: ONLY LOG TO TERMINAL (NO ACTUAL SENDING)
    console.log("\n" + "=".repeat(60));
    console.log("📱 [SMS VERIFICATION CODE - TERMINAL ONLY]");
    console.log("=".repeat(60));
    console.log(`📞 Phone Number: ${phoneNumber}`);
    console.log(`🔐 OTP Code: ${otp}`);
    console.log(`⏰ Expires in: 10 minutes`);
    console.log(`👤 Role: ${role}`);
    if (email && !email.includes("@temp.com"))
      console.log(`📧 Backup Email: ${email}`);
    console.log("=".repeat(60) + "\n");

    return res.status(200).json({
      success: true,
      message:
        "OTP sent to your phone number. Check your terminal for the code.",
      channel: "sms",
      expiresIn: "10 minutes",
      otp: otp, // ⚠️ ONLY for development - remove in production
    });
  } catch (error) {
    console.error("Error sending phone OTP:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/verify-phone-otp
// @desc    Verify phone OTP
// @access  Public
router.post("/verify-phone-otp", async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found. Please request a new OTP.",
      });
    }

    if (user.verification.phoneVerified) {
      return res.status(400).json({
        success: false,
        message: "Phone number is already verified.",
      });
    }

    const verificationResult = user.verifyPhoneOTP(otp);

    if (!verificationResult.success) {
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
      });
    }

    user.registrationStep = "profile_setup";
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: verificationResult.message,
      nextStep: "profile_setup",
      userId: user._id,
    });
  } catch (error) {
    console.log("Error verifying phone OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✅ UPDATED: Setup Email (Uses notificationService for EMAIL)
router.post("/setup-email", async (req, res) => {
  try {
    const { userId, email, password } = req.body;

    if (!userId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "User ID, email, and password are required",
      });
    }

    const emailRegex = /^\w+([-.]?\w+)*@\w+([-.]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const passwordStrengthCheck = User.validatePasswordStrength(password);
    if (!passwordStrengthCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordStrengthCheck.message,
        passwordStrength: passwordStrengthCheck,
      });
    }

    const existingEmail = await User.findOne({
      email,
      _id: { $ne: userId },
    });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    user.email = email;
    user.password = password;
    const otp = user.generateEmailOTP();
    await user.save({ validateBeforeSave: false });

    // ✅ EMAIL: Use notificationService (Gmail/SMTP)
    try {
      await notificationService.sendVerificationEmail(
        email,
        otp,
        user.username || user.firstName || "User",
        "registration"
      );

      return res.status(200).json({
        success: true,
        message: "Email setup completed. Verification code sent to your email.",
        expiresIn: "10 minutes",
      });
    } catch (notificationError) {
      console.error("Failed to send email:", notificationError);

      // ⚠️ Fallback: Log to terminal if email fails
      console.log("\n" + "=".repeat(60));
      console.log("📧 [EMAIL VERIFICATION CODE - TERMINAL FALLBACK]");
      console.log("=".repeat(60));
      console.log(`📨 Email: ${email}`);
      console.log(`🔐 OTP Code: ${otp}`);
      console.log(`⏰ Expires in: 10 minutes`);
      console.log(`👤 Username: ${user.username}`);
      console.log("=".repeat(60) + "\n");

      return res.status(200).json({
        success: true,
        message:
          "Verification code generated. Check your terminal (email sending failed).",
        expiresIn: "10 minutes",
        otp: otp, // ⚠️ ONLY for development
      });
    }
  } catch (error) {
    console.error("Error setting up email:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/verify-email-otp
// @desc    Verify email OTP
// @access  Public
router.post("/verify-email-otp", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    const verificationResult = user.verifyEmailOTP(otp);

    if (!verificationResult.success) {
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
      });
    }

    user.registrationStep = "completed";
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Registration completed successfully!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: false,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error verifying email OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, userId } = req.body;
    const authUserId = req.user._id || userId;

    if (!authUserId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    const passwordStrengthCheck = User.validatePasswordStrength(newPassword);
    if (!passwordStrengthCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordStrengthCheck.message,
        passwordStrength: {
          strength: passwordStrengthCheck.strength,
          color: passwordStrengthCheck.color,
          score: passwordStrengthCheck.score,
          checks: passwordStrengthCheck.checks,
        },
      });
    }

    const user = await User.findById(authUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isCurrentPasswordCorrect = await user.comparePassword(
      currentPassword
    );
    if (!isCurrentPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    user.password = newPassword;
    user.security.requirePasswordChange = false;
    await user.save({ validateBeforeSave: false });

    // Track password change activity
    await notificationService.trackUserActivity(user._id, "password_changed");

    res.status(200).json({
      success: true,
      message: `Password updated successfully! New password strength: ${passwordStrengthCheck.strength}`,
      passwordStrength: {
        strength: passwordStrengthCheck.strength,
        color: passwordStrengthCheck.color,
        score: passwordStrengthCheck.score,
      },
    });
  } catch (error) {
    console.log("Error in change password route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ✅ UPDATED: Forgot Password (SMS Terminal + Email via notificationService)
router.post("/forgot-password", otpLimiter, async (req, res) => {
  try {
    const { email, phoneNumber, emailOrPhone } = req.body;
    const identifier = emailOrPhone || email || phoneNumber;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required",
      });
    }

    const isEmail = identifier.includes("@");
    const query = isEmail ? { email: identifier } : { phoneNumber: identifier };
    const user = await User.findOne(query);

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account exists, a password reset code has been sent.",
      });
    }

    const now = new Date();
    const lastRequest = user.security.lastResetRequest;
    const timeSinceLastRequest = lastRequest
      ? (now - lastRequest) / 1000
      : Number.POSITIVE_INFINITY;

    if (timeSinceLastRequest < 60) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another password reset.",
        cooldownRemaining: Math.ceil(60 - timeSinceLastRequest),
      });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    if (isEmail) {
      // ✅ EMAIL: Use notificationService
      try {
        await notificationService.sendPasswordReset(
          identifier,
          resetToken,
          user.username || "User"
        );

        return res.status(200).json({
          success: true,
          message: "Password reset code has been sent to your email.",
          expiresIn: "10 minutes",
        });
      } catch (notificationError) {
        console.error(
          "Failed to send password reset email:",
          notificationError
        );

        // Fallback: Log to terminal
        console.log("\n" + "=".repeat(60));
        console.log("🔐 [PASSWORD RESET TOKEN - TERMINAL FALLBACK]");
        console.log("=".repeat(60));
        console.log(`📧 Email: ${identifier}`);
        console.log(`🎫 Reset Token: ${resetToken}`);
        console.log(`⏰ Expires in: 10 minutes`);
        console.log(`👤 Username: ${user.username}`);
        console.log("=".repeat(60) + "\n");

        return res.status(200).json({
          success: true,
          message:
            "Password reset code generated. Check your terminal (email failed).",
          expiresIn: "10 minutes",
          resetToken: resetToken, // ⚠️ ONLY for development
        });
      }
    } else {
      // ✅ SMS: ONLY LOG TO TERMINAL
      console.log("\n" + "=".repeat(60));
      console.log("🔐 [PASSWORD RESET TOKEN - TERMINAL ONLY]");
      console.log("=".repeat(60));
      console.log(`📱 Phone: ${identifier}`);
      console.log(`🎫 Reset Token: ${resetToken}`);
      console.log(`⏰ Expires in: 10 minutes`);
      console.log(`👤 Username: ${user.username}`);
      console.log("=".repeat(60) + "\n");

      return res.status(200).json({
        success: true,
        message:
          "Password reset code generated. Check your terminal for the code.",
        channel: "sms",
        expiresIn: "10 minutes",
        resetToken: resetToken, // ⚠️ ONLY for development
      });
    }
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/login
// @desc    User login with FIXED progressive delay system
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, phoneNumber, password, emailOrPhone, role } = req.body;

    console.log("🔑 Login attempt:", { emailOrPhone, role });

    const loginIdentifier = emailOrPhone || email || phoneNumber;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone number and password are required",
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Please select your role (customer or salon_staff)",
      });
    }

    // Find user
    const isEmail = loginIdentifier.includes("@");
    let query = {
      role: role,
      registrationStep: "completed",
      $or: [],
    };

    if (isEmail) {
      query.$or.push({ email: loginIdentifier });
    } else {
      query.$or.push({ phoneNumber: loginIdentifier });
    }

    const user = await User.findOne(query);

    if (!user) {
      console.log("❌ User not found with query:", query);
      return res.status(400).json({
        success: false,
        message: "Invalid credentials or user not found with this role",
      });
    }

    console.log("✅ User found:", user._id, user.username);

    if (user.isGuest) {
      return res.status(400).json({
        success: false,
        message:
          "Guest accounts cannot be used for login. Please create a regular account.",
      });
    }

    // Check if account is locked with active delay
    const now = new Date();
    if (
      user.security.nextAllowedLogin &&
      user.security.nextAllowedLogin > now
    ) {
      const remainingTime = Math.ceil(
        (user.security.nextAllowedLogin - now) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please wait ${remainingTime} seconds before trying again.`,
        delayActive: true,
        remainingTime,
        failedAttempts: user.security.failedLoginAttempts,
      });
    }

    // Password verification
    const isPasswordCorrect = await user.comparePassword(password);
    console.log("🔐 Password check result:", isPasswordCorrect);

    if (!isPasswordCorrect) {
      // Handle failed login with progressive delays
      const { delaySeconds, shouldShowDelay } =
        await handleFailedLoginWithProgressiveDelay(user);

      const failedAttempts = user.security.failedLoginAttempts || 1;

      // Return appropriate response based on attempt number
      if (shouldShowDelay) {
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Please wait ${delaySeconds} seconds before trying again.`,
          failedAttempts,
          delaySeconds,
          delayActive: true,
        });
      } else {
        // For attempts without delay, just show invalid credentials
        return res.status(400).json({
          success: false,
          message: "Invalid credentials. Try Again.",
          failedAttempts,
          delaySeconds: 0,
          delayActive: false,
        });
      }
    }

    // ✅ SUCCESSFUL LOGIN - Reset all security fields
    user.security.failedLoginAttempts = 0;
    user.security.lastFailedLogin = undefined;
    user.security.nextAllowedLogin = undefined;
    user.security.delaySeconds = 0;
    user.lastLogin = new Date();

    // Update activity for admin/staff users
    if (user.role === "admin" || user.role === "salon_staff") {
      user.lastActivity = new Date();
    }

    await user.save({ validateBeforeSave: false });

    // Track login activity
    await notificationService.trackUserActivity(user._id, "user_logged_in");

    const token = generateToken(user._id);

    console.log("✅ Login successful for user:", user.username);

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: user.isGuest || false,
        createdAt: user.createdAt,
      },
      redirectTo:
        role === "salon_staff" ? "/staff/dashboard" : "/customer/dashboard",
    });
  } catch (error) {
    console.error("❌ Error in login route:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error - " + error.message,
    });
  }
});

// @route   POST /api/auth/auth/google
// @desc    Authenticate with Google
// @access  Public
router.post("/auth/google", async (req, res) => {
  try {
    const { googleToken, role } = req.body;

    if (!googleToken || !role) {
      return res.status(400).json({
        success: false,
        message: "Google token and role are required",
      });
    }

    if (role !== "customer") {
      return res.status(400).json({
        success: false,
        message: "Google authentication is only available for customers",
      });
    }

    const googleUser = await verifyGoogleToken(googleToken);

    if (!googleUser) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google token",
      });
    }

    let user = await User.findOne({ email: googleUser.email, role: role });

    if (!user) {
      const username =
        googleUser.name.replace(/\s+/g, "").toLowerCase() +
        Math.random().toString(36).substr(2, 4);

      user = new User({
        email: googleUser.email,
        username,
        password: Math.random().toString(36).substr(2, 15) + "Aa1!",
        phoneNumber: "00000000000",
        profileImage: googleUser.picture,
        role: role,
        authProvider: "google",
        registrationStep: "completed",
        isGuest: false,
        verification: {
          phoneVerified: false,
          emailVerified: true,
        },
        passwordStrength: {
          strength: "strong",
          score: 3,
          lastUpdated: new Date(),
        },
      });

      await user.save({ validateBeforeSave: false });

      // Track registration activity for Google signup
      await notificationService.trackUserActivity(user._id, "user_registered", {
        username: user.username,
        email: user.email,
        authProvider: "google",
      });
    }

    // Track login activity
    await notificationService.trackUserActivity(user._id, "user_logged_in", {
      authProvider: "google",
    });

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Google authentication successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: false,
        createdAt: user.createdAt,
      },
      authProvider: "google",
      redirectTo: "/customer/dashboard", // ✅ Added for customers
    });
  } catch (error) {
    console.log("Error in Google auth route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/auth/facebook
// @desc    Authenticate with Facebook
// @access  Public
router.post("/auth/facebook", async (req, res) => {
  try {
    const { facebookToken, role } = req.body;

    if (!facebookToken || !role) {
      return res.status(400).json({
        success: false,
        message: "Facebook token and role are required",
      });
    }

    if (role !== "customer") {
      return res.status(400).json({
        success: false,
        message: "Facebook authentication is only available for customers",
      });
    }

    const facebookUser = await verifyFacebookToken(facebookToken);

    if (!facebookUser) {
      return res.status(400).json({
        success: false,
        message: "Invalid Facebook token",
      });
    }

    let user = await User.findOne({ email: facebookUser.email, role: role });

    if (!user) {
      const username =
        facebookUser.name.replace(/\s+/g, "").toLowerCase() +
        Math.random().toString(36).substr(2, 4);

      user = new User({
        email: facebookUser.email,
        username,
        password: Math.random().toString(36).substr(2, 15) + "Aa1!",
        phoneNumber: "00000000000",
        profileImage:
          facebookUser.picture?.data?.url ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${facebookUser.name}`,
        role: role,
        authProvider: "facebook",
        registrationStep: "completed",
        isGuest: false,
        verification: {
          phoneVerified: false,
          emailVerified: true,
        },
        passwordStrength: {
          strength: "strong",
          score: 3,
          lastUpdated: new Date(),
        },
      });

      await user.save({ validateBeforeSave: false });

      // Track registration activity for Facebook signup
      await notificationService.trackUserActivity(user._id, "user_registered", {
        username: user.username,
        email: user.email,
        authProvider: "facebook",
      });
    }

    // Track login activity
    await notificationService.trackUserActivity(user._id, "user_logged_in", {
      authProvider: "facebook",
    });

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Facebook authentication successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        isGuest: false,
        createdAt: user.createdAt,
      },
      authProvider: "facebook",
      redirectTo: "/customer/dashboard", // ✅ Added for customers
    });
  } catch (error) {
    console.log("Error in Facebook auth route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/admin-login
// @desc    Admin/staff login
// @access  Public
router.post("/admin-login", async (req, res) => {
  try {
    const { email, phoneNumber, password, emailOrPhone } = req.body;

    const loginIdentifier = emailOrPhone || email || phoneNumber;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone number and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password should be at least 8 characters long.",
      });
    }

    const isEmail = loginIdentifier.includes("@");
    const query = {
      ...(isEmail
        ? { email: loginIdentifier }
        : { phoneNumber: loginIdentifier }),
      role: "salon_staff",
      registrationStep: "completed",
      isActive: true,
    };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials or insufficient permissions",
      });
    }

    if (user.isGuest) {
      return res.status(401).json({
        success: false,
        message: "Guest accounts cannot access admin dashboard",
      });
    }

    if (user.isAccountLocked && user.isAccountLocked()) {
      const remainingTime = user.getRemainingDelayTime
        ? user.getRemainingDelayTime()
        : 60;
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please wait ${remainingTime} seconds before trying again.`,
        delayActive: true,
        remainingTime,
      });
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      if (user.handleFailedLogin) {
        await user.handleFailedLogin();
      }
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (user.handleSuccessfulLogin) {
      await user.handleSuccessfulLogin();
    }

    // Track login activity
    await notificationService.trackUserActivity(user._id, "user_logged_in", {
      role: "staff",
    });

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: "Admin login successful!",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        position: user.position,
        staffId: user.staffId,
        isGuest: user.isGuest || false,
        createdAt: user.createdAt,
      },
      redirectTo: "/staff/dashboard", // ✅ Added for staff
    });
  } catch (error) {
    console.log("Error in admin login route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   GET /api/auth/verify-admin
// @desc    Verify admin token
// @access  Private (Admin only)
router.get("/verify-admin", authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "salon_staff") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role,
        position: user.position,
        staffId: user.staffId,
        isActive: user.isActive,
        hireDate: user.hireDate,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error verifying admin token", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/register-admin
// @desc    Register admin
// @access  Public (should be protected in production)
router.post("/register-admin", async (req, res) => {
  try {
    const { username, email, phoneNumber, password } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { username }, { phoneNumber }],
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email, username or phone number already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    const newAdmin = new User({
      username,
      email,
      phoneNumber,
      password: hashedPassword,
      role: "admin",
      profileImage: avatarUrl,
      verification: { phoneVerified: true, emailVerified: true },
    });

    await newAdmin.save();

    // Track admin registration activity
    await notificationService.trackUserActivity(
      newAdmin._id,
      "user_registered",
      {
        username: newAdmin.username,
        email: newAdmin.email,
        role: "admin",
      }
    );

    res.status(201).json({
      success: true,
      message: "Admin account created successfully",
      admin: {
        id: newAdmin._id,
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role,
        profileImage: newAdmin.profileImage,
      },
    });
  } catch (error) {
    console.error("Register Admin Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
