// Dipakai Service Nilai & Service Transkrip: pertahanan berlapis (assume breach).
// Lapis 1: X-Gateway-Secret  -> service tidak bisa diakses langsung / bypass gateway.
// Lapis 2: verifikasi ulang tanda tangan + masa berlaku JWT (access / service token).
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b)); // panjang sama -> aman dari timing attack
}

function guard(req, res, next) {
  const secret = req.get('x-gateway-secret');
  if (!secret || !safeEqual(secret, config.gatewaySecret)) {
    return res.status(403).json({ error: 'Akses langsung ke service ditolak (gateway secret tidak valid)' });
  }

  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return res.status(401).json({ error: 'Token tidak ada' });

  let claims;
  try {
    claims = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'] });
  } catch (e) {
    return res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Token kedaluwarsa' : 'Token tidak valid' });
  }

  // typ harus konsisten dengan role: token service hanya role "service", token user tidak boleh "service"
  const typOk = claims.role === 'service' ? claims.typ === 'service' : claims.typ === 'access';
  if (!typOk || !claims.sub) return res.status(401).json({ error: 'Jenis token tidak valid' });

  req.auth = { sub: String(claims.sub), role: claims.role, typ: claims.typ };
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.auth.role)
    ? next()
    : res.status(403).json({ error: `Role "${req.auth.role}" tidak diizinkan di service ini` });

module.exports = { guard, requireRole };
