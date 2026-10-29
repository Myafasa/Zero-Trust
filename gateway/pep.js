// POLICY ENFORCEMENT POINT — satu-satunya pintu masuk untuk semua endpoint selain /auth/*.
// Urutan: 1) token valid  2) device terdaftar  3) tanya Policy Engine  4) audit log  5) teruskan / tolak.
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

  // 1) Verifikasi token (algoritma dikunci HS256 -> tolak alg:none / confusion)
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

  // 2) Konteks device (hanya untuk request user; token service tidak punya device)
  if (subject.typ === 'access') {
    if (!device) return reject(403, subjek, 'header X-Device-ID tidak ada');
    if (!deviceQ.get(Number(subject.id), device)) return reject(403, subjek, 'device tidak terdaftar untuk user ini');
  }

  // 3) Keputusan kebijakan
  const decision = decide({ subject, method: req.method, path: req.path, query: req.query });

  // 4) Audit (dicatat sebelum request diteruskan)
  audit.log({ subjek, endpoint, device, hasil: decision.allow ? 'allow' : 'deny', alasan: decision.reason });
  if (!decision.allow) return res.status(403).json({ error: `Akses ditolak: ${decision.reason}` });

  // 5) Teruskan ke service yang tepat
  req.proxyTarget = decision.target;
  next();
}

module.exports = pep;
