const jwt = require("jsonwebtoken");

const authorize = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    req.user = decoded; // Attach user ID to the request object for further use
    next(); // Pass control to the next middleware or route handler
  } catch (error) {
    res.status(400).json({ message: "Invalid token." });
  }
};

module.exports = authorize;
