const User = require("../models/User");

// Function to update mining progress
const mineCoins = async () => {
  try {
    const users = await User.find();

    users.forEach(async (user) => {
      let updated = false;

      user.miners.forEach((miner) => {
        if (miner.status === "Running") {
          miner.coinsMined += miner.hashRate;

          // Stop the miner if coinsMined reaches capacity
          if (miner.coinsMined >= miner.capacity) {
            miner.coinsMined = miner.capacity; // Cap the coins mined
            miner.status = "Stopped";
          }

          updated = true;
        }
      });

      if (updated) await user.save();
    });

    console.log("Mining update completed.");
  } catch (error) {
    console.error("Error during mining process:", error.message);
  }
};

// Run every hour
setInterval(mineCoins, 1000 * 60 * 60); // 1 hour
