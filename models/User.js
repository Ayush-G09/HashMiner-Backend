const mongoose = require("mongoose");

const MinerSchema = new mongoose.Schema({
  type: { type: String, enum: ["#01", "#02", "#03", "#04", "#05", "#06", "#07"], required: true },
  hashRate: { type: Number, required: true, default: 0 },
  coinsMined: { type: Number, default: 0 },
  capacity: { type: Number, required: true },
  status: { type: String, enum: ["Running", "Stopped"], default: "Running" },
  lastCollected: { type: Date, default: () => new Date() },
});

const TransactionSchema = new mongoose.Schema({
  type: {type: String, enum: ["Coin", "Miner"]},
  title: {type: String},
  date: { type: String, default: () => moment().format('DD/MM/YY') },
  status: {type: String, enum: ["Completed", "Pending"]},
  amount: {type: Number},
  to: {type: String},
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  miners: { type: [MinerSchema], default: [] },
  referredBy: { type: String, default: null },
  image: { type: String, default: '' },
  totalCoinsMined: { type: Number, default: 0 },
  transactions: {type: [TransactionSchema], default: []},
  upiID: { type: String, default: '' },
});

module.exports = mongoose.model("User", UserSchema);
