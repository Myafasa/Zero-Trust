const jwt = require('jsonwebtoken');

module.exports = function guard(req, res, next) {
  if (req.get('X-Gateway-Secret') !== process.env.GATEWAY_SECRET)
    return res.status(403).json({ error: 'Gateway secret tidak valid' });

  const h = req.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ada' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // cek signature + exp
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token tidak valid/kedaluwarsa' });
  }
};