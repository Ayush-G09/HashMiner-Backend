const mongoose = require("mongoose");

const coinPriceSchema = new mongoose.Schema({
  date: { type: String, unique: true, required: true }, // YYYY-MM-DD format
  price: { type: Number, required: true },
});

module.exports = mongoose.model("CoinPrice", coinPriceSchema);
