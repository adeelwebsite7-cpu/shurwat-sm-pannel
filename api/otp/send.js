// send.js - FITTED - Direct Vercel route /api/otp/send - OTP Firebase me save hoga
const handler = require('../otp.js');
module.exports = (req, res) => {
  req.url = '/api/otp/send';
  req.headers['x-otp-action'] = 'send';
  return handler(req, res);
};
