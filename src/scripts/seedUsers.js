import dotenv from "dotenv";
import { connectDB } from "../lib/db.js";
import users from "../data/users.js";

dotenv.config();

const seedUsers = async () => {
  try {
    console.log("👥 Starting to seed users...");

    await connectDB();

    // Safely log which host is connected
    if (process.env.MONGO_URI) {
      const uri = process.env.MONGO_URI;
      const host = uri.includes("@")
        ? uri.split("@")[1].split("/")[0]
        : uri.split("//")[1].split("/")[0];
      console.log("Database connected:", host);
    } else {
      console.log("Database connected (MONGO_URI not set in .env)");
    }

    // Dynamic import to avoid module loading issues
    const { default: User } = await import("../models/User.js");

    // Clear existing users
    await User.deleteMany();
    console.log("🗑️  Cleared existing users");

    // Insert users
    const createdUsers = await User.insertMany(users);
    console.log(`✅ Successfully seeded ${createdUsers.length} users`);

    // Log created users (without passwords)
    createdUsers.forEach((user) => {
      console.log(
        `   - ${user.name} (${user.email}) - ${
          user.isAdmin ? "Admin" : "Customer"
        }`
      );
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding users:", error.message);
    process.exit(1);
  }
};

seedUsers();
