require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors"); // Import cors
const authRoutes = require("./routes/auth");

const app = express();

// Middleware//
app.use(cors()); // Add CORS middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);

// Database Connection
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully!");

    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
};

startServer();
