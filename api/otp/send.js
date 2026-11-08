// send - direct Vercel route, no rewrite needed
const handler = require('../otp.js');
module.exports = (req, res) => { req.url = '/api/otp/send'; return handler(req, res); };
