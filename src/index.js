import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import "dotenv/config";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import learningModulesRoutes from "./routes/learningModulesRoutes.js";
import leaderboardsRoutes from "./routes/leaderboardsRoutes.js";
import favoritesRoutes from "./routes/favoritesRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import ratingRoutes from "./routes/ratingRoutes.js";
import stylistsRoutes from "./routes/stylistsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import promoRoutes from "./routes/promoRoutes.js";
import { connectDB } from "./lib/db.js";
import fs from "fs";
import path from "path";

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), "uploads/profile-images");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads/profile-images directory");
}

const app = express();
const httpServer = createServer(app);

// ✅ MULTI-CLIENT CORS CONFIGURATION (Admin Dashboard, Website, Mobile App)
const allowedOrigins = [
  process.env.ADMIN_CLIENT_URL || "http://localhost:5173", // Admin Dashboard
  process.env.WEB_CLIENT_URL || "http://localhost:5174", // Web Client
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:19006",
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== "production") {
    if (
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)
    ) {
      return true;
    }
  }
  return false;
};

const corsOptions = {
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.log(`🚫 CORS blocked for origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));

// Initialize Socket.IO with Multi-Client & Mobile Support
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Expose globally for service layer real-time events
global.io = io;

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Attach io to req BEFORE all routes are defined
app.use((req, res, next) => {
  req.io = io;
  // Add origin detection for logging
  const origin = req.get("origin") || req.get("referer");
  req.clientOrigin = origin;
  // Log client type based on origin or header
  if (origin && origin.includes("5173")) {
    req.clientType = "admin-dashboard";
  } else if (origin && origin.includes("5174")) {
    req.clientType = "web-client";
  } else if (req.get("x-client-platform") === "mobile" || !origin) {
    req.clientType = "mobile-app";
  } else {
    req.clientType = "unknown";
  }
  next();
});

// Socket.IO connection handling with client type detection
io.on("connection", (socket) => {
  console.log(`\n✅ Client connected: ${socket.id}`);
  // Detect client type from handshake
  const clientOrigin =
    socket.handshake.headers.origin || socket.handshake.headers.referer;
  const handshakeType = socket.handshake.query?.clientType;
  let clientType = handshakeType || "unknown";

  if (clientOrigin && clientOrigin.includes("5173")) {
    clientType = "admin-dashboard";
  } else if (clientOrigin && clientOrigin.includes("5174")) {
    clientType = "web-client";
  } else if (handshakeType === "mobile-app" || !clientOrigin) {
    clientType = "mobile-app";
  }
  socket.clientType = clientType;
  console.log(`   Client Type: ${clientType}`);
  console.log(`   Origin: ${clientOrigin}`);
  console.log(`   Total connected clients: ${io.engine.clientsCount}`);

  // Handle admin dashboard connection (5173)
  socket.on("join-admin-dashboard", (data) => {
    const { adminId, role } = data || {};
    socket.join("admin-dashboard");
    socket.adminId = adminId;
    socket.role = role;
    socket.clientType = "admin-dashboard";

    console.log(`👤 Admin ${adminId} (${role}) joined dashboard room`);
    const clientsInRoom = io.sockets.adapter.rooms.get("admin-dashboard");
    console.log(
      `   👥 Total admins in dashboard room: ${
        clientsInRoom ? clientsInRoom.size : 0
      }`
    );
    // Send initial connection confirmation
    socket.emit("connected", {
      message: "Connected to real-time dashboard",
      socketId: socket.id,
      clientType: socket.clientType,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle web client connections (5174)
  socket.on("join-web-client", (data) => {
    const { userId, userType } = data || {};
    socket.join("web-client");
    socket.userId = userId;
    socket.userType = userType;
    socket.clientType = "web-client";

    console.log(`🌐 Web Client User ${userId} (${userType}) joined`);

    // Join user-specific rooms for notifications and live updates
    if (userId) {
      socket.join(`user-${userId}`);
      socket.join(`customer-${userId}`);
      socket.join(`appointments-${userId}`);
    }

    socket.emit("web-client-connected", {
      message: "Connected to web client real-time services",
      socketId: socket.id,
      clientType: socket.clientType,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle mobile app connections (React Native / Expo)
  socket.on("join-mobile-client", (data) => {
    const { userId, role } = data || {};
    socket.join("mobile-app");
    socket.userId = userId;
    socket.userType = role || "customer";
    socket.clientType = "mobile-app";

    console.log(`📱 Mobile App User ${userId} (${role || "customer"}) joined`);

    if (userId) {
      socket.join(`user-${userId}`);
      socket.join(`customer-${userId}`);
      socket.join(`appointments-${userId}`);
    }

    socket.emit("mobile-client-connected", {
      message: "Connected to mobile real-time services",
      socketId: socket.id,
      clientType: "mobile-app",
      timestamp: new Date().toISOString(),
    });
  });

  // Handle staff attendance room (both clients)
  socket.on("join-attendance", (data) => {
    const { userId } = data || {};
    socket.join(`attendance-${userId}`);
    console.log(
      `📍 User ${userId} joined attendance room (${socket.clientType})`
    );
  });

  // Handle customer booking notifications (both clients)
  socket.on("join-customer-notifications", (data) => {
    const { customerId } = data || {};
    socket.join(`customer-${customerId}`);
    console.log(
      `🔔 Customer ${customerId} joined notifications (${socket.clientType})`
    );
  });

  // Handle appointment updates
  socket.on("join-appointment-updates", (data) => {
    const { customerId } = data || {};
    socket.join(`appointments-${customerId}`);
    console.log(
      `📅 Customer ${customerId} joined appointment updates (${socket.clientType})`
    );
  });

  // Handle service updates
  socket.on("join-service-updates", () => {
    socket.join("service-updates");
    console.log(`💇 Joined service updates (${socket.clientType})`);
  });

  // Handle product updates
  socket.on("join-product-updates", () => {
    socket.join("product-updates");
    console.log(`🛍️ Joined product updates (${socket.clientType})`);
  });

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(`\n❌ Client disconnected: ${socket.id}`);
    console.log(`   Client Type: ${socket.clientType}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Remaining clients: ${io.engine.clientsCount}`);
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error(
      `⚠️ Socket error for ${socket.id} (${socket.clientType}):`,
      error
    );
  });

  // Handle reconnection attempts
  socket.on("reconnect_attempt", () => {
    console.log(
      `🔄 Client ${socket.id} (${socket.clientType}) attempting to reconnect`
    );
  });
});

// Routes - io is now available via req.io in all routes
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/products", productRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/learning-modules", learningModulesRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/leaderboards", leaderboardsRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/stylists", stylistsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/promos", promoRoutes);
app.use("/uploads", express.static("uploads"));

// ✅ ENHANCED HEALTH CHECK ENDPOINT
app.get("/api/health", (req, res) => {
  const clientStats = {
    "admin-dashboard": 0,
    "web-client": 0,
    "mobile-app": 0,
    unknown: 0,
  };

  io.sockets.sockets.forEach((socket) => {
    clientStats[socket.clientType] = (clientStats[socket.clientType] || 0) + 1;
  });

  res.json({
    success: true,
    message: "Backend server is running with multi-platform support",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    clientUrls: {
      admin: process.env.ADMIN_CLIENT_URL || "http://localhost:5173",
      web: process.env.WEB_CLIENT_URL || "http://localhost:5174",
    },
    currentRequest: {
      origin: req.clientOrigin,
      clientType: req.clientType,
    },
    connectedClients: {
      total: io.engine.clientsCount,
      byType: clientStats,
    },
  });
});

// Root endpoint
app.get("/", (req, res) => {
  const clientStats = {
    "admin-dashboard": 0,
    "web-client": 0,
    "mobile-app": 0,
    unknown: 0,
  };

  io.sockets.sockets.forEach((socket) => {
    clientStats[socket.clientType] = (clientStats[socket.clientType] || 0) + 1;
  });

  res.json({
    message: "Salon Services API with Multi-Platform WebSocket & Promo Engine Support",
    version: "2.5.0",
    status: "online",
    clientUrls: {
      admin: process.env.ADMIN_CLIENT_URL || "http://localhost:5173",
      web: process.env.WEB_CLIENT_URL || "http://localhost:5174",
    },
    currentRequest: {
      origin: req.clientOrigin,
      clientType: req.clientType,
    },
    websocket: {
      status: "enabled",
      url: `ws://localhost:${PORT}`,
      connectedClients: {
        total: io.engine.clientsCount,
        byType: clientStats,
      },
      rooms: {
        admin: [
          "admin-dashboard - Real-time dashboard updates",
          "attendance-{userId} - Staff attendance updates",
        ],
        web: [
          "web-client - General web client connections",
          "user-{userId} - User-specific notifications",
          "appointments-{customerId} - Appointment updates",
          "service-updates - Service catalog updates",
          "product-updates - Product catalog updates",
          "customer-{customerId} - Customer notifications",
        ],
        mobile: [
          "mobile-app - Mobile client connections",
          "user-{userId} - Real-time mobile alerts",
        ],
      },
    },
  });
});

