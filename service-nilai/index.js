app.post('/kelas/:id/finalisasi', async (req, res) => {
  const kelasId = req.params.id;
  db.prepare('UPDATE nilai SET is_final=1 WHERE kelas_id=?').run(kelasId);

  // 1. minta token service lewat gateway
  const tok = await fetch(`http://localhost:${process.env.GATEWAY_PORT}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SERVICE_CLIENT_ID,
      client_secret: process.env.SERVICE_CLIENT_SECRET
    })
  }).then(r => r.json());

  // 2. panggil sinkron transkrip LEWAT GATEWAY (bukan langsung ke :3002)
  const data = db.prepare('SELECT mahasiswa_id, kelas_id, nilai FROM nilai WHERE kelas_id=?').all(kelasId);
  const r = await fetch(`http://localhost:${process.env.GATEWAY_PORT}/transkrip/sinkron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({ data })
  });
  res.json({ finalisasi: 'ok', sinkron: r.status });
});