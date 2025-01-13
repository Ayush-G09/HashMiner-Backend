const mongoose = require('mongoose');

const MinerSchema = new mongoose.Schema({
  hashRate: { type: Number, required: true, default: 0 },
  capacity: { type: Number, required: true },
  image: { type: String, required: true },
  name: { type: String, required: true },
  desc: { type: String, required: true },
  price: { type: Number, required: true },
});

module.exports = mongoose.model('Miner', MinerSchema);