// WebSocket status endpoint with client breakdown
app.get("/api/websocket/status", (req, res) => {
  const connectedClients = io.engine.clientsCount;

  const clientStats = {
    "admin-dashboard": 0,
    "web-client": 0,
    "mobile-app": 0,
    unknown: 0,
  };

  const clientDetails = {
    "admin-dashboard": [],
    "web-client": [],
    "mobile-app": [],
    unknown: [],
  };

  io.sockets.sockets.forEach((socket) => {
    const cType = socket.clientType || "unknown";
    clientStats[cType] = (clientStats[cType] || 0) + 1;
    if (clientDetails[cType]) {
      clientDetails[cType].push({
        id: socket.id,
        userId: socket.userId || socket.adminId || "unknown",
        rooms: Array.from(socket.rooms || []),
      });
    }
  });

  const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(
    (room) => !io.sockets.sockets.has(room)
  );

  const roomDetails = {};
  rooms.forEach((room) => {
    const clients = io.sockets.adapter.rooms.get(room);
    roomDetails[room] = clients ? clients.size : 0;
  });

  res.json({
    success: true,
    data: {
      status: "active",
      connectedClients,
      clientStats,
      clientDetails,
      activeRooms: rooms,
      roomDetails,
      timestamp: new Date().toISOString(),
    },
  });
});

