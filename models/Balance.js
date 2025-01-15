const mongoose = require("mongoose");

const BalanceSchema = new mongoose.Schema({
  balance: {
    type: Number,
    required: true,
    default: 0,
  },
});

module.exports = mongoose.model("Balance", BalanceSchema);
