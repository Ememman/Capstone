import express from "express";
import Promo from "../models/Promo.js";
import { optionalAuth, authMiddleware, staffOnly } from "../middleware/auth.js";

const router = express.Router();

// Seed initial default promo codes if none exist
const DEFAULT_PROMOS = [
  {
    code: "WELCOME10",
    description: "Welcome offer: 10% off your first appointment or order",
    discountType: "percentage",
    discountValue: 10,
    minOrderAmount: 300,
    maxDiscount: 200,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    usageLimit: 1000,
    applicableTo: "all",
  },
  {
    code: "GLAM20",
    description: "Glamour Special: 20% off all hair and beauty services",
    discountType: "percentage",
    discountValue: 20,
    minOrderAmount: 800,
    maxDiscount: 500,
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    usageLimit: 500,
    applicableTo: "services",
  },
  {
    code: "HAIRCARE15",
    description: "15% off premium salon hair care products",
    discountType: "percentage",
    discountValue: 15,
    minOrderAmount: 500,
    maxDiscount: 300,
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    usageLimit: 500,
    applicableTo: "products",
  },
  {
    code: "VIP100",
    description: "₱100 off on transactions above ₱1,000",
    discountType: "fixed",
    discountValue: 100,
    minOrderAmount: 1000,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    usageLimit: 300,
    applicableTo: "all",
  },
];

// Helper to seed defaults if collection is empty
const ensureDefaultPromos = async () => {
  try {
    const count = await Promo.countDocuments();
    if (count === 0) {
      await Promo.insertMany(DEFAULT_PROMOS);
      console.log("🎟️ Seeded default promo codes (WELCOME10, GLAM20, HAIRCARE15, VIP100)");
    }
  } catch (err) {
    console.error("Error auto-seeding promos:", err);
  }
};

// POST /api/promos/validate - Public / Authenticated route to validate a promo code
router.post("/validate", optionalAuth, async (req, res) => {
  try {
    await ensureDefaultPromos();
    const { code, amount = 0, targetType = "all" } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Promo code is required",
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const promo = await Promo.findOne({ code: cleanCode });

    if (!promo) {
      return res.status(404).json({
        success: false,
        message: "Invalid promo code",
      });
    }

    const numericAmount = parseFloat(amount) || 0;
    const eligibility = promo.checkEligibility(numericAmount, targetType);

    if (!eligibility.valid) {
      return res.status(400).json({
        success: false,
        message: eligibility.message,
      });
    }

    const discountAmount = promo.calculateDiscount(numericAmount);
    const finalAmount = Math.max(0, numericAmount - discountAmount);

    res.json({
      success: true,
      message: `Promo code ${promo.code} applied successfully!`,
      data: {
        code: promo.code,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discountAmount,
        originalAmount: numericAmount,
        finalAmount,
        applicableTo: promo.applicableTo,
      },
    });
  } catch (error) {
    console.error("Error validating promo code:", error);
    res.status(500).json({
      success: false,
      message: "Error validating promo code",
      error: error.message,
    });
  }
});

// GET /api/promos/active - Get all currently active promos for public showcase
router.get("/active", optionalAuth, async (req, res) => {
  try {
    await ensureDefaultPromos();
    const now = new Date();
    const promos = await Promo.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    })
      .select("code description discountType discountValue minOrderAmount maxDiscount applicableTo")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: promos.length,
      data: promos,
    });
  } catch (error) {
    console.error("Error fetching active promos:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching active promos",
      error: error.message,
    });
  }
});

// GET /api/promos - Admin / Staff list all promos
router.get("/", authMiddleware, staffOnly, async (req, res) => {
  try {
    await ensureDefaultPromos();
    const promos = await Promo.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: promos.length,
      data: promos,
    });
  } catch (error) {
    console.error("Error fetching promos:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching promos",
      error: error.message,
    });
  }
});

// POST /api/promos - Admin / Staff create a new promo
router.post("/", authMiddleware, staffOnly, async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
      applicableTo,
    } = req.body;

    if (!code || !discountValue || !validUntil) {
      return res.status(400).json({
        success: false,
        message: "Code, discount value, and valid until date are required",
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = await Promo.findOne({ code: cleanCode });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Promo code "${cleanCode}" already exists`,
      });
    }

    const newPromo = new Promo({
      code: cleanCode,
      description: description || "",
      discountType: discountType || "percentage",
      discountValue: parseFloat(discountValue),
      minOrderAmount: parseFloat(minOrderAmount) || 0,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: new Date(validUntil),
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      applicableTo: applicableTo || "all",
    });

    await newPromo.save();

    res.status(201).json({
      success: true,
      message: "Promo created successfully",
      data: newPromo,
    });
  } catch (error) {
    console.error("Error creating promo:", error);
    res.status(500).json({
      success: false,
      message: "Error creating promo",
      error: error.message,
    });
  }
});

// PUT /api/promos/:id - Admin / Staff update promo
router.put("/:id", authMiddleware, staffOnly, async (req, res) => {
  try {
    const promo = await Promo.findById(req.params.id);
    if (!promo) {
      return res.status(404).json({
        success: false,
        message: "Promo not found",
      });
    }

    const allowedUpdates = [
      "description",
      "discountType",
      "discountValue",
      "minOrderAmount",
      "maxDiscount",
      "validFrom",
      "validUntil",
      "usageLimit",
      "isActive",
      "applicableTo",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        promo[field] = req.body[field];
      }
    });

    await promo.save();

    res.json({
      success: true,
      message: "Promo updated successfully",
      data: promo,
    });
  } catch (error) {
    console.error("Error updating promo:", error);
    res.status(500).json({
      success: false,
      message: "Error updating promo",
      error: error.message,
    });
  }
});

// DELETE /api/promos/:id - Admin / Staff delete promo
router.delete("/:id", authMiddleware, staffOnly, async (req, res) => {
  try {
    const promo = await Promo.findByIdAndDelete(req.params.id);
    if (!promo) {
      return res.status(404).json({
        success: false,
        message: "Promo not found",
      });
    }

    res.json({
      success: true,
      message: "Promo deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting promo:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting promo",
      error: error.message,
    });
  }
});

export default router;