// Test emission endpoint
app.post("/api/test/emit", (req, res) => {
  const {
    type = "test",
    message = "Test message",
    room = "admin-dashboard",
    targetClientType = null,
  } = req.body;

  if (!req.io) {
    return res.status(500).json({
      success: false,
      message: "Socket.IO not available",
    });
  }

  const payload = {
    type,
    action: "manual-test",
    data: {
      message,
      source: req.clientType,
      target: targetClientType,
    },
    timestamp: new Date().toISOString(),
  };

  let clientsNotified = 0;

  if (targetClientType) {
    io.sockets.sockets.forEach((socket) => {
      if (socket.clientType === targetClientType) {
        socket.emit("dashboard-update", payload);
        clientsNotified++;
      }
    });
  } else {
    req.io.to(room).emit("dashboard-update", payload);
    const clientsInRoom = req.io.sockets.adapter.rooms.get(room);
    clientsNotified = clientsInRoom ? clientsInRoom.size : 0;
  }

  res.json({
    success: true,
    message: targetClientType
      ? `Test event emitted to ${targetClientType} clients`
      : `Test event emitted to ${room} room`,
    clientsNotified,
    target: targetClientType || room,
    payload,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    yourClient: {
      origin: req.clientOrigin,
      type: req.clientType,
    },
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("❌ Server Error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: error.message,
    clientInfo: {
      origin: req.clientOrigin,
      type: req.clientType,
    },
  });
});

// Connect to DB and start server
connectDB()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 Salon Services API Server                        ║
║                                                        ║
║   📡 Server:     http://localhost:${PORT}             ║
║   📚 API Docs:   http://localhost:${PORT}/            ║
║   🔌 WebSocket:  ws://localhost:${PORT}               ║
║   ⚡ Status:     MULTI-PLATFORM READY (Web + Mobile)  ║
║                                                        ║
║   👨‍💼 Admin Dashboard: ${
        process.env.ADMIN_CLIENT_URL || "http://localhost:5173"
      } ║
║   🌐 Web Client:      ${
        process.env.WEB_CLIENT_URL || "http://localhost:5174"
      } ║
║   📱 Mobile Support:  Active (Expo / React Native)     ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
      `);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received, closing server gracefully...");
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT received, closing server gracefully...");
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export { io };
