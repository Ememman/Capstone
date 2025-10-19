import Product from "../models/Product.js";
import { connectDB } from "../lib/db.js";

const products = [
  {
    name: "Tresemme Keratin Argan Morocco",
    category: "Hair",
    price: 500,
    rating: 5.0,
    totalRaters: 1027,
    description:
      "Premium keratin treatment with argan oil from Morocco for smooth, healthy hair",
    inStock: true,
  },
  {
    name: "Tresemme Sulfate Free Shampoo & Conditioner",
    category: "Hair",
    price: 500,
    rating: 5.0,
    totalRaters: 1027,
    description:
      "Gentle sulfate-free formula that cleanses without stripping natural oils",
    inStock: true,
  },
  {
    name: "Tresemme Purple Mask",
    category: "Hair",
    price: 500,
    rating: 5.0,
    totalRaters: 1027,
    description:
      "Color-correcting purple mask for blonde and silver hair tones",
    inStock: true,
  },
  {
    name: "Tresemme Purple Shampoo & Conditioner",
    category: "Hair",
    price: 500,
    rating: 5.0,
    totalRaters: 1027,
    description:
      "Purple-tinted shampoo and conditioner set for maintaining blonde hair",
    inStock: true,
  },
];

const seedProducts = async () => {
  try {
    console.log("🌱 Starting product seeding...");

    // Connect to database
    await connectDB();

    // Clear existing products
    await Product.deleteMany({});
    console.log("🗑️  Cleared existing products");

    // Insert new products
    const createdProducts = await Product.insertMany(products);
    console.log(`✅ Successfully seeded ${createdProducts.length} products`);

    // Display seeded products
    console.log("\n📦 Seeded Products:");
    createdProducts.forEach((product, index) => {
      console.log(
        `${index + 1}. ${product.name} - ${product.category} - ₱${
          product.price
        }`
      );
    });

    console.log("\n🎉 Product seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding products:", error);
    process.exit(1);
  }
};

// Run the seeding function
seedProducts();
