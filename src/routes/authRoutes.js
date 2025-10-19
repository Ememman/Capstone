import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { verifyGoogleToken, verifyFacebookToken } from "../utils/socialAuth.js";
import twilio from "twilio";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { createRequire } from "module";
import multer from "multer";
import path from "path";
import fs from "fs";

// Load environment variables
dotenv.config();

const router = express.Router();

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
    const user = await User.findById(decoded.userId); // FIXED: Use decoded.userId
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    req.user = user; // Attach full user object
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "Invalid token" });
  }
};

// Initialize Twilio client (optional - for SMS sending)
let twilioClient = null;
if (
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_ACCOUNT_SID.startsWith("AC") &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER
) {
  try {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log("Twilio client initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Twilio client:", error.message);
    twilioClient = null;
  }
} else {
  console.warn(
    "Twilio credentials not configured. SMS features will be disabled."
  );
}

// Initialize Nodemailer transporter (optional - for email sending)
let emailTransporter = null;
if (
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
) {
  try {
    emailTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    console.log("Email transporter initialized successfully");
  } catch (error) {
    console.error("Failed to initialize email transporter:", error.message);
    emailTransporter = null;
  }
} else {
  console.warn(
    "Email credentials not configured. Email features will be disabled."
  );
}

// FIXED: Generate token with userId
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15d" });
};

// Helper function to generate username suggestions
const generateUsernameSuggestions = (baseUsername) => {
  const suggestions = [];
  const randomNumbers = Math.floor(100 + Math.random() * 900); // 3 random digits

  // Add some variations
  suggestions.push(`${baseUsername}${randomNumbers}`);
  suggestions.push(`${baseUsername}_${Math.floor(10 + Math.random() * 90)}`);
  suggestions.push(`TheReal${baseUsername}`);
  suggestions.push(`${baseUsername}Official`);

  return suggestions.slice(0, 3); // Return max 3 suggestions
};

// Configure multer for image uploads
const uploadDir = path.join(process.cwd(), "uploads", "profile-images");

// Create upload directory if it doesn't exist
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});
// @route   POST /api/auth/setup-profile
// @desc    Setup username, first name, and profile image
// @access  Public
router.post(
  "/setup-profile",
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const { userId, username, firstName } = req.body;

      // Validate required fields
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

      // Allow profile setup even if registration step is not exactly "profile_setup"
      if (!user.verification.phoneVerified) {
        return res.status(400).json({
          success: false,
          message: "Phone number must be verified before setting up profile",
        });
      }

      // Prepare profile image path
      let profileImagePath = null;
      if (req.file) {
        try {
          // Verify file exists
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

      // Update user in database
      user.username = username;
      user.firstName = firstName;
      user.profileImage = profileImagePath;
      user.registrationStep = "email_setup";

      await user.save({ validateBeforeSave: false });

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

      // Clean up uploaded file if database operation fails
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

    // Check if username exists (excluding temporary users)
    const existingUser = await User.findOne({
      username,
      email: { $not: /@temp\.com$/ }, // Exclude temporary users
    });

    if (existingUser) {
      // Generate suggestions
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
}); // @route   GET /api/auth/roles
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

    // Generate unique phone number for guest (using timestamp)
    const uniquePhone = `99${timestamp.toString().slice(-9)}`;

    // Generate password: 8-20 chars with uppercase, lowercase, number, and symbol
    const randomPart = Math.random().toString(36).substr(2, 5); // 5 random chars
    const guestPassword = `Guest${randomPart}1!`; // Total: 5+5+2 = 12 chars

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
// @desc    Get current user profile (including guest status)
// @access  Private
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = req.user; // Now full user from middleware

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
}); // @route   POST /api/auth/register
// @desc    Register a new user
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

