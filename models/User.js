const mongoose = require("mongoose");
const moment = require("moment");

const TransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ["Coin", "Miner"] },
  title: { type: String },
  date: { type: String, default: () => moment().format('DD/MM/YY') },
  status: { type: String, enum: ["Completed", "Pending"] },
  amount: { type: Number },
  to: { type: String },
});

const UserMinerSchema = new mongoose.Schema({
  minerId: { type: mongoose.Schema.Types.ObjectId, ref: "Miner", required: true },
  status: { type: String, enum: ["Running", "Stopped"], default: "Running" },
  lastCollected: { type: Date, default: Date.now },
  coinsMined: { type: Number, default: 0 }
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  miners: { type: [UserMinerSchema], default: [] },
  referredBy: { type: String, default: null },
  referId: { type: String, unique: true, required: true },
  image: { type: String, default: "" },
  totalCoinsMined: { type: Number, default: 0 },
  transactions: { type: [TransactionSchema], default: [] },
  upiID: { type: String, default: "" },
});

module.exports = mongoose.model("User", UserSchema);
