const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../shared/config');
const db = require('../shared/db');
const audit = require('./audit');
const tokens = require('./tokens');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  device: db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?'),
  refresh: db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?'),
  revokeOne: db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?'),
  revokeAll: db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?'),
  client: db.prepare('SELECT * FROM service_clients WHERE client_id = ?'),
};

function respond(res, req, { status, subjek, hasil, alasan, body }) {
  audit.log({ subjek, endpoint: `${req.method} ${req.originalUrl.split('?')[0]}`, device: req.get('x-device-id'), hasil, alasan });
  return res.status(status).json(body);
}
const denyWith = (res, req, status, subjek, alasan, publicMsg) =>
  respond(res, req, { status, subjek, hasil: 'deny', alasan, body: { error: publicMsg || alasan } });

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const device = req.get('x-device-id');
  const subjek = `login:${String(username ?? '?').slice(0, 50)}`;

  if (typeof username !== 'string' || typeof password !== 'string')
    return denyWith(res, req, 400, subjek, 'username/password tidak ada');

  const user = q.userByName.get(username);
  const passOk = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passOk)
    return denyWith(res, req, 401, subjek, 'kredensial tidak valid', 'Kredensial tidak valid');

  if (!device) return denyWith(res, req, 400, subjek, 'header X-Device-ID tidak ada');
  if (!q.device.get(user.id, device))
    return denyWith(res, req, 403, subjek, 'device tidak terdaftar untuk user ini');

  const body = {
    access_token: tokens.signAccess(user),
    refresh_token: tokens.issueRefresh(user, device),
    token_type: 'Bearer',
    expires_in: 600,
  };
  return respond(res, req, { status: 200, subjek: `user:${user.id}(${user.role})`, hasil: 'allow', alasan: 'login berhasil', body });
});

function loadRefresh(req, { detectReuse }) {
  const rt = req.body && req.body.refresh_token;
  if (typeof rt !== 'string') return { status: 400, reason: 'refresh_token tidak ada' };
  let claims;
  try {
    claims = jwt.verify(rt, config.refreshSecret, { algorithms: ['HS256'] });
  } catch (e) {
    return { status: 401, reason: 'refresh token tidak valid / kedaluwarsa' };
  }
  if (claims.typ !== 'refresh') return { status: 401, reason: 'jenis token salah' };

  const row = q.refresh.get(tokens.hash(rt));
  if (!row) return { status: 401, reason: 'refresh token tidak dikenal' };
  if (row.revoked) {
    if (detectReuse) q.revokeAll.run(row.user_id);
    return { status: 401, reason: detectReuse ? 'refresh token sudah dicabut (reuse terdeteksi, semua sesi dicabut)' : 'refresh token sudah dicabut', subjek: `user:${row.user_id}` };
  }
  return { row, subjek: `user:${row.user_id}` };
}

router.post('/refresh', (req, res) => {
  const r = loadRefresh(req, { detectReuse: true });
  if (!r.row) return denyWith(res, req, r.status, r.subjek || 'anonymous', r.reason);

  const device = req.get('x-device-id');
  if (!device || device !== r.row.device_id || !q.device.get(r.row.user_id, device))
    return denyWith(res, req, 403, r.subjek, 'device tidak cocok dengan sesi refresh token');

  const user = q.userById.get(r.row.user_id);
  if (!user) return denyWith(res, req, 401, r.subjek, 'user tidak ditemukan');

  q.revokeOne.run(r.row.id);
  const body = {
    access_token: tokens.signAccess(user),
    refresh_token: tokens.issueRefresh(user, device),
    token_type: 'Bearer',
    expires_in: 600,
  };
  return respond(res, req, { status: 200, subjek: `user:${user.id}(${user.role})`, hasil: 'allow', alasan: 'refresh berhasil', body });
});

router.post('/logout', (req, res) => {
  const r = loadRefresh(req, { detectReuse: false });
  if (!r.row) return denyWith(res, req, r.status, r.subjek || 'anonymous', r.reason);
  q.revokeOne.run(r.row.id);
  return respond(res, req, { status: 200, subjek: r.subjek, hasil: 'allow', alasan: 'logout, refresh token dicabut', body: { message: 'Logout berhasil' } });
});

router.post('/service', (req, res) => {
  const { client_id, client_secret } = req.body || {};
  const subjek = `service:${String(client_id ?? '?').slice(0, 50)}`;
  const client = typeof client_id === 'string' ? q.client.get(client_id) : null;
  const ok = bcrypt.compareSync(String(client_secret ?? ''), client ? client.secret_hash : DUMMY_HASH);
  if (!client || !ok) return denyWith(res, req, 401, subjek, 'client id/secret tidak valid', 'Kredensial service tidak valid');

  return respond(res, req, {
    status: 200, subjek, hasil: 'allow', alasan: 'token service diterbitkan',
    body: { access_token: tokens.signService(client.client_id), token_type: 'Bearer', expires_in: 300 },
  });
});

module.exports = router;
