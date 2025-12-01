// api/auth/login.js
const handler = require('../index'); // forward to api/index.js
module.exports = async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error('auth/login wrapper error', err && (err.stack || err.message || err));
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal wrapper error', details: err && err.message }));
  }
};
