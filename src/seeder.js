import dotenv from "dotenv";
import { connectDB } from "../lib/db.js";
import users from "./data/users.js";
import products from "./data/products.js";
import services from "./data/services.js";
import appointments from "./data/appointments.js";

dotenv.config();

const importData = async () => {
  try {
    await connectDB();

    const { default: User } = await import("../models/User.js");
    const { default: Product } = await import("../models/Product.js");
    const { default: Service } = await import("../models/Service.js");
    const { default: Appointment } = await import("../models/Appointment.js");

    await User.deleteMany();
    await Product.deleteMany();
    await Service.deleteMany();
    await Appointment.deleteMany();

    const createdUsers = await User.insertMany(users);

    await Product.insertMany(products);
    const createdServices = await Service.insertMany(services);

    const appointmentsWithRefs = appointments.map((appointment) => {
      const customer = createdUsers.find(
        (user) => user.email === appointment.customerEmail
      );
      const service = createdServices.find(
        (service) => service.name === appointment.serviceName
      );

      return {
        ...appointment,
        customer: customer._id,
        service: service._id,
        customerEmail: undefined,
        serviceName: undefined,
      };
    });

    await Appointment.insertMany(appointmentsWithRefs);

    console.log("Data Imported Successfully!");
    process.exit();
  } catch (error) {
    console.error("Error importing data:", error);
    process.exit(1);
  }
};

const destroyData = async () => {
  try {
    await connectDB();

    const { default: User } = await import("../models/User.js");
    const { default: Product } = await import("../models/Product.js");
    const { default: Service } = await import("../models/Service.js");
    const { default: Appointment } = await import("../models/Appointment.js");

    await User.deleteMany();
    await Product.deleteMany();
    await Service.deleteMany();
    await Appointment.deleteMany();

    console.log("Data Destroyed Successfully!");
    process.exit();
  } catch (error) {
    console.error("Error destroying data:", error);
    process.exit(1);
  }
};

if (process.argv[2] === "-d") {
  destroyData();
} else {
  importData();
}
