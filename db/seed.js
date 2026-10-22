const db = require('./database');
const bcrypt = require('bcryptjs');

db.exec(`
DROP TABLE IF EXISTS audit_log; DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS transkrip; DROP TABLE IF EXISTS nilai;
DROP TABLE IF EXISTS kelas; DROP TABLE IF EXISTS devices; DROP TABLE IF EXISTS users;

CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, nama TEXT,
  password_hash TEXT, role TEXT CHECK(role IN ('mahasiswa','dosen','admin')), nim TEXT);
CREATE TABLE devices (id INTEGER PRIMARY KEY, user_id INTEGER, device_id TEXT);
CREATE TABLE kelas (id INTEGER PRIMARY KEY, nama_mk TEXT, dosen_id INTEGER);
CREATE TABLE nilai (id INTEGER PRIMARY KEY, kelas_id INTEGER, mahasiswa_id INTEGER,
  nilai REAL, is_final INTEGER DEFAULT 0);
CREATE TABLE transkrip (id INTEGER PRIMARY KEY, mahasiswa_id INTEGER, kelas_id INTEGER,
  nilai REAL, UNIQUE(mahasiswa_id, kelas_id));
CREATE TABLE refresh_tokens (token TEXT PRIMARY KEY, user_id INTEGER,
  expires_at INTEGER, revoked INTEGER DEFAULT 0);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY, waktu TEXT, subjek TEXT,
  endpoint TEXT, device TEXT, hasil TEXT, alasan TEXT);
`);

const hash = bcrypt.hashSync('password123', 10);
const addUser = db.prepare('INSERT INTO users (username,nama,password_hash,role,nim) VALUES (?,?,?,?,?)');
const addDev  = db.prepare('INSERT INTO devices (user_id,device_id) VALUES (?,?)');

const users = [
  ['admin1','Admin Prodi','admin',null,'DEV-ADMIN1'],
  ['dosen1','Dosen Satu','dosen',null,'DEV-DOSEN1'],
  ['dosen2','Dosen Dua','dosen',null,'DEV-DOSEN2'],
  ['mhs1','Mahasiswa Satu','mahasiswa','2201001','DEV-MHS1'],
  ['mhs2','Mahasiswa Dua','mahasiswa','2201002','DEV-MHS2'],
  ['mhs3','Mahasiswa Tiga','mahasiswa','2201003','DEV-MHS3'],
];
for (const [u,n,r,nim,dev] of users) {
  const id = addUser.run(u,n,hash,r,nim).lastInsertRowid;
  addDev.run(id, dev);
}
// kelas: id 1 diampu dosen1 (user id 2), id 2 diampu dosen2 (user id 3)
db.prepare('INSERT INTO kelas (nama_mk,dosen_id) VALUES (?,?)').run('Keamanan Informasi', 2);
db.prepare('INSERT INTO kelas (nama_mk,dosen_id) VALUES (?,?)').run('Basis Data', 3);
// nilai: isi beberapa baris untuk mhs di tiap kelas
const addNilai = db.prepare('INSERT INTO nilai (kelas_id,mahasiswa_id,nilai) VALUES (?,?,?)');
[[1,4,80],[1,5,75],[1,6,90],[2,4,85],[2,5,70],[2,6,88]].forEach(r => addNilai.run(...r));
console.log('Seed selesai');