require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');
const db = require('../db/database');
const policy = require('./policy');
const audit = require('./audit');

const app = express();

app.use('/auth', express.json(), require('./auth'));

// 1) Verifikasi token
function authenticate(req, res, next) {
  const h = req.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const endpoint = `${req.method} ${req.path}`;
  const device = req.get('X-Device-ID');
  if (!token) {
    audit.log({ subjek: 'anonim', endpoint, device, hasil: 'deny', alasan: 'Token tidak ada' });
    return res.status(401).json({ error: 'Token tidak ada' });
  }
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch (e) {
    audit.log({ subjek: 'anonim', endpoint, device, hasil: 'deny', alasan: 'Token tidak valid/kedaluwarsa' });
    res.status(401).json({ error: 'Token tidak valid/kedaluwarsa' });
  }
}

// 2) Verifikasi device (khusus user, token service tidak punya device)
function checkDevice(req, res, next) {
  if (req.user.role === 'service') return next();
  const device = req.get('X-Device-ID');
  const ok = device && db.prepare('SELECT 1 FROM devices WHERE user_id=? AND device_id=?')
    .get(req.user.sub, device);
  if (!ok) {
    audit.log({ subjek: `user:${req.user.sub}`, endpoint: `${req.method} ${req.path}`,
      device, hasil: 'deny', alasan: 'Device tidak terdaftar' });
    return res.status(403).json({ error: 'Device tidak terdaftar' });
  }
  next();
}

// 3) Keputusan policy + audit
function enforce(req, res, next) {
  const d = policy.decide({ subject: req.user, method: req.method, path: req.path });
  audit.log({ subjek: `${req.user.role}:${req.user.sub}`, endpoint: `${req.method} ${req.path}`,
    device: req.get('X-Device-ID'), hasil: d.allow ? 'allow' : 'deny', alasan: d.reason });
  if (!d.allow) return res.status(403).json({ error: d.reason });
  next();
}

app.use(authenticate, checkDevice, enforce);

// 4) Teruskan ke service + tambah X-Gateway-Secret
const withSecret = {
  proxyReq: p => p.setHeader('X-Gateway-Secret', process.env.GATEWAY_SECRET)
};
app.use(createProxyMiddleware({
  target: `http://localhost:${process.env.NILAI_PORT}`,
  pathFilter: ['/nilai', '/kelas'],
  on: withSecret
}));
app.use(createProxyMiddleware({
  target: `http://localhost:${process.env.TRANSKRIP_PORT}`,
  pathFilter: '/transkrip',
  on: withSecret
}));

app.listen(process.env.GATEWAY_PORT, () => console.log('Gateway :3000'));