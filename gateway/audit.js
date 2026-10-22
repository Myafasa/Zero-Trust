const db = require('../db/database');
exports.log = ({ subjek, endpoint, device, hasil, alasan }) =>
  db.prepare('INSERT INTO audit_log (waktu,subjek,endpoint,device,hasil,alasan) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), subjek, endpoint, device || '-', hasil, alasan);