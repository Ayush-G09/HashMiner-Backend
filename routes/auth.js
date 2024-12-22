const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const generateOTP = require("../utils/otpGenerator");
const MINER_CONFIG = require("../config/minersConfig");
const CoinPrice = require("../models/CoinPrice");
const moment = require('moment');

const router = express.Router();

// Email Transporter for sending OTP//
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use STARTTLS (false for port 587)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Replace with the App Password
  },
});

// 1. API: Send OTP to user email
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const otp = generateOTP();

  // Send OTP via email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "HashMiner OTP Verification Code",
    text: `Dear User,
  
  To verify your account with HashMiner, please use the following One-Time Password (OTP):
  
  🔒 Your OTP Code: ${otp}
  
  This code is valid for the next 10 minutes. Do not share this code with anyone for security reasons.
  
  If you did not request this OTP, please ignore this email.
  
  Best regards,  
  The HashMiner Team  
    `,
  };

  console.log('called', otp);
  

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "OTP sent successfully", otp }); // OTP sent in response for testing
  } catch (error) {
    res.status(500).json({ message: "Failed to send OTP", error: error.message });
    console.log(error);
  }
});

// 2. API: Register a new user
router.post("/register", async (req, res) => {
  const { username, email, password, referredBy } = req.body;

  // Validate fields
  if (!username || !email || !password)
    return res.status(400).json({ message: "All fields are required" });

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) return res.status(400).json({ message: "User already exists" });

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      referredBy, // Optional, will be null if not provided
    });

    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// 3. API: Login user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    // Check user existence
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      return res.status(400).json({ message: "Invalid credentials" });

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    // Return username, email, and token
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        image: user.image,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

router.delete("/delete-all-users", async (req, res) => {
  try {
    // Delete all users from the collection
    await User.deleteMany({});

    res.status(200).json({ message: "All user data deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user data", error: error.message });
  }
});

