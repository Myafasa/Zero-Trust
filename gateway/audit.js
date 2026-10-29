const db = require('../shared/db');

const insert = db.prepare(
  'INSERT INTO audit_log (waktu,subjek,endpoint,device,hasil,alasan) VALUES (?,?,?,?,?,?)'
);

// Mencatat SETIAP keputusan akses. Jika gagal menulis, error dilempar -> request tidak diteruskan (fail closed).
function log({ subjek, endpoint, device, hasil, alasan }) {
  insert.run(new Date().toISOString(), subjek || 'anonymous', endpoint, device || null, hasil, alasan);
}

module.exports = { log };
