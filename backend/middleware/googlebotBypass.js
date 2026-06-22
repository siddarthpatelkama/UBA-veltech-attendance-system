const ipRangeCheck = require('ip-range-check');
const GOOGLEBOT_IPS = require('../config/googlebotRanges');

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

module.exports = function googlebotBypass(req, res, next) {
  const clientIp = getClientIp(req);

  // Synchronous CIDR check
  if (ipRangeCheck(clientIp, GOOGLEBOT_IPS)) {
    req.isGooglebot = true;
    return next();
  }

  return next();
};
