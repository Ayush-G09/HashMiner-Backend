const User = require("../models/User");

// Function to update mining progress
const mineCoins = async () => {
  try {
    const users = await User.find();

    for (const user of users) {
      let updated = false;

      for (const miner of user.miners) {
        if (miner.status === "Running") {
          miner.coinsMined += miner.hashRate;

          if (miner.coinsMined >= miner.capacity) {
            miner.coinsMined = miner.capacity;
            miner.status = "Stopped";
          }

          updated = true;
        }
      }

      if (updated) {
        await user.save();
      }
    }

    console.log("Mining update completed.");
  } catch (error) {
    console.error("Error during mining process:", error.message);
  }
};

// Run the mining function immediately
mineCoins();
