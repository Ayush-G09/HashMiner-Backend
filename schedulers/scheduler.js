const User = require("../models/User");

// Function to update mining progress
const mineCoins = async () => {
  try {
    const users = await User.find();

    for (const user of users) {  // Using `for...of` instead of `forEach`
      let updated = false;

      for (const miner of user.miners) {  // Loop through miners
        if (miner.status === "Running") {
          miner.coinsMined += miner.hashRate;

          // Stop the miner if coinsMined reaches capacity
          if (miner.coinsMined >= miner.capacity) {
            miner.coinsMined = miner.capacity; // Cap the coins mined
            miner.status = "Stopped";
          }

          updated = true;
        }
      }

      if (updated) {
        await user.save(); // Wait for user to be saved after modifications
      }
    }

    console.log("Mining update completed.");
  } catch (error) {
    console.error("Error during mining process:", error.message);
  }
};

// Run every hour
setInterval(mineCoins, 1000 * 60 * 2); // 1 hour