// Add a Miner to the User
router.post("/add-miner/:userId", async (req, res) => {
  const { userId } = req.params;
  const { type } = req.body; // Only miner type will be sent

  // Validate the miner type
  if (!type || !MINER_CONFIG[type]) {
    return res.status(400).json({ message: "Invalid or missing miner type." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Predefined hashRate and capacity from config
    const { hashRate, capacity } = MINER_CONFIG[type];

    // Add the miner to the user's miners array
    user.miners.push({
      type,
      hashRate,
      coinsMined: 0,
      capacity,
      status: "Running",
    });

    await user.save();
    res.status(200).json({ message: "Miner added successfully", miners: user.miners });
  } catch (error) {
    res.status(500).json({ message: "Failed to add miner", error: error.message });
  }
});router.post("/add-miner/:userId", async (req, res) => {
  const { userId } = req.params;
  const { type } = req.body;

  if (!type || !MINER_CONFIG[type]) {
    return res.status(400).json({ message: "Invalid or missing miner type." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const { hashRate, capacity } = MINER_CONFIG[type];
    user.miners.push({
      type,
      hashRate,
      coinsMined: 0,
      capacity,
      status: "Running",
      lastCollected: new Date(),
    });

    await user.save();
    res.status(200).json({ message: "Miner added successfully", miners: user.miners });
  } catch (error) {
    res.status(500).json({ message: "Failed to add miner", error: error.message });
  }
});

// 2. Collect Mined Coins and Update Balance
router.post("/collect-coins/:userId/:minerId", async (req, res) => {
  const { userId, minerId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const miner = user.miners.id(minerId);
    if (!miner) return res.status(404).json({ message: "Miner not found." });

    // Add coinsMined to user balance and reset miner
    user.balance += miner.coinsMined;
    miner.coinsMined = 0;
    miner.status = "Running"; // Restart mining
    miner.lastCollected = new Date(); // Update lastCollected

    await user.save();

    res.status(200).json({ message: "Coins collected successfully", balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: "Failed to collect coins", error: error.message });
  }
});

router.get("/user/:id?", async (req, res) => {
  const { id } = req.params;

  try {
    if (id) {
      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.miners.forEach((miner) => {
        // Skip calculations if the miner is not in "running" status
        if (miner.status !== "Running") {
          return;
        }

        const now = new Date();
        const elapsedMinutes = Math.floor((now - miner.lastCollected) / 60000);

        if (elapsedMinutes >= 1 && miner.coinsMined < miner.capacity) {
          const intervals = Math.floor(elapsedMinutes / 1); // Calculate full 1-minute intervals
          const potentialCoins = miner.hashRate * intervals; // Potential coins to be mined

          if (miner.coinsMined + potentialCoins >= miner.capacity) {
            miner.coinsMined = miner.capacity; // Set coinsMined to capacity
            miner.status = "Stopped"; // Update status to stopped
          } else {
            miner.coinsMined += potentialCoins; // Add hash rate for each interval
            miner.lastCollected = new Date(miner.lastCollected.getTime() + intervals * 1 * 60000); // Update lastCollected
          }
        }

        // If coinsMined is already at capacity, set status to stopped
        if (miner.coinsMined >= miner.capacity) {
          miner.status = "Stopped";
        }
      });

      await user.save();
      res.status(200).json({ message: "User data fetched successfully", user });
    } else {
      const users = await User.find();
      res.status(200).json({ message: "All users fetched successfully", users });
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user data", error: error.message });
  }
});

// 4. API: Add or Update User Image
router.post("/user/:id/image", async (req, res) => {
  const { id } = req.params; // User ID from route params
  const { image } = req.body; // Data URI of the image

  if (!image) {
    return res.status(400).json({ message: "Image data is required" });
  }

  try {
    // Find the user by ID
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Add or Update the image field
    user.image = image;
    await user.save();

    res.status(200).json({
      message: user.image ? "Image updated successfully" : "Image added successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        image: user.image,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add/update image", error: error.message });
  }
});

router.post("/update-coin-price", async (req, res) => {
  const { data } = req.body; // The new data value for the last entry

  if (data === undefined) {
    return res.status(400).json({ message: "Data value is required" });
  }

  try {
    // Get today's day of the week
    const today = moment().format("ddd"); // Format: Mon, Tue, etc.

    // Find the coin price data document
    let coinPrice = await CoinPrice.findOne();

    // If no document exists, create a new one
    if (!coinPrice) {
      coinPrice = await CoinPrice.create({
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            data: [20, 45, 28, 80, 99, 43, 50],
          },
        ],
      });
    }

    // Find the index of today in the labels array
    const todayIndex = coinPrice.labels.indexOf(today);

    // If today is not the last label, shift labels and data
    if (todayIndex !== coinPrice.labels.length - 1) {
      // Shift labels and data forward, maintaining order
      coinPrice.labels.shift();
      coinPrice.labels.push(today);

      // Check for missing days (if today is not in sequence)
      const lastDataValue = coinPrice.datasets[0].data[coinPrice.datasets[0].data.length - 1];

      // Add the new value or repeat the previous day's value if it's missing
      coinPrice.datasets[0].data.shift();
      coinPrice.datasets[0].data.push(data);

      // Ensure that if a missing day was detected, we use the previous day's value
      if (todayIndex === coinPrice.labels.length - 2) {
        coinPrice.datasets[0].data[coinPrice.datasets[0].data.length - 2] = lastDataValue;
      }
    } else {
      // If today is the last label, update the value directly
      coinPrice.datasets[0].data[coinPrice.datasets[0].data.length - 1] = data;
    }

    // Save the updated document
    await coinPrice.save();

    res.status(200).json({
      message: "Coin price data updated successfully",
      coinPrice,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update coin price data", error: error.message });
  }
});

// 6. API: Get current coin price data
router.get("/get-coin-price", async (req, res) => {
  try {
    // Find the coin price data document
    const coinPrice = await CoinPrice.findOne();

    // If no document exists, return a 404 error
    if (!coinPrice) {
      return res.status(404).json({ message: "Coin price data not found" });
    }

    // Respond with the coin price data
    res.status(200).json({
      message: "Coin price data retrieved successfully",
      coinPrice,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve coin price data", error: error.message });
  }
});

module.exports = router;
