const config = require('../shared/config');
const GW = config.urls.gateway;
let pass = 0;
let failN = 0;

async function call(method, path, { token, device, body, base = GW, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (device) h['X-Device-ID'] = device;
  if (body) h['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await r.json();
  } catch {}

  return { status: r.status, data };
}
function expect(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`);
  cond ? pass++ : failN++;
}
const login = (u, d) => call('POST', '/auth/login', { body: { username: u, password: 'password123' }, device: d });

(async () => {
  const mhs1 = await login('mhs1', 'DEV-MHS-001');
  const dosen1 = await login('dosen1', 'DEV-DOSEN-001');
  const dosen2 = await login('dosen2', 'DEV-DOSEN-002');
  const admin = await login('admin1', 'DEV-ADMIN-001');
  expect('login valid (4 role)', [mhs1, dosen1, dosen2, admin].every((r) => r.status === 200));
  const T = { m: mhs1.data.access_token, d1: dosen1.data.access_token, d2: dosen2.data.access_token, a: admin.data.access_token };

  expect('login password salah -> 401', (await call('POST', '/auth/login', { body: { username: 'mhs1', password: 'x' }, device: 'DEV-MHS-001' })).status === 401);
  expect('login device tidak terdaftar -> 403', (await login('mhs1', 'DEV-LAIN')).status === 403);
  expect('login tanpa device -> 400', (await login('mhs1', undefined)).status === 400);

  expect('tanpa token -> 401', (await call('GET', '/nilai', { device: 'DEV-MHS-001' })).status === 401);
  expect('token palsu -> 401', (await call('GET', '/nilai', { token: 'abc.def.ghi', device: 'DEV-MHS-001' })).status === 401);
  expect('token tanpa device -> 403', (await call('GET', '/nilai', { token: T.m })).status === 403);
  expect('device milik user lain -> 403', (await call('GET', '/nilai', { token: T.m, device: 'DEV-MHS-002' })).status === 403);

  const nm = await call('GET', '/nilai', { token: T.m, device: 'DEV-MHS-001' });
  expect('mahasiswa hanya nilai sendiri', nm.status === 200 && nm.data.length === 2 && nm.data.every((r) => r.nim === '247001001'), JSON.stringify(nm));
  expect('mahasiswa PUT nilai -> 403', (await call('PUT', '/nilai/1', { token: T.m, device: 'DEV-MHS-001', body: { nilai: 100 } })).status === 403);
  expect('admin GET /nilai -> 403', (await call('GET', '/nilai', { token: T.a, device: 'DEV-ADMIN-001' })).status === 403);

  const nd = await call('GET', '/nilai', { token: T.d1, device: 'DEV-DOSEN-001' });
  expect('dosen1 hanya kelas 1', nd.status === 200 && nd.data.length === 3 && nd.data.every((r) => r.kelas_id === 1));
  expect('dosen1 minta kelas 2 -> 403', (await call('GET', '/nilai?kelas_id=2', { token: T.d1, device: 'DEV-DOSEN-001' })).status === 403);
  expect('dosen1 PUT nilai kelas 2 (id 4) -> 403', (await call('PUT', '/nilai/4', { token: T.d1, device: 'DEV-DOSEN-001', body: { nilai: 99 } })).status === 403);
  expect('dosen1 PUT nilai kelas 1 -> 200', (await call('PUT', '/nilai/1', { token: T.d1, device: 'DEV-DOSEN-001', body: { nilai: 90 } })).status === 200);
  expect('dosen2 finalisasi kelas 1 -> 403', (await call('POST', '/kelas/1/finalisasi', { token: T.d2, device: 'DEV-DOSEN-002' })).status === 403);

  const direct1 = await call('GET', '/nilai', { base: config.urls.nilai, token: T.m });
  expect('akses langsung service tanpa secret -> 403', direct1.status === 403);
  const direct2 = await call('GET', '/nilai', { base: config.urls.nilai, headers: { 'X-Gateway-Secret': config.gatewaySecret } });
  expect('gateway secret tanpa token -> 401', direct2.status === 401);
  const direct3 = await call('GET', '/nilai', { base: config.urls.nilai, token: 'x.y.z', headers: { 'X-Gateway-Secret': config.gatewaySecret } });
  expect('gateway secret + token palsu -> 401', direct3.status === 401);

  const body = { kelas_id: 1, entries: [{ nim: '247001001', nilai: 90 }] };
  expect('token user (admin) POST sinkron -> 403', (await call('POST', '/transkrip/sinkron', { token: T.a, device: 'DEV-ADMIN-001', body })).status === 403);
  expect('token user (dosen) POST sinkron -> 403', (await call('POST', '/transkrip/sinkron', { token: T.d1, device: 'DEV-DOSEN-001', body })).status === 403);
  expect('/auth/service secret salah -> 401', (await call('POST', '/auth/service', { body: { client_id: 'service-nilai', client_secret: 'salah' } })).status === 401);
  const svc = await call('POST', '/auth/service', { body: { client_id: config.serviceClient.id, client_secret: config.serviceClient.secret } });
  expect('token service diterbitkan', svc.status === 200);
  expect('token service ke endpoint lain -> 403', (await call('GET', '/nilai', { token: svc.data.access_token })).status === 403);
  expect('sinkron data palsu (belum final) -> 422', (await call('POST', '/transkrip/sinkron', { token: svc.data.access_token, body })).status === 422);

  const fin = await call('POST', '/kelas/1/finalisasi', { token: T.d1, device: 'DEV-DOSEN-001' });
  expect('dosen1 finalisasi kelas 1 -> 200', fin.status === 200, JSON.stringify(fin));
  expect('PUT nilai final -> 403', (await call('PUT', '/nilai/1', { token: T.d1, device: 'DEV-DOSEN-001', body: { nilai: 50 } })).status === 403);
  const tr = await call('GET', '/transkrip/247001001', { token: T.m, device: 'DEV-MHS-001' });
  expect('transkrip mhs1 berisi hasil sinkron (IF101=90)', tr.status === 200 && tr.data.mata_kuliah[0]?.nilai === 90, JSON.stringify(tr));
  expect('mhs1 lihat transkrip mhs2 -> 403', (await call('GET', '/transkrip/247001002', { token: T.m, device: 'DEV-MHS-001' })).status === 403);
  expect('admin lihat transkrip mhs2 -> 200', (await call('GET', '/transkrip/247001002', { token: T.a, device: 'DEV-ADMIN-001' })).status === 200);

  const rt = mhs1.data.refresh_token;
  const ref = await call('POST', '/auth/refresh', { body: { refresh_token: rt }, device: 'DEV-MHS-001' });
  expect('refresh -> 200 (rotasi)', ref.status === 200);
  const reuse = await call('POST', '/auth/refresh', { body: { refresh_token: rt }, device: 'DEV-MHS-001' });
  expect('refresh token lama dipakai ulang -> 401', reuse.status === 401);
  const after = await call('POST', '/auth/refresh', { body: { refresh_token: ref.data.refresh_token }, device: 'DEV-MHS-001' });
  expect('reuse mencabut semua sesi (token baru ikut hangus) -> 401', after.status === 401);
  const l2 = await login('mhs2', 'DEV-MHS-002');
  expect('logout -> 200', (await call('POST', '/auth/logout', { body: { refresh_token: l2.data.refresh_token } })).status === 200);
  expect('refresh setelah logout -> 401', (await call('POST', '/auth/refresh', { body: { refresh_token: l2.data.refresh_token }, device: 'DEV-MHS-002' })).status === 401);

  const db = require('../shared/db');
  const n = db.prepare('SELECT COUNT(*) c, SUM(hasil=\'allow\') a, SUM(hasil=\'deny\') d FROM audit_log').get();
  expect('audit log terisi (allow & deny)', n.c > 30 && n.a > 0 && n.d > 0, JSON.stringify(n));

  console.log(`\n${pass} lulus, ${failN} gagal`);
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
