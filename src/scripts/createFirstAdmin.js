// scripts/createFirstAdmin.js (TEMPORARY FIX)
import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db.js";
import mongoose from "mongoose";

const createFirstAdmin = async () => {
  try {
    await connectDB();

    // Use MongoDB directly to bypass Mongoose validation
    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Check if admin already exists
    const existingAdmin = await usersCollection.findOne({
      $or: [{ role: "admin" }, { email: "admin@sandrealee.com" }],
    });

    if (existingAdmin) {
      console.log("Admin user already exists:");
      console.log(`Username: ${existingAdmin.username}`);
      console.log(`Email: ${existingAdmin.email}`);
      return;
    }

    // Create first admin directly in collection
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash("Admin123", saltRounds);

    const adminDoc = {
      username: "superadmin",
      firstName: "Super",
      email: "admin@sandrealee.com",
      phoneNumber: "09925433570",
      password: hashedPassword,
      role: "admin",
      position: "System Administrator",
      adminId: "ADMIN-0001",
      hireDate: new Date(),
      profileImage:
        "https://api.dicebear.com/7.x/avataaars/svg?seed=superadmin",
      registrationStep: "completed",
      verification: {
        phoneVerified: true,
        emailVerified: true,
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await usersCollection.insertOne(adminDoc);

    console.log("✅ First admin user created successfully!");
    console.log("📧 Login credentials:");
    console.log(`   Email: admin@sandrealee.com`);
    console.log(`   Password: Admin123`);
    console.log("\n⚠️  Please change the password after first login!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating first admin:", error);
    process.exit(1);
  }
};

createFirstAdmin();
