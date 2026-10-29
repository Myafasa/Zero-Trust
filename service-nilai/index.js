const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const { guard, requireRole } = require('../shared/guard');
const { withinAccessHours } = require('../shared/time');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(guard);

let cached = { token: null, exp: 0 };
async function getServiceToken() {
  if (cached.token && Date.now() < cached.exp - 30_000) return cached.token;
  const r = await fetch(`${config.urls.gateway}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.serviceClient.id, client_secret: config.serviceClient.secret }),
  });
  if (!r.ok) throw new Error(`gagal mengambil token service (${r.status})`);
  const data = await r.json();
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

app.get('/nilai', requireRole('mahasiswa', 'dosen'), (req, res) => {
  const uid = Number(req.auth.sub);
  let sql = `SELECT n.id, n.nilai, n.status, k.id AS kelas_id, k.kode, k.nama AS kelas, u.nim, u.nama AS mahasiswa
             FROM nilai n JOIN kelas k ON k.id = n.kelas_id JOIN users u ON u.id = n.mahasiswa_id`;
  const params = [];
  if (req.auth.role === 'mahasiswa') {
    sql += ' WHERE n.mahasiswa_id = ?';
    params.push(uid);
  } else {
    sql += ' WHERE k.dosen_id = ?';
    params.push(uid);
    if (req.query.kelas_id !== undefined) {
      sql += ' AND k.id = ?';
      params.push(Number(req.query.kelas_id));
    }
  }
  res.json(db.prepare(sql + ' ORDER BY k.id, u.nim').all(...params));
});

app.put('/nilai/:id', requireRole('dosen'), (req, res) => {
  if (!withinAccessHours()) return res.status(403).json({ error: 'Di luar jam akses perubahan nilai' });
  const v = req.body && req.body.nilai;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)
    return res.status(400).json({ error: 'nilai harus angka 0-100' });

  const row = db.prepare(
    'SELECT n.id, n.status, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?'
  ).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Nilai tidak ditemukan' });
  if (row.dosen_id !== Number(req.auth.sub)) return res.status(403).json({ error: 'Bukan dosen pengampu kelas ini' });
  if (row.status === 'final') return res.status(409).json({ error: 'Nilai sudah final' });

  db.prepare("UPDATE nilai SET nilai = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
    .run(v, new Date().toISOString(), row.id);
  res.json({ id: row.id, nilai: v, status: 'draft' });
});

app.post('/kelas/:id/finalisasi', requireRole('dosen'), async (req, res) => {
  if (!withinAccessHours()) return res.status(403).json({ error: 'Di luar jam akses finalisasi nilai' });

  const kelasId = Number(req.params.id);
  const kelas = db.prepare('SELECT id, dosen_id, kode FROM kelas WHERE id = ?').get(kelasId);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== Number(req.auth.sub)) return res.status(403).json({ error: 'Bukan dosen pengampu kelas ini' });

  const rows = db.prepare(
    'SELECT n.id, n.nilai, n.status, u.nim FROM nilai n JOIN users u ON u.id = n.mahasiswa_id WHERE n.kelas_id = ?'
  ).all(kelasId);
  if (rows.length === 0) return res.status(422).json({ error: 'Kelas belum punya peserta' });
  if (rows.some((r) => r.nilai === null)) return res.status(422).json({ error: 'Masih ada nilai yang kosong' });
  const drafts = rows.filter((r) => r.status === 'draft');
  if (drafts.length === 0) return res.status(409).json({ error: 'Kelas sudah difinalisasi' });

  const setStatus = db.prepare('UPDATE nilai SET status = ?, updated_at = ? WHERE id = ?');
  const markAll = db.transaction((status) => {
    const t = new Date().toISOString();
    for (const r of drafts) setStatus.run(status, t, r.id);
  });

  markAll('final');
  try {
    const token = await getServiceToken();
    const r = await fetch(`${config.urls.gateway}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kelas_id: kelasId, entries: rows.map((x) => ({ nim: x.nim, nilai: x.nilai })) }),
    });
    if (!r.ok) throw new Error(`sinkron ditolak (${r.status}): ${await r.text()}`);
  } catch (e) {
    markAll('draft');
    console.error('[nilai] finalisasi dibatalkan:', e.message);
    return res.status(502).json({ error: 'Sinkron ke transkrip gagal, finalisasi dibatalkan' });
  }
  res.json({ message: `Kelas ${kelas.kode} difinalisasi & disinkronkan ke transkrip`, jumlah: rows.length });
});

app.use((req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Kesalahan internal' });
});

app.listen(config.ports.nilai, '127.0.0.1', () => console.log(`[nilai] Service Nilai di :${config.ports.nilai}`));
