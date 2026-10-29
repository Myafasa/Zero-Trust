const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../shared/config');
const db = require('../shared/db');

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const sign = (payload, secret, opts) => jwt.sign(payload, secret, { algorithm: 'HS256', ...opts });

const signAccess = (user) =>
  sign({ role: user.role, typ: 'access' }, config.jwtSecret, { subject: String(user.id), expiresIn: config.ttl.access });

const signService = (clientId) =>
  sign({ role: 'service', typ: 'service' }, config.jwtSecret, { subject: clientId, expiresIn: config.ttl.service });

const insertRefresh = db.prepare(
  'INSERT INTO refresh_tokens (user_id,token_hash,device_id,expires_at,created_at) VALUES (?,?,?,?,?)'
);

// Refresh token = JWT (1 hari) + disimpan (hash) di DB agar bisa dicabut.
function issueRefresh(user, deviceId) {
  const token = sign(
    { typ: 'refresh', jti: crypto.randomUUID() },
    config.refreshSecret,
    { subject: String(user.id), expiresIn: config.ttl.refresh }
  );
  const { exp } = jwt.decode(token);
  insertRefresh.run(user.id, hash(token), deviceId, new Date(exp * 1000).toISOString(), new Date().toISOString());
  return token;
}

module.exports = { hash, signAccess, signService, issueRefresh };
