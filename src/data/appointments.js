const appointments = [
  {
    customerEmail: "customer1@example.com",
    serviceName: "Shampoo",
    appointmentDate: new Date("2025-05-03T10:30:00.000Z"),
    appointmentTime: "10:30 AM", // ✅ String
    status: "upcoming",
    salonLocation: {
      name: "SandreaLee Salon",
      address:
        "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "First time customer, prefers gentle products",
    reminderSent: false,
    totalAmount: 500,
    paymentStatus: "pending",
  },
  {
    customerEmail: "customer2@example.com",
    serviceName: "Haircut (TRIM)",
    appointmentDate: new Date("2025-05-25T12:30:00.000Z"),
    appointmentTime: "12:30 PM", // ✅ String
    status: "upcoming",
    salonLocation: {
      name: "SandreaLee Salon",
      address:
        "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "Regular customer, likes short cuts",
    reminderSent: true,
    totalAmount: 300,
    paymentStatus: "paid",
  },
  {
    customerEmail: "customer1@example.com",
    serviceName: "Rebond + Haircut",
    appointmentDate: new Date("2025-05-12T16:30:00.000Z"),
    appointmentTime: "4:30 PM", // ✅ String
    status: "upcoming",
    salonLocation: {
      name: "SandreaLee Salon",
      address:
        "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "Wants straight hair for graduation",
    reminderSent: false,
    totalAmount: 2500,
    paymentStatus: "pending",
  },
  {
    customerEmail: "customer3@example.com",
    serviceName: "Hair Spa",
    appointmentDate: new Date("2025-05-01T10:00:00.000Z"),
    appointmentTime: "10:00 AM", // ✅ String
    status: "completed",
    salonLocation: {
      name: "SandreaLee Salon",
      address:
        "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "Relaxing treatment completed successfully",
    reminderSent: true,
    totalAmount: 800,
    paymentStatus: "paid",
  },
  {
    customerEmail: "customer2@example.com",
    serviceName: "BASIC COLOR + AIR PERM",
    appointmentDate: new Date("2025-04-28T11:30:00.000Z"),
    appointmentTime: "11:30 AM", // ✅ String
    status: "cancelled",
    salonLocation: {
      name: "SandreaLee Salon",
      address:
        "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "Customer requested cancellation due to schedule conflict",
    reminderSent: false,
    cancellationReason: "Schedule conflict",
    totalAmount: 3500,
    paymentStatus: "refunded",
  },
  {
    customerEmail: "customer3@example.com",
    serviceName: "Rebond + Haircut",
    appointmentDate: new Date("2025-05-12T16:30:00.000Z"),
    appointmentTime: "4:30 PM", // ✅ String
    status: "cancelled",
    salonLocation: {
      name: "SandreaLee Salon",
      address:
        "SandreaLee Salon, 2184 Loyola St, Sampaloc, Manila, 1008 Metro Manila",
    },
    notes: "Customer cancelled last minute",
    reminderSent: false,
    cancellationReason: "Personal emergency",
    totalAmount: 2500,
    paymentStatus: "refunded",
  },
];

export default appointments;
