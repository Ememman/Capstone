import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI || "mongodb://localhost:27017/salon_database";
    const conn = await mongoose.connect(mongoUri);
    console.log(`Database connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error("Error connecting to database:", error.message);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    } else {
      console.warn(
        "⚠️ Continuing in development mode without MongoDB connection. Some routes may fail without DB."
      );
    }
  }
};
