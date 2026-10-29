const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../shared/config');
const db = require('../shared/db');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const hash = (p) => bcrypt.hashSync(p, 10);
const PASSWORD = 'password123';

const addUser = db.prepare('INSERT INTO users (username,password_hash,nama,role,nim) VALUES (?,?,?,?,?)');
const addDevice = db.prepare('INSERT INTO devices (user_id,device_id) VALUES (?,?)');

const users = [
  ['admin1',  'Nimda',       'admin',     null,        'DEV-ADMIN-001'],
  ['dosen1',  'Dr. Doom',  'dosen',     null,        'DEV-DOSEN-001'],
  ['dosen2',  'Dr. Lionel Messi','dosen',     null,        'DEV-DOSEN-002'],
  ['mhs1',    'Andi Pratama',      'mahasiswa', '247006001', 'DEV-MHS-001'],
  ['mhs2',    'Bundi Sudarsono',     'mahasiswa', '247006002', 'DEV-MHS-002'],
  ['mhs3',    'Dimas Mabar',     'mahasiswa', '247006003', 'DEV-MHS-003'],
];

const tx = db.transaction(() => {
  const id = {};
  for (const [username, nama, role, nim, device] of users) {
    const r = addUser.run(username, hash(PASSWORD), nama, role, nim);
    addDevice.run(r.lastInsertRowid, device);
    id[username] = Number(r.lastInsertRowid);
  }

  const addKelas = db.prepare('INSERT INTO kelas (kode,nama,sks,dosen_id) VALUES (?,?,?,?)');
  const k1 = Number(addKelas.run('IF101', 'Basis Data', 3, id.dosen1).lastInsertRowid);
  const k2 = Number(addKelas.run('IF102', 'Keamanan Informasi', 3, id.dosen2).lastInsertRowid);

  const addNilai = db.prepare("INSERT INTO nilai (kelas_id,mahasiswa_id,nilai,status,updated_at) VALUES (?,?,?,'draft',?)");
  const now = new Date().toISOString();
  const seedScores = { mhs1: [85, 78], mhs2: [72, 90], mhs3: [64, 81] };
  for (const m of ['mhs1', 'mhs2', 'mhs3']) {
    addNilai.run(k1, id[m], seedScores[m][0], now);
    addNilai.run(k2, id[m], seedScores[m][1], now);
  }

  db.prepare('INSERT INTO service_clients (client_id,secret_hash,nama) VALUES (?,?,?)')
    .run(config.serviceClient.id, hash(config.serviceClient.secret), 'Service Nilai');
});
tx();

console.log('Seed selesai ->', config.dbPath);
console.table(users.map(([u, n, r, nim, d]) => ({ username: u, password: PASSWORD, role: r, nim: nim || '-', 'X-Device-ID': d })));
