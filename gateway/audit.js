const db = require('../shared/db');

const insert = db.prepare(
  'INSERT INTO audit_log (waktu,subjek,endpoint,device,hasil,alasan) VALUES (?,?,?,?,?,?)'
);

function log({ subjek, endpoint, device, hasil, alasan }) {
  insert.run(new Date().toISOString(), subjek || 'anonymous', endpoint, device || null, hasil, alasan);
}

module.exports = { log };
