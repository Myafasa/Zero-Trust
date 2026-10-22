const db = require('../db/database');

function inAccessHours() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  return cur >= toMin(process.env.ACCESS_START) && cur < toMin(process.env.ACCESS_END);
}
const allow = (reason = 'ok') => ({ allow: true, reason });
const deny  = reason => ({ allow: false, reason });

exports.decide = function ({ subject, method, path }) {
  const role = subject.role;

  // POST /transkrip/sinkron -> hanya token service
  if (method === 'POST' && path === '/transkrip/sinkron')
    return role === 'service' ? allow() : deny('Hanya token service');

  if (role === 'service') return deny('Token service tidak boleh akses endpoint ini');

  // GET /transkrip/:nim
  let m = path.match(/^\/transkrip\/(\w+)$/);
  if (method === 'GET' && m) {
    if (role === 'admin') return allow('admin');
    if (role === 'mahasiswa') {
      const u = db.prepare('SELECT nim FROM users WHERE id=?').get(subject.sub);
      return u && u.nim === m[1] ? allow() : deny('Bukan NIM sendiri');
    }
    return deny('Role tidak diizinkan');
  }

  // PUT /nilai/:id
  m = path.match(/^\/nilai\/(\d+)$/);
  if (method === 'PUT' && m) {
    if (role !== 'dosen') return deny('Hanya dosen');
    const row = db.prepare(`SELECT n.is_final, k.dosen_id FROM nilai n
      JOIN kelas k ON k.id=n.kelas_id WHERE n.id=?`).get(m[1]);
    if (!row) return deny('Nilai tidak ditemukan');
    if (row.dosen_id !== Number(subject.sub)) return deny('Bukan kelas yang diampu');
    if (row.is_final) return deny('Nilai sudah final');
    if (!inAccessHours()) return deny('Di luar jam akses');
    return allow();
  }

  // POST /kelas/:id/finalisasi
  m = path.match(/^\/kelas\/(\d+)\/finalisasi$/);
  if (method === 'POST' && m) {
    if (role !== 'dosen') return deny('Hanya dosen');
    const k = db.prepare('SELECT dosen_id FROM kelas WHERE id=?').get(m[1]);
    if (!k || k.dosen_id !== Number(subject.sub)) return deny('Bukan kelas yang diampu');
    if (!inAccessHours()) return deny('Di luar jam akses');
    return allow();
  }

  // GET /nilai (filter detail dilakukan di service berdasarkan user)
  if (method === 'GET' && path === '/nilai')
    return ['mahasiswa', 'dosen'].includes(role) ? allow() : deny('Role tidak diizinkan');

  return deny('Tidak ada kebijakan yang cocok (default deny)');
};