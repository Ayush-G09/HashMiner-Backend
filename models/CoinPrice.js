const mongoose = require("mongoose");

const CoinPriceSchema = new mongoose.Schema({
  labels: { type: [String], required: true },
  datasets: [
    {
      data: { type: [Number], required: true },
    },
  ],
});

module.exports = mongoose.model("CoinPrice", CoinPriceSchema);
