const db = require('../shared/db');
const [a1, a2] = process.argv.slice(2);

if (a1 === 'summary') {
  console.table(db.prepare('SELECT hasil, alasan, COUNT(*) AS jumlah FROM audit_log GROUP BY hasil, alasan ORDER BY hasil, jumlah DESC').all());
} else {
  const limit = Number(a1) || 30;
  const hasil = a2 === 'allow' || a2 === 'deny' ? a2 : null;
  const rows = db.prepare(
    `SELECT id, waktu, subjek, endpoint, device, hasil, alasan FROM audit_log
     ${hasil ? 'WHERE hasil = ?' : ''} ORDER BY id DESC LIMIT ?`
  ).all(...(hasil ? [hasil, limit] : [limit]));
  console.table(rows.reverse());
}
