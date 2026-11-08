// verify - direct Vercel route, no rewrite needed
const handler = require('../otp.js');
module.exports = (req, res) => { req.url = '/api/otp/verify'; return handler(req, res); };
