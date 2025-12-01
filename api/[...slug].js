// api/[...slug].js
const handler = require('./index');

module.exports = async (req, res) => {
  // Normalize the URL so index.js can read paths correctly
  if (!req.url.startsWith('/')) {
    req.url = '/' + req.url;
  }

  try {
    await handler(req, res);
  } catch (err) {
    console.error('Wrapper Error:', err.message || err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ 
      error: 'Internal wrapper error', 
      details: err.message || err 
    }));
  }
};
