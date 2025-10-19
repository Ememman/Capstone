import bcrypt from "bcryptjs";

const users = [
  {
    name: "Admin User",
    username: "adminsalon", // ✅ required
    email: "admin@salon.com",
    phoneNumber: "09123456789", // ✅ required
    password: bcrypt.hashSync("Qwertyui03*"), // hashed
    isAdmin: true,
  },
  {
    name: "John Doe",
    username: "johndoes", // ✅ required
    email: "john@example.com",
    phoneNumber: "09987654321", // ✅ required
    password: bcrypt.hashSync("Qwertyui02"), // hashed
    isAdmin: false,
  },
  {
    name: "Jane Smith",
    username: "janedoes", // ✅ required
    email: "jane@example.com",
    phoneNumber: "09111222333", // ✅ required
    password: bcrypt.hashSync("Qwertyui09"), // hashed
    isAdmin: false,
  },
];

export default users;
