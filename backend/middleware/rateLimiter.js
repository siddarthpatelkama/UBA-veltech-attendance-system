const rateLimit = require("express-rate-limit");

// Rate limiting: relaxed for WiFi (30 requests per 10 seconds)
const attendanceRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 30, // limit each IP to 30 requests per windowMs (WiFi safe)
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// More lenient rate limiter for report endpoints
const reportRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: "Too many report requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  attendanceRateLimiter,
  reportRateLimiter,
};

