// POLICY ENGINE (PE) — memutuskan allow/deny berdasarkan: identitas token + atribut dari DATABASE + konteks (waktu).
// Prinsip: default deny. Mengembalikan { allow, reason, target }.
const db = require('../shared/db');
const { withinAccessHours } = require('../shared/time');

const q = {
  user: db.prepare('SELECT id, role, nim FROM users WHERE id = ?'),
  kelas: db.prepare('SELECT id, dosen_id FROM kelas WHERE id = ?'),
  nilai: db.prepare('SELECT n.id, n.status, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?'),
};

const ALLOW = (target, reason) => ({ allow: true, target, reason });
const DENY = (reason) => ({ allow: false, reason });

const JAM_MSG = 'di luar jam akses perubahan/finalisasi nilai';

// ---- aturan per endpoint (Tabel 3) ----
const rules = [
  {
    // Hanya token service. Token user mana pun (termasuk admin) ditolak.
    method: 'POST', re: /^\/transkrip\/sinkron\/?$/, target: 'transkrip', serviceOnly: true,
    check: ({ subject }) =>
      subject.role === 'service' ? ALLOW('transkrip', 'token service sah untuk sinkron transkrip')
                                 : DENY('sinkron transkrip hanya untuk token service'),
  },
  {
    method: 'GET', re: /^\/nilai\/?$/, target: 'nilai',
    check: ({ user, query }) => {
      if (user.role === 'mahasiswa') {
        if (query.mahasiswa_id !== undefined && String(query.mahasiswa_id) !== String(user.id))
          return DENY('mahasiswa hanya boleh melihat nilai miliknya');
        return ALLOW('nilai', 'mahasiswa melihat nilai sendiri');
      }
      if (user.role === 'dosen') {
        if (query.kelas_id !== undefined) {
          const k = q.kelas.get(Number(query.kelas_id));
          if (!k || k.dosen_id !== user.id) return DENY('kelas bukan yang diampu dosen');
        }
        return ALLOW('nilai', 'dosen melihat nilai kelas yang diampu');
      }
      return DENY(`role ${user.role} tidak berhak melihat nilai`);
    },
  },
  {
    method: 'PUT', re: /^\/nilai\/(\d+)\/?$/, target: 'nilai',
    check: ({ user, params, now }) => {
      if (user.role !== 'dosen') return DENY('hanya dosen yang boleh mengubah nilai');
      const n = q.nilai.get(Number(params[0]));
      if (!n) return DENY('data nilai tidak ditemukan');
      if (n.dosen_id !== user.id) return DENY('kelas bukan yang diampu dosen');
      if (n.status === 'final') return DENY('nilai sudah final');
      if (!withinAccessHours(now)) return DENY(JAM_MSG);
      return ALLOW('nilai', 'dosen pengampu, nilai belum final, dalam jam akses');
    },
  },
  {
    method: 'POST', re: /^\/kelas\/(\d+)\/finalisasi\/?$/, target: 'nilai',
    check: ({ user, params, now }) => {
      if (user.role !== 'dosen') return DENY('hanya dosen yang boleh memfinalisasi nilai');
      const k = q.kelas.get(Number(params[0]));
      if (!k) return DENY('kelas tidak ditemukan');
      if (k.dosen_id !== user.id) return DENY('kelas bukan yang diampu dosen');
      if (!withinAccessHours(now)) return DENY(JAM_MSG);
      return ALLOW('nilai', 'dosen pengampu, dalam jam akses');
    },
  },
  {
    method: 'GET', re: /^\/transkrip\/([A-Za-z0-9_-]+)\/?$/, target: 'transkrip',
    check: ({ user, params }) => {
      if (user.role === 'admin') return ALLOW('transkrip', 'admin boleh melihat semua transkrip');
      if (user.role === 'mahasiswa')
        return user.nim === params[0] ? ALLOW('transkrip', 'mahasiswa melihat transkrip sendiri')
                                      : DENY('mahasiswa hanya boleh melihat transkrip NIM sendiri');
      return DENY(`role ${user.role} tidak berhak melihat transkrip`);
    },
  },
];

/**
 * @param {{subject:{id:string,role:string,typ:string}, method:string, path:string, query:object, now?:Date}} req
 */
function decide({ subject, method, path, query = {}, now = new Date() }) {
  // Konteks identitas: user diverifikasi ulang ke DB (role di DB = sumber kebenaran).
  let user = null;
  if (subject.typ === 'access') {
    user = q.user.get(Number(subject.id));
    if (!user) return DENY('user tidak ditemukan di database');
    if (user.role !== subject.role) return DENY('role pada token tidak sesuai database');
  }

  for (const r of rules) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    // Token service hanya sah untuk rule bertanda serviceOnly
    if (subject.typ === 'service' && !r.serviceOnly) return DENY('token service tidak boleh mengakses endpoint ini');
    return r.check({ subject, user, params: m.slice(1), query, now });
  }
  return DENY('endpoint tidak dikenal (default deny)');
}

module.exports = { decide };
