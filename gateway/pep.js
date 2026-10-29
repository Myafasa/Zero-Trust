const jwt = require('jsonwebtoken');
const config = require('../shared/config');
const db = require('../shared/db');
const audit = require('./audit');
const { decide } = require('./policy');

const deviceQ = db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?');

function pep(req, res, next) {
  const endpoint = `${req.method} ${req.path}`;
  const device = req.get('x-device-id') || null;

  const reject = (status, subjek, alasan) => {
    audit.log({ subjek, endpoint, device, hasil: 'deny', alasan });
    return res.status(status).json({ error: alasan });
  };

  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return reject(401, 'anonymous', 'access token tidak ada');

  let claims;
  try {
    claims = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'] });
  } catch (e) {
    return reject(401, 'anonymous', e.name === 'TokenExpiredError' ? 'token kedaluwarsa' : 'token tidak valid');
  }
  const typOk = claims.role === 'service' ? claims.typ === 'service' : claims.typ === 'access';
  if (!typOk || !claims.sub) return reject(401, 'anonymous', 'jenis token tidak valid');

  const subject = { id: String(claims.sub), role: claims.role, typ: claims.typ };
  const subjek = subject.typ === 'service' ? `service:${subject.id}` : `user:${subject.id}(${subject.role})`;

  if (subject.typ === 'access') {
    if (!device) return reject(403, subjek, 'header X-Device-ID tidak ada');
    if (!deviceQ.get(Number(subject.id), device)) return reject(403, subjek, 'device tidak terdaftar untuk user ini');
  }

  const decision = decide({ subject, method: req.method, path: req.path, query: req.query });

  audit.log({ subjek, endpoint, device, hasil: decision.allow ? 'allow' : 'deny', alasan: decision.reason });
  if (!decision.allow) return res.status(403).json({ error: `Akses ditolak: ${decision.reason}` });

  req.proxyTarget = decision.target;
  next();
}

module.exports = pep;
