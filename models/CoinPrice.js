const mongoose = require("mongoose");

const coinPriceSchema = new mongoose.Schema({
  date: { type: String, unique: true, required: true }, // YYYY-MM-DD format
  price: { type: Number, required: true },
  lastFluctuated: { type: Date, default: null }, // Stores last fluctuation timestamp
  fluctuatedPrice: { type: Number, default: null }, // Stores last fluctuated price
});

module.exports = mongoose.model("CoinPrice", coinPriceSchema);
