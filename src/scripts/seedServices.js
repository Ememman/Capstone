import Service from "../models/Service.js";
import { connectDB } from "../lib/db.js";

const servicesData = [
  // Hair Treatments
  {
    name: "Hot Oil",
    duration: "1hr",
    priceRange: "₱300",
    rating: 5.0,
    totalRaters: 127,
    category: "Hair Treatments",
  },
  {
    name: "UV",
    duration: "1hr",
    priceRange: "₱300",
    rating: 5.0,
    totalRaters: 89,
    category: "Hair Treatments",
  },
  {
    name: "Hair Spa",
    duration: "1.5hr",
    priceRange: "₱350",
    rating: 5.0,
    totalRaters: 156,
    category: "Hair Treatments",
  },
  {
    name: "Hair Mask",
    duration: "1hr",
    priceRange: "₱300",
    rating: 5.0,
    totalRaters: 203,
    category: "Hair Treatments",
  },
  {
    name: "Olaplex",
    duration: "2hr",
    priceRange: "₱2,500",
    rating: 5.0,
    totalRaters: 45,
    category: "Hair Treatments",
  },
  {
    name: "Cysteine Treatment",
    duration: "3hr",
    priceRange: "₱3,500",
    rating: 5.0,
    totalRaters: 78,
    category: "Hair Treatments",
  },
  {
    name: "L'Oreal Pro 1",
    duration: "2.5hr",
    priceRange: "₱3,500",
    rating: 5.0,
    totalRaters: 67,
    category: "Hair Treatments",
  },
  {
    name: "L'Oreal Pro 2",
    duration: "2.5hr",
    priceRange: "₱3,500",
    rating: 5.0,
    totalRaters: 89,
    category: "Hair Treatments",
  },
  {
    name: "Brazilian Blowout",
    duration: "3hr",
    priceRange: "₱3,500",
    rating: 5.0,
    totalRaters: 156,
    category: "Hair Treatments",
  },

  // Perming & Texture Services
  {
    name: "Perm Anti Length",
    duration: "2hr",
    priceRange: "₱1,888",
    rating: 5.0,
    totalRaters: 234,
    category: "Perming & Texture Services",
  },
  {
    name: "Perm + Haircolor Anti Length",
    duration: "3hr",
    priceRange: "₱2,488",
    rating: 5.0,
    totalRaters: 178,
    category: "Perming & Texture Services",
  },
  {
    name: "Air Perming",
    duration: "2hr",
    priceRange: "₱1,588",
    rating: 5.0,
    totalRaters: 145,
    category: "Perming & Texture Services",
  },
  {
    name: "Basic Color + Air Perm",
    duration: "3hr",
    priceRange: "₱2,188",
    rating: 5.0,
    totalRaters: 167,
    category: "Perming & Texture Services",
  },

  // Nailcare & Basic Services
  {
    name: "Trim",
    duration: "30min",
    priceRange: "₱150",
    rating: 5.0,
    totalRaters: 289,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Manicure",
    duration: "1hr",
    priceRange: "₱150",
    rating: 5.0,
    totalRaters: 345,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Highlights",
    duration: "2hr",
    priceRange: "₱1,200",
    rating: 5.0,
    totalRaters: 198,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Haircut or banged when cool and blow dry",
    duration: "1hr",
    priceRange: "₱450",
    rating: 5.0,
    totalRaters: 267,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Haircut or chemical and blow",
    duration: "1.5hr",
    priceRange: "₱450",
    rating: 5.0,
    totalRaters: 234,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Shampoo",
    duration: "30min",
    priceRange: "₱150",
    rating: 5.0,
    totalRaters: 456,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Blow Dry",
    duration: "45min",
    priceRange: "₱250",
    rating: 5.0,
    totalRaters: 378,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Hair Style",
    duration: "1hr",
    priceRange: "₱350",
    rating: 5.0,
    totalRaters: 189,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Hair Curl Set",
    duration: "1hr",
    priceRange: "₱400",
    rating: 5.0,
    totalRaters: 234,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Hair Iron",
    duration: "45min",
    priceRange: "₱300",
    rating: 5.0,
    totalRaters: 167,
    category: "Nailcare & Basic Services",
  },
  {
    name: "Shaving & Eyebrows",
    duration: "30min",
    priceRange: "₱100",
    rating: 5.0,
    totalRaters: 289,
    category: "Nailcare & Basic Services",
  },

  // Styling & Special Services
  {
    name: "Tone and Make-up",
    duration: "1.5hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 123,
    category: "Styling & Special Services",
  },
  {
    name: "VIP",
    duration: "2hr",
    priceRange: "₱2,500",
    rating: 5.0,
    totalRaters: 67,
    category: "Styling & Special Services",
  },
  {
    name: "MIC",
    duration: "1hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 89,
    category: "Styling & Special Services",
  },
  {
    name: "Diamond",
    duration: "3hr",
    priceRange: "₱8,000",
    rating: 5.0,
    totalRaters: 34,
    category: "Styling & Special Services",
  },

  // Rebonding/Straightening
  {
    name: "Rebond Only",
    duration: "3hr",
    priceRange: "₱3,000",
    rating: 5.0,
    totalRaters: 234,
    category: "Rebonding/Straightening",
  },
  {
    name: "Rebond + Haircut",
    duration: "3.5hr",
    priceRange: "₱3,299",
    rating: 5.0,
    totalRaters: 189,
    category: "Rebonding/Straightening",
  },
  {
    name: "Rebond + Hot Oil",
    duration: "3.5hr",
    priceRange: "₱3,399",
    rating: 5.0,
    totalRaters: 167,
    category: "Rebonding/Straightening",
  },
  {
    name: "Rebond + Basic Color",
    duration: "4hr",
    priceRange: "₱3,288",
    rating: 5.0,
    totalRaters: 145,
    category: "Rebonding/Straightening",
  },

  // Combination Services
  {
    name: "Rebond + Hair Color + Hair Mask + Haircut",
    duration: "5hr",
    priceRange: "₱3,999",
    rating: 5.0,
    totalRaters: 78,
    category: "Combination Services",
  },
  {
    name: "Rebond + Hair Color + Highlights + Haircut + Hot Oil",
    duration: "6hr",
    priceRange: "₱5,999",
    rating: 5.0,
    totalRaters: 56,
    category: "Combination Services",
  },
  {
    name: "Rebond + Hair Color + Hair Botox + Hair Cut",
    duration: "5hr",
    priceRange: "₱4,599",
    rating: 5.0,
    totalRaters: 67,
    category: "Combination Services",
  },
  {
    name: "Rebond + Keratin + Haircolor + Haircut",
    duration: "5hr",
    priceRange: "₱5,399",
    rating: 5.0,
    totalRaters: 45,
    category: "Combination Services",
  },
  {
    name: "Hair Color + Keratin Blow Out",
    duration: "4hr",
    priceRange: "₱2,999",
    rating: 5.0,
    totalRaters: 89,
    category: "Combination Services",
  },
  {
    name: "Rebond + Keratin + Haircut",
    duration: "4hr",
    priceRange: "₱2,999",
    rating: 5.0,
    totalRaters: 123,
    category: "Combination Services",
  },
  {
    name: "Hair Botox + Haircut",
    duration: "3hr",
    priceRange: "₱2,499",
    rating: 5.0,
    totalRaters: 156,
    category: "Combination Services",
  },
  {
    name: "Keratin Treatment + Haircut",
    duration: "3hr",
    priceRange: "₱1,999",
    rating: 5.0,
    totalRaters: 178,
    category: "Combination Services",
  },
  {
    name: "Keratin Treatment + Haircolor + Haircut",
    duration: "4hr",
    priceRange: "₱3,399",
    rating: 5.0,
    totalRaters: 134,
    category: "Combination Services",
  },

  // Hair Coloring
  {
    name: "Basic Color",
    duration: "2hr",
    priceRange: "₱1,000",
    rating: 5.0,
    totalRaters: 345,
    category: "Hair Coloring",
  },
  {
    name: "Fashion Color",
    duration: "2.5hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 267,
    category: "Hair Coloring",
  },
  {
    name: "Bleach Only",
    duration: "2hr",
    priceRange: "₱1,000",
    rating: 5.0,
    totalRaters: 234,
    category: "Hair Coloring",
  },
  {
    name: "Highlights Only",
    duration: "2hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 198,
    category: "Hair Coloring",
  },
  {
    name: "Basic Highlights Only",
    duration: "2hr",
    priceRange: "₱1,999",
    rating: 5.0,
    totalRaters: 167,
    category: "Hair Coloring",
  },
  {
    name: "Color Highlights",
    duration: "2.5hr",
    priceRange: "₱1,000",
    rating: 5.0,
    totalRaters: 189,
    category: "Hair Coloring",
  },
  {
    name: "Balayage",
    duration: "3hr",
    priceRange: "₱2,000",
    rating: 5.0,
    totalRaters: 145,
    category: "Hair Coloring",
  },
  {
    name: "Peek A Boo",
    duration: "2hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 123,
    category: "Hair Coloring",
  },

  // Hair Extensions
  {
    name: "Hair Extension Removal",
    duration: "1hr",
    priceRange: "₱3,000",
    rating: 5.0,
    totalRaters: 67,
    category: "Hair Extensions",
  },
  {
    name: "Hair Extension Only/Starting",
    duration: "2hr",
    priceRange: "₱10,000",
    rating: 5.0,
    totalRaters: 45,
    category: "Hair Extensions",
  },

  // Package Sets
  {
    name: "Trim (Package)",
    duration: "30min",
    priceRange: "₱150",
    rating: 5.0,
    totalRaters: 234,
    category: "Package Sets",
  },
  {
    name: "Set Set",
    duration: "1hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 156,
    category: "Package Sets",
  },
  {
    name: "Wet Set",
    duration: "1hr",
    priceRange: "₱1,500",
    rating: 5.0,
    totalRaters: 167,
    category: "Package Sets",
  },
];

const seedServices = async () => {
  try {
    console.log("🌱 Starting to seed services...");

    // Connect to database
    await connectDB();

    // Clear existing services
    await Service.deleteMany({});
    console.log("🗑️  Cleared existing services");

    // Insert new services
    const services = await Service.insertMany(servicesData);
    console.log(`✅ Successfully seeded ${services.length} services`);

    // Show categories
    const categories = await Service.distinct("category");
    console.log(`📂 Categories: ${categories.join(", ")}`);

    console.log("🎉 Service seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding services:", error);
    process.exit(1);
  }
};

// Run the seeding function
seedServices();
