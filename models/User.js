const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 }, // New: User balance, defaults to 0
  miners: { type: [String], default: [] }, // New: Array of miner identifiers
  referredBy: { type: String, default: null }, // New: Optional referral string
});

module.exports = mongoose.model("User", UserSchema);
