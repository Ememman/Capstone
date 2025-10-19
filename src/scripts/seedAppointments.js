import Appointment from "../models/Appointment.js";
import User from "../models/User.js";
import Service from "../models/Service.js";
import { connectDB } from "../lib/db.js";

const appointmentsData = [
  // Upcoming appointments
  {
    customerName: "John Doe",
    customerPhone: "+63 999 5433 570",
    customerEmail: "johndoe@gmail.com",
    serviceName: "Shampoo",
    appointmentDate: new Date("2025-05-03T10:30:00Z"),
    status: "upcoming",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "Regular customer, prefers gentle shampoo",
  },
  {
    customerName: "Jane Smith",
    customerPhone: "+63 999 5433 571",
    customerEmail: "janesmith@gmail.com",
    serviceName: "Rebond + Haircut",
    appointmentDate: new Date("2025-05-25T12:30:00Z"),
    status: "upcoming",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "First time rebonding",
  },
  {
    customerName: "Mike Johnson",
    customerPhone: "+63 999 5433 572",
    customerEmail: "mikejohnson@gmail.com",
    serviceName: "Haircut (TRIM)",
    appointmentDate: new Date("2025-05-25T12:30:00Z"),
    status: "upcoming",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
  },
  // Completed appointments
  {
    customerName: "Sarah Wilson",
    customerPhone: "+63 999 6433 697",
    customerEmail: "sarahwilson@gmail.com",
    serviceName: "Hair Spa",
    appointmentDate: new Date("2025-05-01T10:00:00Z"),
    status: "completed",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    completedAt: new Date("2025-05-01T11:30:00Z"),
    rating: 5,
    review: "Excellent service, very relaxing!",
  },
  {
    customerName: "David Brown",
    customerPhone: "+63 999 7855 487",
    customerEmail: "davidbrown@gmail.com",
    serviceName: "Haircut",
    appointmentDate: new Date("2025-04-26T16:00:00Z"),
    status: "completed",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    completedAt: new Date("2025-04-26T17:00:00Z"),
    rating: 4,
    review: "Good haircut, professional staff",
  },
  {
    customerName: "Lisa Garcia",
    customerPhone: "+63 999 7855 488",
    customerEmail: "lisagarcia@gmail.com",
    serviceName: "Hotail + Haircut",
    appointmentDate: new Date("2025-04-30T11:30:00Z"),
    status: "completed",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    completedAt: new Date("2025-04-30T13:00:00Z"),
    rating: 5,
    review: "Amazing results, will come back!",
  },
  // Cancelled appointments
  {
    customerName: "Robert Lee",
    customerPhone: "+63 999 5433 570",
    customerEmail: "robertlee@gmail.com",
    serviceName: "BASIC COLOR + AIR PERM",
    appointmentDate: new Date("2025-04-28T11:30:00Z"),
    status: "cancelled",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    cancelledAt: new Date("2025-04-27T09:00:00Z"),
    cancellationReason: "Personal emergency",
  },
  {
    customerName: "James Taylor",
    customerPhone: "+63 999 5433 570",
    customerEmail: "jamestaylor@gmail.com",
    serviceName: "Rebond + Haircut",
    appointmentDate: new Date("2025-05-12T16:30:00Z"),
    status: "cancelled",
    salonLocation: {
      name: "SandreaLee Salon",
      address: "2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    cancelledAt: new Date("2025-05-11T14:00:00Z"),
    cancellationReason: "Schedule conflict",
  },
];

const seedAppointments = async () => {
  try {
    console.log("🗓️  Starting to seed appointments...");

    await connectDB();

    // Clear existing
    await Appointment.deleteMany({});
    console.log("🗑️  Cleared existing appointments");

    const users = await User.find().limit(10);
    const services = await Service.find().limit(20);

    if (users.length === 0 || services.length === 0) {
      console.log(
        "⚠️  Warning: No users or services found. Please seed users and services first."
      );
      process.exit(1);
    }

    const appointmentsWithRefs = appointmentsData.map((appointment, index) => {
      const user = users[index % users.length];
      const service =
        services.find((s) =>
          s.name
            .toLowerCase()
            .includes(appointment.serviceName.toLowerCase().split(" ")[0])
        ) || services[index % services.length];

      return {
        ...appointment,
        customer: user._id,
        service: service._id,
        // Add appointmentTime explicitly
        appointmentTime: appointment.appointmentDate, // ⬅ fix: reuse appointmentDate
      };
    });

    const appointments = await Appointment.insertMany(appointmentsWithRefs);
    console.log(`✅ Successfully seeded ${appointments.length} appointments`);

    const statusCounts = await Appointment.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    console.log("📊 Appointment status breakdown:");
    statusCounts.forEach((status) => {
      console.log(`   ${status._id}: ${status.count}`);
    });

    console.log("🎉 Appointment seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding appointments:", error);
    process.exit(1);
  }
};

seedAppointments();
