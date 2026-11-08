// verify.js - FITTED - Direct Vercel route /api/otp/verify - OTP Firebase se check hoga
const handler = require('../otp.js');
module.exports = (req, res) => {
  req.url = '/api/otp/verify';
  req.headers['x-otp-action'] = 'verify';
  return handler(req, res);
};