// @route   POST /api/auth/send-phone-otp
// @desc    Send OTP to phone number for registration
// @access  Public
router.post("/send-phone-otp", async (req, res) => {
  try {
    const { phoneNumber, role } = req.body;

    if (!phoneNumber || !role) {
      return res.status(400).json({
        success: false,
        message: "Phone number and role are required",
      });
    }

    // Check for proper 11-digit format starting with 0
    if (!/^0\d{10}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "Phone number should start with 0 and be 11 digits total.",
      });
    }

    // Only check for verified users to prevent blocking unverified registrations
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

    // Find existing unverified user or create new one
    let user = await User.findOne({
      phoneNumber,
      "verification.phoneVerified": false,
    });

    if (!user) {
      user = new User({
        phoneNumber,
        role,
        username: `temp_${phoneNumber}`,
        email: `temp_${phoneNumber}@temp.com`,
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

    // Send SMS via Twilio if configured
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        // Format phone number for Twilio (Philippines: +63XXXXXXXXX)
        const formattedPhone = phoneNumber.startsWith("0")
          ? `+63${phoneNumber.substring(1)}`
          : phoneNumber;

        console.log(`Attempting to send SMS to: ${formattedPhone}`);

        await twilioClient.messages.create({
          body: `Your Sandrealize Salon verification code is: ${otp}. This code will expire in 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone,
        });

        console.log(
          `[SMS SENT] Phone: ${phoneNumber}, Formatted: ${formattedPhone}, OTP: ${otp}`
        );
      } catch (smsError) {
        console.error("SMS sending failed:", smsError.message);
        // Continue with the response even if SMS fails
        console.log(
          `[OTP DEBUG] Phone: ${phoneNumber}, OTP: ${otp} (SMS failed: ${smsError.message})`
        );
      }
    } else {
      // Log OTP to console if SMS is not configured
      console.log(
        `[OTP DEBUG] Phone: ${phoneNumber}, OTP: ${otp} (SMS not configured)`
      );
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to your phone number",
      // Remove OTP from response in production
      // otp: otp, // Only for development
      expiresIn: "10 minutes",
    });
  } catch (error) {
    console.log("Error sending phone OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/verify-phone-otp
// @desc    Verify phone OTP and proceed to profile setup
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

    // Find user by phone number regardless of verification status
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found. Please request a new OTP.",
      });
    }

    // Check if phone is already verified
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

// @route   POST /api/auth/setup-email
// @desc    Setup email and send verification OTP
// @access  Public
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

    // Use validateBeforeSave: false to bypass password length validation
    await user.save({ validateBeforeSave: false });

    // Send email via Nodemailer if configured
    if (emailTransporter && process.env.EMAIL_FROM) {
      try {
        const mailOptions = {
          from: `"Sandrealize Salon" <${process.env.EMAIL_FROM}>`,
          to: email,
          subject: "Verify Your Email - Sandrealize Salon",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4A90E2;">Email Verification</h2>
              <p>Hello ${user.username},</p>
              <p>Your verification code is:</p>
              <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                ${otp}
              </div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
              <br>
              <p>Best regards,<br>Sandrealize Salon Team</p>
            </div>
          `,
        };

        await emailTransporter.sendMail(mailOptions);
        console.log(`[EMAIL SENT] Email: ${email}, OTP: ${otp}`);
      } catch (emailError) {
        console.error("Email sending failed:", emailError.message);
        // Continue with the response even if email fails
        console.log(
          `[OTP DEBUG] Email: ${email}, OTP: ${otp} (Email failed: ${emailError.message})`
        );
      }
    } else {
      // Log OTP to console if email is not configured
      console.log(
        `[OTP DEBUG] Email: ${email}, OTP: ${otp} (Email not configured)`
      );
    }

    res.status(200).json({
      success: true,
      message: "Email setup completed. Verification OTP sent to your email.",
      // Remove OTP from response in production
      // otp: otp, // Only for development
      expiresIn: "10 minutes",
    });
  } catch (error) {
    console.log("Error setting up email", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/verify-email-otp
// @desc    Verify email OTP and complete registration
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

    // Use validateBeforeSave: false to bypass password length validation
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
}); // @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, userId } = req.body;
    const authUserId = req.user._id || userId; // Use from req.user

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

    // Use validateBeforeSave: false to bypass password length validation
    await user.save({ validateBeforeSave: false });

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

// @route   POST /api/auth/forgot-password
// @desc    Request password reset token
// @access  Public
router.post("/forgot-password", async (req, res) => {
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
        message:
          "If an account with that email/phone exists, a password reset token has been generated.",
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

    res.status(200).json({
      success: true,
      message: "Password reset token generated successfully.",
      resetToken: resetToken,
      expiresIn: "10 minutes",
      instructions:
        "Use this token with the reset-password endpoint to set a new password.",
    });
  } catch (error) {
    console.log("Error in forgot password route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword, email, phoneNumber, emailOrPhone } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required",
      });
    }

    const identifier = emailOrPhone || email || phoneNumber;
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required",
      });
    }

    const passwordStrengthCheck = User.validatePasswordStrength(newPassword);
    if (!passwordStrengthCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordStrengthCheck.message,
        passwordStrength: passwordStrengthCheck,
      });
    }

    const isEmail = identifier.includes("@");
    const query = isEmail ? { email: identifier } : { phoneNumber: identifier };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid reset token or user not found",
      });
    }

    if (!user.verifyPasswordResetToken(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    user.password = newPassword;
    user.clearPasswordResetToken();

    user.security.failedLoginAttempts = 0;
    user.security.nextAllowedLogin = undefined;
    user.security.delaySeconds = 0;
    user.security.requirePasswordChange = false;

    // Use validateBeforeSave: false to bypass password length validation
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: `Password reset successfully! New password strength: ${passwordStrengthCheck.strength}`,
      passwordStrength: {
        strength: passwordStrengthCheck.strength,
        color: passwordStrengthCheck.color,
        score: passwordStrengthCheck.score,
      },
    });
  } catch (error) {
    console.log("Error in reset password route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}); // @route   POST /api/auth/login
// @desc    User login with role-based authentication options
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, phoneNumber, password, emailOrPhone, role } = req.body;

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
      role: role,
      registrationStep: "completed",
    };

    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials or user not found with this role",
      });
    }

    if (user.isGuest) {
      return res.status(400).json({
        success: false,
        message:
          "Guest accounts cannot be used for login. Please create a regular account.",
      });
    }

    if (user.isAccountLocked()) {
      const remainingTime = user.getRemainingDelayTime();
      const shouldRecommendForgot = user.shouldRecommendForgotPassword();

      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Please wait ${remainingTime} seconds before trying again.`,
        delayActive: true,
        remainingTime,
        failedAttempts: user.security.failedLoginAttempts,
        recommendForgotPassword: shouldRecommendForgot,
        forgotPasswordMessage: shouldRecommendForgot
          ? "Consider using 'Forgot Password' if you can't remember your password."
          : null,
      });
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      await user.handleFailedLogin();

      const shouldRecommendForgot = user.shouldRecommendForgotPassword();
      const delaySeconds = user.security.delaySeconds;

      return res.status(400).json({
        success: false,
        message: `Invalid credentials. Please wait ${delaySeconds} seconds before trying again.`,
        failedAttempts: user.security.failedLoginAttempts,
        delaySeconds,
        recommendForgotPassword: shouldRecommendForgot,
        forgotPasswordMessage: shouldRecommendForgot
          ? "Multiple failed attempts detected. Consider using 'Forgot Password' to reset your password."
          : null,
      });
    }

    await user.handleSuccessfulLogin();

    const passwordStrengthCheck = user.passwordStrength;
    const requiresPasswordUpdate = passwordStrengthCheck.strength === "weak";

    const token = generateToken(user._id);

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
      security: {
        passwordStrength: passwordStrengthCheck,
        requiresPasswordUpdate,
        lastPasswordChange: user.security.passwordChangedAt,
      },
    });
  } catch (error) {
    console.log("Error in login route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
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

      // Use validateBeforeSave: false to bypass password length validation
      await user.save({ validateBeforeSave: false });
    }

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

      // Use validateBeforeSave: false to bypass password length validation
      await user.save({ validateBeforeSave: false });
    }

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
    });
  } catch (error) {
    console.log("Error in Facebook auth route", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

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
        role: "salon_staff", // Only salon_staff can login as admin
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
  // @desc    Verify admin token and get admin profile
  // @access  Private (Admin only)
  router.get("/verify-admin", authenticateToken, async (req, res) => {
    try {
      const user = req.user;

      // Check if user is salon staff
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

  // ✅ Register Admin Route
  router.post("/register-admin", async (req, res) => {
    try {
      const { username, email, phoneNumber, password } = req.body;

      // Check existing
      const existingUser = await User.findOne({
        $or: [{ email }, { username }, { phoneNumber }],
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email, username or phone number already registered",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Generate DiceBear avatar
      const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

      // Create admin user
      const newAdmin = new User({
        username,
        email,
        phoneNumber,
        password: hashedPassword,
        role: "admin",
        profileImage: avatarUrl,
        verification: { phoneVerified: true, emailVerified: true }, // optional
      });

      await newAdmin.save();

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
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  });
});

export default router;
