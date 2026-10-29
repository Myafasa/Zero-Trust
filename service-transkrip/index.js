const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const { guard, requireRole } = require('../shared/guard');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(guard);

const huruf = (n) => (n >= 80 ? 'A' : n >= 70 ? 'B' : n >= 60 ? 'C' : n >= 50 ? 'D' : 'E');
const bobot = { A: 4, B: 3, C: 2, D: 1, E: 0 };

app.get('/transkrip/:nim', requireRole('mahasiswa', 'admin'), (req, res) => {
  if (req.auth.role === 'mahasiswa') {
    const me = db.prepare('SELECT nim FROM users WHERE id = ?').get(Number(req.auth.sub));
    if (!me || me.nim !== req.params.nim)
      return res.status(403).json({ error: 'Mahasiswa hanya boleh melihat transkrip NIM sendiri' });
  }
  const mk = db.prepare(
    'SELECT kode_mk, nama_mk, sks, nilai, huruf, synced_at FROM transkrip WHERE nim = ? ORDER BY kode_mk'
  ).all(req.params.nim);
  const sks = mk.reduce((a, r) => a + r.sks, 0);
  const ipk = sks ? mk.reduce((a, r) => a + bobot[r.huruf] * r.sks, 0) / sks : null;
  res.json({ nim: req.params.nim, total_sks: sks, ipk: ipk === null ? null : Number(ipk.toFixed(2)), mata_kuliah: mk });
});

app.post('/transkrip/sinkron', requireRole('service'), (req, res) => {
  const { kelas_id, entries } = req.body || {};
  if (!Number.isInteger(kelas_id) || !Array.isArray(entries) || entries.length === 0 || entries.length > 500)
    return res.status(400).json({ error: 'kelas_id (integer) dan entries (array) wajib' });

  const check = db.prepare(
    `SELECT n.nilai, n.status, k.kode, k.nama, k.sks
     FROM nilai n JOIN users u ON u.id = n.mahasiswa_id JOIN kelas k ON k.id = n.kelas_id
     WHERE u.nim = ? AND n.kelas_id = ?`
  );
  const upsert = db.prepare(
    `INSERT INTO transkrip (nim,kelas_id,kode_mk,nama_mk,sks,nilai,huruf,synced_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(nim,kelas_id) DO UPDATE SET nilai=excluded.nilai, huruf=excluded.huruf, synced_at=excluded.synced_at`
  );

  try {
    db.transaction(() => {
      const t = new Date().toISOString();
      for (const e of entries) {
        if (!e || typeof e.nim !== 'string' || typeof e.nilai !== 'number') throw new Error('format entry tidak valid');
        const row = check.get(e.nim, kelas_id);
        if (!row) throw new Error(`nilai ${e.nim} di kelas ${kelas_id} tidak ditemukan`);
        if (row.status !== 'final') throw new Error(`nilai ${e.nim} belum final`);
        if (row.nilai !== e.nilai) throw new Error(`nilai ${e.nim} tidak cocok dengan database`);
        upsert.run(e.nim, kelas_id, row.kode, row.nama, row.sks, row.nilai, huruf(row.nilai), t);
      }
    })();
  } catch (e) {
    return res.status(422).json({ error: `Sinkron ditolak: ${e.message}` });
  }
  res.json({ message: 'Transkrip disinkronkan', jumlah: entries.length });
});

app.use((req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Kesalahan internal' });
});

app.listen(config.ports.transkrip, '127.0.0.1', () => console.log(`[transkrip] Service Transkrip di :${config.ports.transkrip}`));
