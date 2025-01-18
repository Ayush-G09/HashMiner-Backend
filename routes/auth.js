const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const generateOTP = require("../utils/otpGenerator");
const MINER_CONFIG = require("../config/minersConfig");
const CoinPrice = require("../models/CoinPrice");
const moment = require('moment');
const authorize = require('../middleware/AuthMiddleware');
const Miner = require('../models/Miners');
const Balance = require("../models/Balance");

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

  const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

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
const crypto = require("crypto");

router.post("/register", async (req, res) => {
  const { username, email, password, referredBy } = req.body;

  // Validate fields
  if (!username || !email || !password)
    return res.status(400).json({ message: "All fields are required" });

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) return res.status(400).json({ message: "User already exists" });

  // If referredBy is provided, check if the referId exists in the database
  if (referredBy) {
    const referrer = await User.findOne({ referId: referredBy });
    if (!referrer) {
      return res.status(400).json({ message: "Invalid referral code" });
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Generate a unique referId
  let referId;
  let isUnique = false;

  while (!isUnique) {
    referId = crypto.randomBytes(4).toString("hex"); // Generates an 8-character ID
    const existingUser = await User.findOne({ referId });
    if (!existingUser) isUnique = true;
  }

  try {
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      referredBy, // Will be null if not provided
      referId,
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
router.post("/add-miner/:userId", authorize, async (req, res) => {
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
router.post("/collect-coins/:userId/:minerId", authorize, async (req, res) => {
  const { userId, minerId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const miner = user.miners.id(minerId);
    if (!miner) return res.status(404).json({ message: "Miner not found." });

    // Add coinsMined to user balance and reset miner
    user.balance += miner.coinsMined;
    user.totalCoinsMined += miner.coinsMined;
    miner.coinsMined = 0;
    miner.status = "Running"; // Restart mining
    miner.lastCollected = new Date(); // Update lastCollected

    await user.save();

    res.status(200).json({ message: "Coins collected successfully", balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: "Failed to collect coins", error: error.message });
  }
});

router.get("/user/:id?", authorize, async (req, res) => {
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
router.post("/user/:id/image", authorize, async (req, res) => {
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

// Leaderboard API
router.get('/leaderboard', authorize, async (req, res) => {
  try {
    // Fetch top 50 users sorted by totalCoinsMined
    const leaderboard = await User.find({ totalCoinsMined: { $gt: 0 } })
      .sort({ totalCoinsMined: -1 })
      .limit(50)
      .select('username totalCoinsMined image'); // Select only necessary fields

    res.status(200).json({
      data: leaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      message: 'Internal server error',
    });
  }
});

router.post('/transaction', authorize, async (req, res) => {
  try {
      const { userId, title, type, amount } = req.body;

      // Validate required fields
      if (!userId || !title || !type) {
          return res.status(400).json({ error: 'Missing required fields: userId, title, of, and type' });
      }

      // If the transaction type is "Coin", validate that the amount is provided
      if (type === "Coin" && !amount) {
          return res.status(400).json({ error: 'Missing required field: amount for Coin type transactions' });
      }

      // Find the user and update their transactions
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      if(user.balance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      if(!user.upiID){
        return res.status(400).json({ error: 'UPI ID is not set' });
      }

      // Generate current date in dd/mm/yy format
      const formattedDate = moment().format('DD/MM/YY');

      // Create new transaction object
      const newTransaction = {
          type,
          title,
          date: formattedDate,
          status: 'Pending',
          to: user.upiID,
      };

      // If the transaction type is "Coin", deduct the amount from the user's balance
      if (type === "Coin") {
          if (user.balance < amount) {
              return res.status(400).json({ error: 'Insufficient balance' });
          }

          user.balance -= amount;  // Deduct the amount from the user's balance
          newTransaction.amount = amount;
      }

      // If the transaction type is "Miner", only create the transaction without updating balance
      if (type === "Miner") {
          newTransaction.amount = 0;  // No amount for Miner type transactions
      }

      // Push the new transaction to the user's transactions array
      user.transactions.push(newTransaction);
      await user.save();

      // Respond with the created transaction
      res.status(201).json({
          message: 'Transaction created successfully',
          transactions: user.transactions,
      });
  } catch (error) {
      console.error('Error during transaction processing:', error);  // Log the full error
      res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// API: Get all transactions of a user, sorted by most recent first
router.get("/transactions/:userId", authorize, async (req, res) => {
  const { userId } = req.params;

  try {
    // Find the user by userId and populate the transactions array
    const user = await User.findById(userId).select("transactions upiID");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Sort transactions by date in descending order (most recent first)
    const sortedTransactions = user.transactions.sort((a, b) => {
      const dateA = moment(a.date, "DD/MM/YY").toDate();
      const dateB = moment(b.date, "DD/MM/YY").toDate();
      return dateB - dateA; // Sort in descending order
    });

    // Return the sorted transactions
    res.status(200).json({ message: "Transactions fetched successfully", transactions: sortedTransactions, upiId: user.upiID });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch transactions", error: error.message });
  }
});

router.put("/user/upi", authorize, async (req, res) => {
  try {
    const { userId, upiID } = req.body;

    // Validate required fields
    if (!userId || !upiID) {
      return res.status(400).json({ error: "Missing required fields: userId and upiID" });
    }

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update or add the upiID
    user.upiID = upiID;

    // Save the user with the updated information
    await user.save();

    res.status(200).json({
      message: "UPI ID updated successfully",
    });
  } catch (error) {
    console.error("Error updating UPI ID:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// API: Send OTP to user email for reset password
router.post("/reset-password-send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const otp = generateOTP();

  // Send OTP via email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "HashMiner OTP for Password Reset",
    text: `Dear User,
    
    We received a request to reset your password for your HashMiner account. To proceed, please use the following One-Time Password (OTP):
    
    🔒 Your OTP Code: ${otp}
    
    This code is valid for the next 10 minutes. Please do not share this code with anyone for security reasons.
    
    If you did not request a password reset, please ignore this email or contact our support team for assistance.
    
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


// Reset Password API
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  // Validate fields
  if (!email || !newPassword) {
    return res.status(400).json({ message: "Email and new password are required" });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reset password", error: error.message });
  }
});

// Route to add a miner
router.post('/add-miner', async (req, res) => {
  try {
    const { hashRate, capacity, image, name, desc, price } = req.body;

    // Validation: Check if all required fields are present
    if (!hashRate || !capacity || !image || !name || !desc || !price) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Create a new Miner document
    const miner = new Miner({
      hashRate,
      capacity,
      image,
      name,
      desc,
      price,
    });

    // Save the miner to the database
    await miner.save();

    res.status(201).json({ message: 'Miner added successfully!', miner });
  } catch (error) {
    console.error('Error adding miner:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route to get all miners
router.get('/all-miners', async (req, res) => {
  try {
    // Retrieve all miners from the database
    const miners = await Miner.find();

    if (miners.length === 0) {
      return res.status(404).json({ message: 'No miners found.' });
    }

    res.status(200).json({ miners });
  } catch (error) {
    console.error('Error fetching miners:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route to delete a miner by ID
router.delete('/delete-miner/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Find the miner by ID and remove it from the database
    const miner = await Miner.findByIdAndDelete(id);

    if (!miner) {
      return res.status(404).json({ message: 'Miner not found.' });
    }

    res.status(200).json({ message: 'Miner deleted successfully.' });
  } catch (error) {
    console.error('Error deleting miner:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route to update a miner by ID
router.put('/update-miner/:id', async (req, res) => {
  const { id } = req.params;
  const updatedMinerData = req.body; // The new data for the miner

  try {
    // Find the miner by ID and update it with the new data
    const updatedMiner = await Miner.findByIdAndUpdate(id, updatedMinerData, {
      new: true, // Return the updated document
      runValidators: true, // Validate the data according to the schema
    });

    if (!updatedMiner) {
      return res.status(404).json({ message: 'Miner not found.' });
    }

    res.status(200).json({miner: updatedMiner});
  } catch (error) {
    console.error('Error updating miner:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.get("/statistics", async (req, res) => {
  try {
    // Fetch the total user count
    const totalUsers = await User.countDocuments();

    // Use aggregation to count all pending transactions across all users
    const result = await User.aggregate([
      { $unwind: "$transactions" }, // Unwind the transactions array
      { $match: { "transactions.status": "Pending" } }, // Match only pending transactions
      { $count: "totalPendingTransactions" }, // Count the matching transactions
    ]);

    // Extract the totalPendingTransactions count
    const totalPendingTransactions = result[0]?.totalPendingTransactions || 0;

    res.status(200).json({
      message: "Statistics fetched successfully",
      data: {
        totalUsers,
        totalPendingTransactions,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

router.get("/user-pending-transactions", async (req, res) => {
  try {
    // Use aggregation to fetch user details and their pending transactions
    const usersWithPendingTransactions = await User.aggregate([
      {
        $match: {
          "transactions.status": "Pending", // Match users who have at least one pending transaction
        },
      },
      {
        $project: {
          _id: 1, // Include the user ID
          username: 1, // Include the username
          pendingTransactions: {
            $filter: {
              input: "$transactions", // Iterate over the transactions array
              as: "transaction",
              cond: { $eq: ["$$transaction.status", "Pending"] }, // Filter for pending transactions
            },
          },
        },
      },
    ]);

    res.status(200).json({
      message: "Users with pending transactions fetched successfully",
      data: usersWithPendingTransactions,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch user pending transactions",
      error: error.message,
    });
  }
});

// API: Update transaction status
router.put("/transactions/:userId/:transactionId", async (req, res) => {
  const { userId, transactionId } = req.params;
  const { status } = req.body; // The new status to update

  // Validate the status field
  if (!status) {
    return res.status(400).json({ message: "Transaction status is required." });
  }

  try {
    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Find the transaction in the user's transactions array
    const transaction = user.transactions.id(transactionId);

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found." });
    }

    // Update the transaction's status
    transaction.status = status;

    // Save the updated user document
    await user.save();

    res.status(200).json({
      message: "Transaction status updated successfully.",
      transaction,
    });
  } catch (error) {
    console.error("Error updating transaction status:", error);
    res.status(500).json({
      message: "Failed to update transaction status.",
      error: error.message,
    });
  }
});

router.post("/generate-coin-price-data", async (req, res) => {
  const BATCH_SIZE = 100;

  try {
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6); // Set start to six months ago

    const data = [];
    let lastPrice = 1; // Start from an initial price of 1

    // Generate fluctuating data for the last 6 months
    for (let date = new Date(sixMonthsAgo); date <= today; date.setDate(date.getDate() + 1)) {
      // Simulate price fluctuation by random amount between -5 and +5
      const randomChange = Math.random() * 10 - 5; // Random fluctuation between -5 and +5
      let price = lastPrice + randomChange;
      
      // Ensure the price is within the range [1, 20]
      price = Math.min(20, Math.max(1, price)); // Clamp price between 1 and 20

      // Round price to 2 decimal places
      price = parseFloat(price.toFixed(2));

      data.push({
        date: new Date(date).toISOString().split("T")[0], // Format as YYYY-MM-DD
        price,
      });

      lastPrice = price; // Update the last price for the next iteration
    }

    // Set today's price to 20 (Override the last price)
    data[data.length - 1].price = 20; // The last price should be 20 today

    // Insert data in batches
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE); // Slice the data into smaller chunks
      await CoinPrice.insertMany(batch);
    }

    res.status(200).json({ message: "Fluctuating data for the last 6 months generated and inserted successfully!" });
  } catch (error) {
    console.error("Error generating fluctuating data:", error);
    res.status(500).json({ message: "Error generating fluctuating data", error: error.message });
  }
});


// Route to update today's price
router.post("/update-price", async (req, res) => {
  const { price } = req.body;

  if (!price || typeof price !== "number") {
    return res.status(400).json({ error: "Invalid price value" });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    // Fetch today's price entry
    const existingTodayPrice = await CoinPrice.findOne({ date: today });

    if (existingTodayPrice) {
      // Overwrite today's price
      existingTodayPrice.price = price;
      await existingTodayPrice.save();
      return res.json({
        message: "Today's price updated (overwritten)",
        price: existingTodayPrice.price,
      });
    }

    // If no price for today, create a new entry
    const newPriceEntry = new CoinPrice({ date: today, price });
    await newPriceEntry.save();

    // Delete the oldest entry if more than 6 months of data exists
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const totalEntries = await CoinPrice.countDocuments();
    if (totalEntries > 6) {
      // Find and delete the oldest entry (entry before 6 months ago)
      const oldestEntry = await CoinPrice.findOne({ date: { $lte: sixMonthsAgo.toISOString().split("T")[0] } }).sort({ date: 1 });
      if (oldestEntry) {
        await CoinPrice.deleteOne({ _id: oldestEntry._id });
      }
    }

    res.json({ message: "Price added for today", price });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/get-prices", async (req, res) => {
  try {
    const { period } = req.query;

    if (!["1w", "1m", "3m", "6m", "today"].includes(period)) {
      return res.status(400).json({ error: "Invalid period. Valid options are: 1w, 1m, 3m, 6m, today." });
    }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Calculate start date based on the selected period
    let startDate = new Date();
    switch (period) {
      case "1w":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "1m":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "3m":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "6m":
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case "today":
        startDate = new Date(todayStr);
        break;
    }
    const startDateStr = startDate.toISOString().split("T")[0];

    // 1️⃣ **DELETE old data beyond 6 months**
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    await CoinPrice.deleteMany({ date: { $lt: sixMonthsAgo.toISOString().split("T")[0] } });

    // 2️⃣ **Fetch available data from the database**
    let prices = await CoinPrice.find({
      date: { $gte: startDateStr, $lte: todayStr },
    }).sort({ date: 1 });

    // 3️⃣ **Ensure today's price exists**
    let todayPrice = prices.find((p) => p.date === todayStr);
    if (!todayPrice) {
      const lastPriceEntry = await CoinPrice.findOne({ date: { $lt: todayStr } }).sort({ date: -1 });
      if (lastPriceEntry) {
        todayPrice = new CoinPrice({
          date: todayStr,
          price: lastPriceEntry.price,
          fluctuatedPrice: lastPriceEntry.price, // Initially set fluctuated price to last price
          lastFluctuated: new Date(),
        });
        await todayPrice.save();
        prices.push(todayPrice);
      }
    }

    // 4️⃣ **Fluctuate today's price (if needed)**
    if (todayPrice) {
      const lastFluctuatedTime = todayPrice.lastFluctuated;
      const now = new Date();

      if (!lastFluctuatedTime || now - lastFluctuatedTime > 10 * 60 * 1000) {
        // More than 10 mins have passed, generate new fluctuation
        const basePrice = todayPrice.price;
        const fluctuation = (Math.random() * 1 - 0.5) * 1; // Random ±0.5 fluctuation
        const newFluctuatedPrice = parseFloat((basePrice + fluctuation).toFixed(2));

        // Update fluctuated price and last fluctuated time
        todayPrice.fluctuatedPrice = newFluctuatedPrice;
        todayPrice.lastFluctuated = now;
        await todayPrice.save();
      }
    }

    // 5️⃣ **Fill missing dates with the latest available price**
    const filledPrices = [];
    let lastAvailablePrice = null;
    let currentDate = new Date(startDateStr);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const priceEntry = prices.find((p) => p.date === dateStr);

      if (priceEntry) {
        lastAvailablePrice = priceEntry.price;
        filledPrices.push(priceEntry);
      } else if (lastAvailablePrice !== null) {
        const filledEntry = new CoinPrice({ date: dateStr, price: lastAvailablePrice });
        await filledEntry.save();
        filledPrices.push(filledEntry);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 6️⃣ **Return prices with today's fluctuated price**
    res.json({
      prices: filledPrices.map((p) => ({
        date: p.date,
        price: p.date === todayStr ? p.fluctuatedPrice : p.price, // Send fluctuated price for today
      })),
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;

router.delete("/delete-all-coin-price-data", async (req, res) => {
  try {
    // Delete all data from the CoinPrice collection
    await CoinPrice.deleteMany({});

    res.status(200).json({ message: "All coin price data deleted successfully!" });
  } catch (error) {
    console.error("Error deleting all coin price data:", error);
    res.status(500).json({ message: "Error deleting all coin price data", error: error.message });
  }
});

// API to get the current balance
router.get("/get-balance", async (req, res) => {
  try {
    // Fetch the balance document
    const balanceData = await Balance.findOne();

    // If no balance document exists, return default balance
    if (!balanceData) {
      return res.json({ balance: 0 });
    }

    res.json({ balance: balanceData.balance });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
