// server.js - Complete Fixed Version with WebSocket Support
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import "dotenv/config";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import appointmentRoutes from "./routes/appointmentRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import learningModulesRoutes from "./routes/learningModulesRoutes.js";
import leaderboardsRoutes from "./routes/leaderboardsRoutes.js";
import favoritesRoutes from "./routes/favoritesRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import stylistsRoutes from "./routes/stylistsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
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

// Initialize Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (for testing with frontend)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// ✅ CRITICAL FIX: Attach io to req BEFORE all routes are defined
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`\n✅ Client connected: ${socket.id}`);
  console.log(`   Total connected clients: ${io.engine.clientsCount}`);

  // Handle admin dashboard connection
  socket.on("join-admin-dashboard", (data) => {
    const { adminId, role } = data || {};
    socket.join("admin-dashboard");
    socket.adminId = adminId;
    socket.role = role;

    console.log(`👤 Admin ${adminId} (${role}) joined dashboard room`);
    console.log(`   Socket ID: ${socket.id}`);

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
      timestamp: new Date().toISOString(),
    });

    // Send a test update to confirm connection
    setTimeout(() => {
      socket.emit("dashboard-update", {
        type: "system",
        action: "connection-confirmed",
        data: {
          message: "Real-time updates are active",
          socketId: socket.id,
        },
        timestamp: new Date().toISOString(),
      });
    }, 1000);
  });

  // Handle staff attendance room
  socket.on("join-attendance", (data) => {
    const { userId } = data || {};
    socket.join(`attendance-${userId}`);
    console.log(`📍 User ${userId} joined attendance room`);
  });

  // Handle customer booking notifications
  socket.on("join-customer-notifications", (data) => {
    const { customerId } = data || {};
    socket.join(`customer-${customerId}`);
    console.log(`🔔 Customer ${customerId} joined notifications`);
  });

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(`\n❌ Client disconnected: ${socket.id}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Remaining clients: ${io.engine.clientsCount}`);
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error(`⚠️ Socket error for ${socket.id}:`, error);
  });

  // Handle reconnection attempts
  socket.on("reconnect_attempt", () => {
    console.log(`🔄 Client ${socket.id} attempting to reconnect`);
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
app.use("/api/favorites", favoritesRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/learning-modules", learningModulesRoutes);
app.use("/api/leaderboards", leaderboardsRoutes);
app.use("/api/stylists", stylistsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/uploads", express.static("uploads"));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Salon Services API with Real-Time WebSocket Support",
    version: "2.0.0",
    status: "online",
    websocket: {
      status: "enabled",
      url: `ws://localhost:${PORT}`,
      connectedClients: io.engine.clientsCount,
      rooms: [
        "admin-dashboard - Real-time dashboard updates",
        "attendance-{userId} - Staff attendance updates",
        "customer-{customerId} - Customer notifications",
      ],
    },
    endpoints: {
      // Authentication endpoints
      "GET /api/auth/roles": "Get available user roles for login",
      "POST /api/auth/login": "User login with role selection",
      "POST /api/auth/register": "User registration (legacy)",
      "POST /api/auth/send-phone-otp": "Send OTP to phone for registration",
      "POST /api/auth/verify-phone-otp": "Verify phone OTP",
      "POST /api/auth/setup-profile": "Setup username and profile image",
      "POST /api/auth/setup-email": "Setup email and password",
      "POST /api/auth/verify-email-otp":
        "Verify email OTP and complete registration",
      "POST /api/auth/auth/google": "Google authentication (customers only)",
      "POST /api/auth/auth/facebook":
        "Facebook authentication (customers only)",
      "POST /api/auth/change-password": "Change user password",
      "POST /api/auth/forgot-password": "Request password reset token",
      "POST /api/auth/reset-password": "Reset password with token",

      // Admin Authentication endpoints
      "POST /api/admin/auth/register":
        "Create admin account (super admin only)",
      "POST /api/admin/auth/login": "Admin and staff login",
      "POST /api/admin/auth/logout": "Admin logout",
      "GET /api/admin/auth/me": "Get current admin profile",
      "PUT /api/admin/auth/profile": "Update admin profile",
      "POST /api/admin/auth/change-password": "Change admin password",

      // Admin Dashboard
      "GET /api/admin/dashboard/overview":
        "Get dashboard overview with real-time metrics",

      // Testing endpoints
      "POST /api/test/emit": "Test WebSocket emission",
      "GET /api/websocket/status": "Get WebSocket status",
    },
  });
});

// WebSocket status endpoint
app.get("/api/websocket/status", (req, res) => {
  const connectedClients = io.engine.clientsCount;
  const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(
    (room) => !io.sockets.sockets.has(room)
  );

  // Get detailed room info
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
      activeRooms: rooms,
      roomDetails,
      timestamp: new Date().toISOString(),
    },
  });
});

// ✅ TEST ENDPOINT - Manually test WebSocket emissions
app.post("/api/test/emit", (req, res) => {
  const {
    type = "test",
    message = "Test message",
    room = "admin-dashboard",
  } = req.body;

  console.log("\n🧪 Manual WebSocket Test:");
  console.log(`   Type: ${type}`);
  console.log(`   Message: ${message}`);
  console.log(`   Room: ${room}`);
  console.log(`   io exists: ${!!req.io}`);

  if (!req.io) {
    return res.status(500).json({
      success: false,
      message: "Socket.IO not available",
    });
  }

  const payload = {
    type,
    action: "manual-test",
    data: { message },
    timestamp: new Date().toISOString(),
  };

  req.io.to(room).emit("dashboard-update", payload);

  const clientsInRoom = req.io.sockets.adapter.rooms.get(room);
  const clientCount = clientsInRoom ? clientsInRoom.size : 0;

  console.log(`   ✅ Emitted to ${clientCount} client(s) in room "${room}"`);

  res.json({
    success: true,
    message: `Test event emitted to ${room} room`,
    clientsNotified: clientCount,
    payload,
  });
});

// ✅ BROADCAST TO ALL CLIENTS TEST
app.post("/api/test/broadcast", (req, res) => {
  const { message = "Broadcast test" } = req.body;

  console.log("\n📢 Broadcasting to all clients...");

  if (!req.io) {
    return res.status(500).json({
      success: false,
      message: "Socket.IO not available",
    });
  }

  const payload = {
    type: "broadcast-test",
    action: "global-announcement",
    data: { message },
    timestamp: new Date().toISOString(),
  };

  req.io.emit("dashboard-update", payload);

  console.log(`   ✅ Broadcasted to ${req.io.engine.clientsCount} client(s)`);

  res.json({
    success: true,
    message: "Broadcast sent to all connected clients",
    clientsNotified: req.io.engine.clientsCount,
    payload,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("❌ Server Error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: error.message,
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
║   ⚡ Status:     READY                                ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
      `);

      console.log("🔍 WebSocket Debugging Tools:");
      console.log(
        "   📊 Status: GET  http://localhost:3000/api/websocket/status"
      );
      console.log("   🧪 Test:   POST http://localhost:3000/api/test/emit");
      console.log(
        "   📢 Broadcast: POST http://localhost:3000/api/test/broadcast"
      );
      console.log("\n   Example test:");
      console.log("   curl -X POST http://localhost:3000/api/test/emit \\");
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"type":"test","message":"Hello WebSocket!"}\'\n');
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

// Export io for use in other files if needed
export { io };
